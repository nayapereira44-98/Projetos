// Rota Certa (v2) — app de entrega por endereço com mapa, escaneamento, cronômetro e painel.
// Depende de ../rota-certa/core.js (global Core), Leaflet (global L, mapa) e ZXing (código de barras).
(() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const tail = tn => tn.slice(-5);
  const hhmm = t => new Date(t).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const dur = ms => { const m = Math.max(0, Math.round(ms / 60000)); const h = Math.floor(m / 60); return h ? `${h}h${String(m % 60).padStart(2, "0")}` : `${m} min`; };
  const clock = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map(v => String(v).padStart(2, "0")).join(":"); };
  const brl = v => (v == null || !isFinite(v) ? "–" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
  const store = {
    get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  const toast = msg => { const t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => (t.hidden = true), 2600); };
  const buzz = ms => { try { navigator.vibrate?.(ms); } catch {} };
  const ICON_CHECK = `<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>`;

  // Leitor .xlsx mínimo: lê o diretório central do zip e descompacta com DecompressionStream nativo.
  async function readXlsxFile(file) {
    const buf = new Uint8Array(await file.arrayBuffer());
    const dv = new DataView(buf.buffer);
    let eocd = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error("O arquivo não parece ser um .xlsx.");
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const entries = {};
    for (let k = 0; k < count; k++) {
      const method = dv.getUint16(p + 10, true), size = dv.getUint32(p + 20, true);
      const nLen = dv.getUint16(p + 28, true), xLen = dv.getUint16(p + 30, true), cLen = dv.getUint16(p + 32, true);
      const off = dv.getUint32(p + 42, true);
      const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nLen));
      entries[name] = { method, size, off };
      p += 46 + nLen + xLen + cLen;
    }
    const read = async name => {
      const e = entries[name];
      if (!e) return null;
      const start = e.off + 30 + dv.getUint16(e.off + 26, true) + dv.getUint16(e.off + 28, true);
      const raw = buf.subarray(start, start + e.size);
      if (e.method === 0) return new TextDecoder().decode(raw);
      const ds = new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      return await new Response(ds).text();
    };
    const xml = s => new DOMParser().parseFromString(s, "application/xml");
    const shared = [];
    const ss = await read("xl/sharedStrings.xml");
    if (ss) for (const si of xml(ss).getElementsByTagName("si")) shared.push([...si.getElementsByTagName("t")].map(t => t.textContent).join(""));
    const sheetName = Object.keys(entries).filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort()[0];
    const doc = xml(await read(sheetName));
    const rows = [];
    for (const r of doc.getElementsByTagName("row")) {
      const row = [];
      for (const c of r.getElementsByTagName("c")) {
        const ref = c.getAttribute("r") || "";
        const letters = ref.replace(/\d+/g, "");
        const ci = letters ? [...letters].reduce((s, ch) => s * 26 + ch.charCodeAt(0) - 64, 0) - 1 : row.length;
        const t = c.getAttribute("t"), v = c.getElementsByTagName("v")[0]?.textContent;
        let val = null;
        if (t === "s") val = shared[+v];
        else if (t === "inlineStr") val = [...c.getElementsByTagName("t")].map(x => x.textContent).join("");
        else if (t === "str" || t === "b") val = v ?? null;
        else if (v != null && v !== "") val = isNaN(+v) ? v : +v;
        row[ci] = val;
      }
      rows[(+r.getAttribute("r") || rows.length + 1) - 1] = row;
    }
    return Array.from(rows, r => r || []);
  }

  // ---------- estado ----------
  // D: rota do dia. ok: hora de cada entrega, por código SPX. sess: início e fim das entregas.
  let D = store.get("re:day", null), ok = {}, sess = {}, A = [], byKey = new Map(), byTn = new Map(), order = [];
  let fin = { pay: null, mode: "rota", price: 6.29, kml: 11, km: null, endTime: "18:00", ...store.get("re:fin", {}) };
  let hist = store.get("re:hist", []);
  let selKey = null, active = false;
  // Dias em que cada código apareceu numa planilha: o mesmo pacote em outro dia é nova tentativa.
  let seen = store.get("re:seen", {});
  const dayOf = t => new Date(t).toISOString().slice(0, 10);
  function markSeen(pkgs, t) {
    const d = dayOf(t);
    pkgs.forEach(p => { const l = seen[p.tn] || []; if (!l.includes(d)) seen[p.tn] = l.concat(d).sort(); });
    const cut = dayOf(Date.now() - 30 * 864e5);
    Object.keys(seen).forEach(k => { seen[k] = seen[k].filter(x => x >= cut); if (!seen[k].length) delete seen[k]; });
    store.set("re:seen", seen);
  }
  const attempt = p => (seen[p.tn] || []).filter(x => x <= dayOf(D?.createdAt || Date.now())).length || 1;
  const okKey = () => "re:ok:" + D.at, sessKey = () => "re:sess:" + D.at;
  const save = () => { store.set("re:day", D); store.set(okKey(), ok); store.set(sessKey(), sess); };
  const all = () => D.pkgs.concat(D.extra || []);
  const pkgDone = p => !!ok[p.tn];
  const addrDone = a => a.pkgs.every(pkgDone);
  const extra = p => p.address.split(",").slice(2).join(",").trim();
  const streetName = a => a.label.split(",")[0].trim();
  const PLATFORMS = {
    shopee: { name: "Shopee", cls: "shp" },
    ml: { name: "Mercado Livre", cls: "ml" },
    outro: { name: "Outro", cls: "other" },
  };
  const srcOf = p => p.src || "shopee";
  const platformsOf = a => [...new Set(a.pkgs.map(srcOf))];
  const pkgLabel = p => (p.src ? PLATFORMS[p.src]?.name || p.src : p.shopeeStop != null ? "Shopee " + p.shopeeStop : "Shopee, fora da rota");
  // Próximas paradas pendentes, na ordem do app, a partir da próxima (máximo que o Google Maps aceita num link).
  // Sacos: a entregadora separa os pacotes de 10 em 10 (1–10, 11–20…), pelo número da etiqueta da Shopee ou pelo número da parada no app.
  let bagMode = store.get("re:bag", "shopee");
  const range10 = n => { const s = Math.floor((n - 1) / 10) * 10 + 1; return `${s}–${s + 9}`; };
  const bagOf = (p, a) => {
    if (bagMode === "none") return "";
    if (p.src) return PLATFORMS[p.src]?.name || p.src;
    if (bagMode === "app") return range10((a || byTn.get(p.tn)).n);
    return p.shopeeStop != null ? range10(p.shopeeStop) : "sem nº";
  };
  const bagsOf = a => [...new Set(a.pkgs.filter(p => !pkgDone(p)).map(p => bagOf(p, a)).filter(Boolean))];
  const bagChip = a => (bagsOf(a).length ? `<span class="chip bag">Saco ${bagsOf(a).join(" + ")}</span>` : "");
  const nextLeg = (n = 10) => order.filter(a => !addrDone(a)).slice(0, n);
  const shopee = a => (a.shopeeStops.length ? "Shopee " + a.shopeeStops.join(" · ") : "") + (a.unseq ? (a.shopeeStops.length ? " · " : "") + "sem nº" : "");
  const nextAddr = () => order.find(a => !addrDone(a));

  function derive() {
    A = Core.buildAddresses(all());
    byKey = new Map(A.map(a => [a.key, a]));
    byTn = new Map();
    A.forEach(a => a.pkgs.forEach(p => byTn.set(p.tn, a)));
  }
  const orderOk = () => D.order && D.order.length === A.length && D.order.every(k => byKey.has(k));

  // Ordem só dos endereços pendentes, a partir de `startKey`; os já entregues ficam na frente.
  function plan(startKey) {
    const doneA = (orderOk() ? D.order.map(k => byKey.get(k)) : A).filter(addrDone);
    const pend = A.filter(a => !addrDone(a));
    if (!pend.length) { D.order = doneA.map(a => a.key); return; }
    const start = pend.some(a => a.key === startKey) ? startKey : pend.reduce((b, a) => ((a.shopeeStops[0] ?? 1e9) < (b.shopeeStops[0] ?? 1e9) ? a : b)).key;
    const r = Core.addressRoute(pend, start);
    D.order = doneA.concat(r.order).map(a => a.key);
    if (!D.km) D.km = r.km;
  }
  function numberOrder() {
    if (!orderOk()) plan(null);
    order = D.order.map(k => byKey.get(k));
    // "Ninguém atendeu": o endereço vai para o fim até ser entregue.
    const later = (D.later || []).filter(k => byKey.has(k) && !addrDone(byKey.get(k)));
    D.later = later;
    order = order.filter(a => !later.includes(a.key)).concat(later.map(k => byKey.get(k)));
    order.forEach((a, i) => (a.n = i + 1));
  }

  // ---------- planilha ----------
  $("file").addEventListener("change", async e => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const { pkgs } = Core.parseRows(await readXlsxFile(f));
      if (!pkgs.length) throw new Error("A planilha não tem pacotes com coordenadas.");
      const at = String(pkgs[0].at || f.name);
      if (D && D.at === at) {
        const before = new Set(D.pkgs.map(p => p.tn));
        const fresh = pkgs.filter(p => !before.has(p.tn)).length;
        D.pkgs = pkgs; D.file = f.name; derive();
        if (!active) { ok = store.get(okKey(), {}); sess = store.get(sessKey(), {}); }
        const nx = order.find(a => !addrDone(a));
        plan(nx && byKey.has(nx.key) ? nx.key : null);
        save(); start();
        toast(fresh ? `${fresh} pacote(s) novo(s) encaixados na rota` : "Planilha atualizada");
      } else if (D && !D.pkgs.length && active) {
        markSeen(pkgs, Date.now());
        Object.assign(D, { at, file: f.name, pkgs, order: null, km: null });
        derive(); plan(null); save(); start();
        toast(`Shopee somada à rota: ${pkgs.length} pacotes`);
      } else {
        markSeen(pkgs, Date.now());
        D = { at, file: f.name, pkgs, createdAt: Date.now(), order: null, km: null };
        ok = {}; sess = {}; fin.km = null; store.set("re:fin", fin);
        derive(); plan(null); save(); start();
        location.hash = "#mapa";
        toast(`${A.length} endereços · ${pkgs.length} pacotes`);
      }
    } catch (err) {
      toast(err.message || "Não consegui ler a planilha.");
    } finally { e.target.value = ""; }
  });

  function start() {
    active = true;
    $("resume").hidden = true;
    numberOrder();
    fillAjustes();
    if (!location.hash || location.hash === "#inicio") location.hash = "#mapa";
    route(); renderAll();
    if (map) { drawMarkers(true); }
  }

  // ---------- abas ----------
  const TABS = ["mapa", "lista", "painel", "ajustes"];
  function route() {
    let tab = location.hash.slice(1);
    if (!active) tab = "inicio";
    else if (!TABS.includes(tab)) tab = "mapa";
    ["inicio", ...TABS].forEach(t => ($("v-" + t).hidden = t !== tab));
    document.querySelectorAll(".tabbar a").forEach(a => (a.dataset.tab === tab ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
    if (tab === "mapa") { ensureMap(); setTimeout(() => map?.invalidateSize(), 50); }
  }
  window.addEventListener("hashchange", route);

  function renderAll() {
    if (!active) return;
    numberOrder();
    const done = all().filter(pkgDone).length;
    $("meta").textContent = `${order.filter(addrDone).length}/${order.length} paradas · ${done}/${all().length} pacotes`;
    $("bar").hidden = false; $("barFill").style.width = (done / all().length * 100).toFixed(1) + "%";
    renderTimer();
    renderSheet();
    renderList();
    renderPainel();
    if (map) updateMarkers();
  }

  // ---------- cronômetro ----------
  function renderTimer() {
    const t = $("timer");
    t.hidden = !active;
    if (!sess.start) { t.textContent = "Iniciar"; t.className = "timer"; }
    else if (!sess.end) { t.textContent = clock(Date.now() - sess.start); t.className = "timer run"; }
    else { t.textContent = "Fim " + dur(sess.end - sess.start); t.className = "timer"; }
  }
  $("timer").addEventListener("click", () => { if (active && !sess.start) startSession(); else location.hash = "#painel"; });
  function startSession() { sess = { start: Date.now() }; save(); renderAll(); toast("Entregas iniciadas. Bom trabalho!"); }
  setInterval(() => { if (active && sess.start && !sess.end) { renderTimer(); if (!$("v-painel").hidden) renderSession(); } }, 1000);

  // ---------- cartão do endereço ----------
  function addrCard(a, tn) {
    const nx = nextAddr();
    const pend = a.pkgs.filter(p => !pkgDone(p));
    const sameStreet = order.filter(x => x !== a && x.street === a.street && !addrDone(x)).sort((x, y) => x.num - y.num);
    const near = order.filter(x => x !== a && x.street !== a.street && !addrDone(x)).map(x => ({ x, d: Core.hav(a, x) })).filter(o => o.d <= 100).sort((p, q) => p.d - q.d).slice(0, 3);
    return `
      <div class="eyebrow">${a === nx ? "Próxima parada" : "Parada"} ${a.n} de ${order.length}${addrDone(a) ? " · entregue" : ""}</div>
      <div><div class="addr-big">${esc(a.label)}</div><div class="sub">${esc(a.bairro)}</div></div>
      <div class="chips">${navText(a)}${shopee(a) ? `<span class="chip shp">${shopee(a)}</span>` : ""}<span class="chip">${a.pkgs.length} pacote${a.pkgs.length > 1 ? "s" : ""}</span>${platformsOf(a).filter(k => k !== "shopee").map(k => `<span class="chip ${PLATFORMS[k]?.cls || "other"}">${esc(PLATFORMS[k]?.name || k)}</span>`).join("")}${addrDone(a) ? `<span class="chip ok">Entregue</span>` : ""}${a.pkgs.some(p => p.window) ? `<span class="chip warn">${a.pkgs.map(p => p.window).filter(Boolean).map(w => (w.until ? "até " + w.until : "após " + w.after)).join(" · ")}</span>` : ""}</div>
      ${platformsOf(a).length > 1 ? `<div class="together">Neste endereço tem entrega de ${platformsOf(a).map(k => PLATFORMS[k]?.name || k).join(" e ")}: ${platformsOf(a).map(k => `${a.pkgs.filter(p => srcOf(p) === k).length} ${PLATFORMS[k]?.name || k}`).join(", ")}.</div>` : ""}
      ${a.unseq ? `<div class="offroute">${a.unseq === a.pkgs.length ? "Este endereço está" : `${a.unseq} pacote${a.unseq > 1 ? "s" : ""} deste endereço ${a.unseq > 1 ? "estão" : "está"}`} <b>fora da rota da Shopee</b> (sem número de parada). No app da Shopee ${a.unseq > 1 ? "eles aparecem" : "ele aparece"} no topo da lista, longe da parada${a.shopeeStops.length ? " " + a.shopeeStops.join(" e ") : ""}.</div>` : ""}
      ${a.pkgs.length > 1 && pend.length ? `<div class="together">Este endereço tem ${a.pkgs.length} pacotes${a.shopeeStops.length > 1 ? ` de paradas diferentes da Shopee (${a.shopeeStops.join(" e ")})` : ""}. Entregue todos agora.</div>` : ""}
      <div class="pkgs">${a.pkgs.map(p => `<button type="button" class="pkg${pkgDone(p) ? " done" : ""}${p.tn === tn ? " me" : ""}" data-p="${esc(p.tn)}" aria-pressed="${pkgDone(p)}">
        <span class="box">${pkgDone(p) ? ICON_CHECK : ""}</span>
        <span class="t"><b>${esc(tail(p.tn))}</b> · ${esc(pkgLabel(p))}${bagOf(p, a) && bagMode !== "none" && !p.src ? ` · <span class="bagt">saco ${bagOf(p, a)}</span>` : ""}${attempt(p) > 1 ? ` · <span class="att">${attempt(p)}ª tentativa</span>` : ""}${extra(p) ? `<br><span class="sub">${esc(extra(p))}</span>` : ""}</span></button>`).join("")}</div>
      <div class="nav3">
        <a class="btn" href="${Core.links.waze(a)}" target="_blank" rel="noopener">Waze</a>
        <a class="btn" href="${Core.links.gmaps(a)}" target="_blank" rel="noopener">Google</a>
        <a class="btn" href="${Core.links.apple(a)}" target="_blank" rel="noopener">Apple</a>
      </div>
      ${a === nx && nextLeg().length > 1 ? `<a class="btn brand" href="${Core.links.gmapsLeg(nextLeg())}" target="_blank" rel="noopener">Próximas ${nextLeg().length} paradas no Google Maps (para o carro)</a>` : ""}
      ${pend.length && !(D.later || []).includes(a.key) ? `<button type="button" class="line" data-later="${esc(a.key)}">Ninguém atendeu: voltar depois</button>` : ""}
      ${(D.later || []).includes(a.key) && pend.length ? `<div class="offroute">Você marcou para voltar depois. Este endereço está no fim da fila.</div>` : ""}
      ${pend.length ? `<button type="button" class="primary deliver" data-a="${esc(a.key)}">Entreguei ${pend.length > 1 ? `os ${pend.length} pacotes` : "aqui"}</button>` : `<button type="button" class="line" data-a="${esc(a.key)}">Desfazer entrega</button>`}
      ${!sess.start ? `<button type="button" class="brand" data-start="1">Iniciar entregas (contar o tempo)</button>` : ""}
      ${sameStreet.length || near.length ? `<div class="street-more"><div class="eyebrow">Ainda nesta rua e por perto</div>
        ${sameStreet.map(x => `<button type="button" data-sel="${esc(x.key)}"><span><b>nº ${x.nums?.join(" / ") || "?"}</b> · parada ${x.n} · ${x.pkgs.length} pct${shopee(x) ? " · " + shopee(x) : ""}</span></button>`).join("")}
        ${near.map(({ x, d }) => `<button type="button" data-sel="${esc(x.key)}"><span><b>${esc(x.label)}</b> · ${Math.round(d)} m · parada ${x.n}</span></button>`).join("")}</div>` : ""}`;
  }

  function renderSheet() {
    const sh = $("sheet");
    let a = selKey && byKey.get(selKey);
    if (!a) a = nextAddr();
    if (!a) {
      sh.innerHTML = `<div class="grabwrap"><span class="grab"></span></div><div class="addr-big">Rota concluída</div>
        <p class="sub">${all().length} pacotes em ${order.length} endereços${sess.start && !sess.end ? ` em ${dur(Date.now() - sess.start)}` : ""}.</p>
        ${sess.start && !sess.end ? `<button type="button" class="primary deliver" data-end="1">Finalizar entregas</button>` : `<a class="btn brand" href="#painel">Ver meu painel</a>`}`;
      return;
    }
    sh.classList.toggle("open", sheetOpen);
    if (!sheetOpen) {
      const pend = a.pkgs.filter(p => !pkgDone(p));
      sh.innerHTML = `<button type="button" class="grabwrap" data-grab="1" aria-label="Abrir o cartão"><span class="grab"></span></button>
        <div class="mini${here && a === nextAddr() && Core.hav(here, a) < 60 ? " arrived" : ""}">
          <span class="mini-n ${a.pkgs.length > 1 ? "multi" : ""}">${a.n}</span>
          <button type="button" class="mini-body" data-grab="1">
            <b>${esc(a.label)}</b>
            <span class="chips">${navText(a)}${a.pkgs.length > 1 ? `<span class="chip count">${a.pkgs.length} pacotes</span>` : ""}${bagChip(a)}${shopee(a) ? `<span class="chip shp">${shopee(a)}</span>` : ""}${platformsOf(a).filter(k => k !== "shopee").map(k => `<span class="chip ${PLATFORMS[k]?.cls || "other"}">${esc(PLATFORMS[k]?.name || k)}</span>`).join("")}</span>
            <span class="mono sub">${a.pkgs.map(p => (pkgDone(p) ? "✓" : "") + esc(tail(p.tn))).join(" · ")}</span>
          </button>
        </div>
        <div class="mini-act">
          <a class="btn" href="${Core.links.waze(a)}" target="_blank" rel="noopener">Waze</a>
          ${pend.length ? `<button type="button" class="primary" data-a="${esc(a.key)}">Entreguei${pend.length > 1 ? ` os ${pend.length}` : ""}</button>` : `<button type="button" class="line" data-grab="1">Ver</button>`}
          <button type="button" class="line" data-grab="1" aria-label="Ver detalhes">Detalhes</button>
        </div>`;
      return;
    }
    sh.innerHTML = `<button type="button" class="grabwrap" data-grab="1" aria-label="Recolher o cartão"><span class="grab"></span></button>${addrCard(a)}`;
  }

  // ---------- mapa ----------
  // Como nos apps de entrega: GPS ligado, câmera enquadrando você e a próxima parada, caminho pelas ruas até ela,
  // só as próximas 10 em destaque e aviso quando você chega.
  let map = null, markers = new Map(), seqLine = null, pathLine = null, me = null, accCircle = null, watchId = null, here = null, fitted = false;
  let sheetOpen = false, bigMap = false, follow = true, showDone = store.get("re:showDone", false);
  let nav = { key: null }, arrivedKey = null, gpsWarned = false;
  const brand = () => getComputedStyle(document.documentElement).getPropertyValue("--brand").trim() || "#1f5f3a";
  const fmtDist = m => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km`);
  const upcoming = () => order.filter(a => !addrDone(a)).slice(0, 10);
  function ensureMap() {
    if (map || !window.L || !active) return;
    map = L.map("map", { zoomControl: false });
    map.on("click", onMapPin);
    map.on("dragstart", () => { if (here) { follow = false; $("btnRecenter").hidden = false; } });
    if (window.ResizeObserver) new ResizeObserver(() => map.invalidateSize()).observe($("map"));
    const sheetH = () => $("v-mapa").style.setProperty("--sheet-h", ($("sheet").hidden ? 0 : $("sheet").offsetHeight) + "px");
    if (window.ResizeObserver) new ResizeObserver(sheetH).observe($("sheet"));
    sheetH();
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
    drawMarkers(true);
    startGps(true);
  }
  function pinHtml(a) {
    const nx = nextAddr(), up = upcoming();
    const cls = addrDone(a) ? "done" : a === nx ? "next" : !up.includes(a) ? "far" : a.pkgs.length > 1 ? "multi" : "";
    const left = a.pkgs.filter(p => !pkgDone(p)).length;
    const size = cls === "next" ? 46 : cls === "far" ? 26 : 34;
    return L.divIcon({ className: "", html: `<div class="pin ${cls}${a.key === selKey ? " sel" : ""}">${addrDone(a) ? "✓" : a.n}${left > 1 ? `<span class="cnt">${left}</span>` : ""}</div>`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
  }
  const visibleStops = () => order.filter(a => showDone || !addrDone(a));
  function drawMarkers(fit) {
    if (!map) return;
    markers.forEach(m => m.remove()); markers.clear();
    visibleStops().forEach(a => {
      const m = L.marker([a.lat, a.lng], { icon: pinHtml(a), zIndexOffset: zOf(a) }).addTo(map);
      // Marcando local de um pacote novo: tocar num pino coloca o pacote no mesmo endereço.
      m.on("click", () => (pinMode ? onMapPin({ latlng: L.latLng(a.lat, a.lng) }) : select(a.key, false)));
      markers.set(a.key, m);
    });
    drawLine();
    if (fit && order.length && !fitted) { map.fitBounds(L.latLngBounds(order.map(a => [a.lat, a.lng])), { padding: [40, 40] }); fitted = true; }
  }
  const zOf = a => (addrDone(a) ? 0 : a === nextAddr() ? 1000 : upcoming().includes(a) ? 600 : 300);
  // Linha tracejada só pelas próximas 10 paradas: o resto do dia não polui o mapa.
  function drawLine() {
    seqLine?.remove();
    const pts = upcoming().map(a => [a.lat, a.lng]);
    seqLine = pts.length > 1 ? L.polyline(pts, { color: brand(), weight: 3, opacity: 0.5, dashArray: "2 8", lineCap: "round" }).addTo(map) : null;
  }
  function updateMarkers() {
    if (!map) return;
    const keys = visibleStops().map(a => a.key);
    if (keys.length !== markers.size || keys.some(k => !markers.has(k))) return drawMarkers(false);
    visibleStops().forEach(a => { const m = markers.get(a.key); m.setIcon(pinHtml(a)); m.setZIndexOffset(zOf(a)); });
    drawLine();
  }
  // Enquadra você e a próxima parada, deixando espaço para o cartão de baixo.
  function frame() {
    if (!map) return;
    const nx = nextAddr();
    const bottom = ($("sheet").hidden ? 0 : $("sheet").offsetHeight) + 30;
    if (here && nx) map.fitBounds(L.latLngBounds([[here.lat, here.lng], [nx.lat, nx.lng]]), { paddingTopLeft: [50, 90], paddingBottomRight: [50, bottom], maxZoom: 18 });
    else if (nx) map.setView([nx.lat, nx.lng], 17);
    $("btnRecenter").hidden = true;
  }
  function select(key, pan = true) {
    selKey = key;
    location.hash = "#mapa";
    sheetOpen = true; bigMap = false; $("sheet").hidden = false;
    renderSheet(); updateMarkers();
    const a = byKey.get(key);
    if (map && a && pan) { follow = false; if (here) $("btnRecenter").hidden = false; map.setView([a.lat, a.lng], Math.max(map.getZoom(), 17)); }
  }
  $("btnBig").addEventListener("click", () => {
    bigMap = !bigMap; $("sheet").hidden = bigMap; $("btnBig").classList.toggle("on", bigMap);
    $("v-mapa").style.setProperty("--sheet-h", (bigMap ? 0 : $("sheet").offsetHeight) + "px");
    if (follow) setTimeout(frame, 50);
  });
  $("btnFit").addEventListener("click", () => {
    if (!map || !order.length) return;
    follow = false; if (here) $("btnRecenter").hidden = false;
    map.fitBounds(L.latLngBounds(visibleStops().concat(here ? [here] : []).map(a => [a.lat, a.lng])), { padding: [40, 40] });
  });
  $("btnRecenter").addEventListener("click", () => { follow = true; selKey = null; renderSheet(); frame(); });

  // GPS: liga sozinho ao abrir o mapa (o celular pede permissão uma vez).
  function startGps(auto) {
    if (watchId != null || !navigator.geolocation) return;
    if (auto && store.get("re:gpsOff", false)) return;
    $("btnLocate").classList.add("on");
    // Só desliga se a permissão for negada; falha momentânea (túnel, prédio) não interrompe.
    watchId = navigator.geolocation.watchPosition(onPos, err => {
      if (err.code === 1) { stopGps(false); if (!gpsWarned) { gpsWarned = true; toast("Sem permissão de localização. Libere para este site nos ajustes do celular."); } }
    }, { enableHighAccuracy: true, maximumAge: 3000 });
  }
  function stopGps(remember) {
    if (watchId != null) navigator.geolocation.clearWatch(watchId);
    watchId = null; here = null; me?.remove(); me = null; accCircle?.remove(); accCircle = null; pathLine?.remove(); pathLine = null;
    $("btnLocate").classList.remove("on");
    if (remember) store.set("re:gpsOff", true);
    renderSheet();
  }
  function onPos(pos) {
    const first = !here;
    here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    if (map) {
      const ll = [here.lat, here.lng];
      if (!me) me = L.marker(ll, { icon: L.divIcon({ className: "", html: `<div class="me-dot"></div>`, iconSize: [22, 22], iconAnchor: [11, 11] }), zIndexOffset: 2000, interactive: false }).addTo(map);
      else me.setLatLng(ll);
      if (!accCircle) accCircle = L.circle(ll, { radius: pos.coords.accuracy, color: "#1c7ed6", weight: 1, opacity: 0.4, fillOpacity: 0.08, interactive: false }).addTo(map);
      else accCircle.setLatLng(ll).setRadius(pos.coords.accuracy);
      if (follow || first) frame();
    }
    updateNav(false);
  }
  $("btnLocate").addEventListener("click", () => {
    if (watchId == null) { store.set("re:gpsOff", false); follow = true; startGps(false); toast("Localização ligada"); return; }
    if (!follow) { follow = true; frame(); return; }
    stopGps(true); toast("Localização desligada");
  });

  // Caminho pelas ruas até a próxima parada (OSRM), recalculado quando você anda 60 m ou a parada muda.
  async function updateNav(force) {
    const nx = nextAddr();
    if (!map || !here || !nx) { pathLine?.remove(); pathLine = null; return; }
    const d = Core.hav(here, nx);
    if (d < 40 && arrivedKey !== nx.key) {
      arrivedKey = nx.key; buzz([120, 60, 120]);
      selKey = null; sheetOpen = false; renderSheet();
      toast(`Você chegou: ${nx.label}`);
    }
    if (!force && nav.key === nx.key && nav.from && Core.hav(nav.from, here) < 60 && Date.now() - nav.at < 60000) { renderSheet(); return; }
    nav = { key: nx.key, from: { ...here }, at: Date.now(), m: d * Core.STREET_FACTOR, s: null };
    let coords = [[here.lat, here.lng], [nx.lat, nx.lng]];
    try {
      const r = await (await fetch(`https://router.project-osrm.org/route/v1/driving/${here.lng},${here.lat};${nx.lng},${nx.lat}?overview=full&geometries=geojson`)).json();
      const rt = r.routes?.[0];
      if (rt && nav.key === nx.key) { nav.m = rt.distance; nav.s = rt.duration; coords = rt.geometry.coordinates.map(([x, y]) => [y, x]); }
    } catch {}
    if (nav.key !== nx.key) return;
    pathLine?.remove();
    pathLine = L.polyline(coords, { color: brand(), weight: 6, opacity: 0.85, lineCap: "round", lineJoin: "round" }).addTo(map);
    renderSheet();
  }
  // Texto "a 600 m · 3 min" para o cartão.
  function navText(a) {
    if (!here || nav.key !== a.key) return "";
    const live = Core.hav(here, a);
    if (live < 60) return `<span class="chip arrived">Você chegou</span>`;
    const m = Math.max(live, Math.min(nav.m || live, live * 2));
    return `<span class="chip dist">${fmtDist(m)}${nav.s ? ` · ${Math.max(1, Math.round(nav.s / 60))} min` : ""}</span>`;
  }

  // ---------- ações ----------
  function deliverAddr(a) {
    const done = addrDone(a);
    if (!done && !sess.start) { sess = { start: Date.now() }; toast("Cronômetro iniciado"); }
    a.pkgs.forEach(p => (done ? delete ok[p.tn] : (ok[p.tn] = ok[p.tn] || Date.now())));
    save();
    if (!done) {
      buzz(60);
      selKey = null; sheetOpen = false;
      const nx = nextAddr();
      renderAll();
      if (nx) {
        toast(`Entregue! Próxima: ${nx.label}`);
        if (map) { if (here) { follow = true; frame(); } else map.panTo([nx.lat, nx.lng]); }
        updateNav(true);
      }
      else toast("Todos os pacotes entregues!");
    } else renderAll();
  }
  document.addEventListener("click", e => {
    const t = e.target.closest("button, [data-sel]");
    if (e.target.id === "scanOverlay") { $("scanOverlay").hidden = true; return; }
    if (!t) return;
    const d = t.dataset;
    if (d.resume === "go") { derive(); ok = store.get(okKey(), {}); sess = store.get(sessKey(), {}); start(); return; }
    if (d.resume === "clear" || t.id === "clear") return twoTap(t, clearDay);
    if (d.importGo) return void runImport();
    if (d.close) { $("scanOverlay").hidden = true; return; }
    if (!active) return;
    if (d.a) { deliverAddr(byKey.get(d.a)); if (t.closest("#scanSheet")) $("scanOverlay").hidden = true; }
    else if (d.p) {
      const tn = d.p;
      if (!ok[tn] && !sess.start) sess = { start: Date.now() };
      ok[tn] ? delete ok[tn] : (ok[tn] = Date.now());
      save(); renderAll();
      if (t.closest("#scanSheet")) openScan(byTn.get(tn), tn);
    }
    else if (d.sel) { $("scanOverlay").hidden = true; select(d.sel); }
    else if (d.grab) { sheetOpen = !sheetOpen; renderSheet(); }
    else if (d.later) {
      D.later = (D.later || []).filter(k => k !== d.later).concat(d.later);
      selKey = null; save(); renderAll();
      const nx = nextAddr(); if (nx && map) map.panTo([nx.lat, nx.lng]);
      toast("Endereço movido para o fim. Siga para a próxima.");
    }
    else if (d.add) openAdd();
    else if (d.place != null) {
      const p = (D.unplaced || [])[+d.place]; if (!p) return;
      D.unplaced.splice(+d.place, 1); save();
      addDraft = { src: p.src, address: p.address, compl: "", code: p.code || p.tn, lat: null, lng: null };
      openAdd(true);
    }
    else if (d.addsave) saveAdd();
    else if (d.geo != null) pickGeo(+d.geo);
    else if (d.pin) startPin();
    else if (d.rmextra) { D.extra = (D.extra || []).filter(p => p.tn !== d.rmextra); delete ok[d.rmextra]; derive(); plan(nextAddr()?.key); save(); fillAjustes(); drawMarkers(false); renderAll(); toast("Pacote removido"); }
    else if (d.start) startSession();
    else if (d.end) endSession();
    else if (d.reopen) { delete sess.end; save(); renderAll(); toast("Cronômetro retomado"); }
    else if (d.close) $("scanOverlay").hidden = true;
  });
  function twoTap(t, fn) {
    if (t.dataset.armed) return fn();
    const l = t.textContent; t.dataset.armed = "1"; t.textContent = "Toque de novo para confirmar";
    setTimeout(() => { delete t.dataset.armed; t.textContent = l; }, 4000);
  }
  function clearDay() {
    if (D) { store.set(okKey(), null); store.set(sessKey(), null); }
    store.set("re:day", null);
    D = null; ok = {}; sess = {}; active = false; selKey = null;
    markers.forEach(m => m.remove()); markers.clear(); seqLine?.remove(); pathLine?.remove(); fitted = false; nav = { key: null };
    $("meta").textContent = "Abra a planilha da rota para começar"; $("timer").hidden = true; $("bar").hidden = true;
    location.hash = "#inicio"; route();
    toast("Pronto. Abra a planilha para começar.");
  }

  // ---------- lista ----------
  function renderList() {
    const q = $("q").value.trim();
    let rows = order;
    if (q) {
      const norm = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
      if (/^\d{1,3}$/.test(q)) rows = order.filter(a => a.shopeeStops.includes(+q));
      else {
        const m = new Set(Core.matchTN(all(), q).map(p => byTn.get(p.tn)));
        rows = order.filter(a => m.has(a) || norm(a.label).includes(norm(q)));
      }
    }
    const nx = nextAddr();
    let html = "";
    for (let i = 0; i < rows.length;) {
      let j = i; while (j < rows.length && rows[j].street === rows[i].street && rows[j].n - rows[i].n === j - i) j++;
      const g = rows.slice(i, j), pk = g.reduce((t, a) => t + a.pkgs.length, 0), left = g.filter(a => !addrDone(a)).length;
      html += `<div class="street"><div class="street-head"><b>${esc(streetName(g[0]))}</b><span>${esc(g[0].bairro)} · ${pk} pct${left ? ` · faltam ${left}` : " · feita"}</span></div>
        ${g.map(a => `<button type="button" class="row${addrDone(a) ? " done" : ""}${a === nx ? " next" : ""}" data-sel="${esc(a.key)}">
          <span class="n">${addrDone(a) ? "✓" : a.n}</span>
          <span><span class="num">${a.nums?.length ? "nº " + a.nums.join(" / ") : esc(a.label)}</span><br><span class="sub">${[shopee(a), ...platformsOf(a).filter(k => k !== "shopee").map(k => PLATFORMS[k]?.name || k)].filter(Boolean).join(" · ") || "fora da rota"}${a.pkgs.some(p => attempt(p) > 1) ? " · <b class=\"att\">nova tentativa</b>" : ""} · <span class="mono">${a.pkgs.map(p => esc(tail(p.tn))).join(" ")}</span></span></span>
          <span class="count">${a.pkgs.length}${bagsOf(a).length ? `<br><small>${bagsOf(a).join("+")}</small>` : ""}</span></button>`).join("")}</div>`;
      i = j;
    }
    const leg = nextLeg();
    $("legBtn").hidden = leg.length < 2;
    if (leg.length > 1) { $("legBtn").href = Core.links.gmapsLeg(leg); $("legBtn").textContent = `Próximas ${leg.length} paradas no Google Maps (${leg[0].n} a ${leg[leg.length - 1].n})`; }
    $("list").innerHTML = html || `<p class="empty-list">Nada encontrado para "${esc(q)}".</p>`;
  }
  $("q").addEventListener("input", renderList);

  // ---------- painel ----------
  function stats() {
    const now = sess.end || Date.now();
    const elapsed = sess.start ? now - sess.start : 0;
    const doneA = order.filter(addrDone).length, doneP = all().filter(pkgDone).length;
    const leftA = order.length - doneA;
    const perAddr = doneA ? elapsed / doneA : null;
    const pkgsPerAddr = all().length / order.length;
    const finish = perAddr && !sess.end ? Date.now() + perAddr * leftA : null;
    const km = fin.km ?? +(((D.km || 0) / 1000).toFixed(1));
    const gainShopee = fin.pay ? (fin.mode === "pacote" ? fin.pay * D.pkgs.filter(pkgDone).length : fin.pay) : 0;
    const gain = fin.pay || fin.payMl ? gainShopee + (fin.payMl || 0) : null;
    const fuel = fin.kml > 0 && fin.price ? km / fin.kml * fin.price : 0;
    const profit = gain != null ? gain - fuel : null;
    const hours = elapsed / 3.6e6;
    return { elapsed, doneA, doneP, leftA, perAddr, pkgsPerAddr, finish, km, gain, fuel, profit, hours };
  }
  function renderSession() {
    const s = stats();
    $("session").innerHTML = !sess.start
      ? `<h2>Pronto para começar?</h2><p>Toque quando sair para a primeira entrega. O app conta o tempo e monta o seu painel.</p><button type="button" data-start="1">Iniciar entregas</button>`
      : !sess.end
        ? `<div class="eyebrow" style="color:inherit;opacity:.85">Entregando desde ${hhmm(sess.start)}</div><div class="clock">${clock(s.elapsed)}</div><button type="button" class="stop" data-end="1">Finalizar entregas</button>`
        : `<div class="eyebrow" style="color:inherit;opacity:.85">Entregas de ${hhmm(sess.start)} às ${hhmm(sess.end)}</div><div class="clock">${dur(s.elapsed)}</div><button type="button" data-reopen="1">Retomar cronômetro</button>`;
  }
  function renderPainel() {
    renderSession();
    const s = stats();
    $("kpis").innerHTML = [
      [`${s.doneP}/${all().length}`, "pacotes entregues"],
      [`${s.doneA}/${order.length}`, "paradas feitas"],
      [s.perAddr ? dur(s.perAddr) : "–", "tempo médio por parada"],
      [s.hours > 0.05 ? (s.doneP / s.hours).toFixed(1) : "–", "pacotes por hora"],
    ].map(([b, l]) => `<div class="kpi"><b>${b}</b><span>${l}</span></div>`).join("");
    let fc = "";
    if (!sess.start) fc = "Inicie as entregas para ver a previsão de término.";
    else if (s.finish && (s.doneA < 3 || s.elapsed < 5 * 60000)) fc = "A previsão aparece depois de 3 paradas e 5 minutos de entrega.";
    else if (s.finish) {
      fc = `No seu ritmo, faltam ${s.leftA} paradas e você termina por volta de ${hhmm(s.finish)}.`;
      const [h, m] = (fin.endTime || "").split(":").map(Number);
      if (isFinite(h)) {
        const end = new Date(); end.setHours(h, m || 0, 0, 0);
        const spare = end - s.finish;
        fc += spare > 0
          ? ` Até ${fin.endTime} ainda cabem cerca de ${Math.floor(spare / s.perAddr * s.pkgsPerAddr)} pacotes a mais.`
          : ` Nesse ritmo você passa ${dur(-spare)} das ${fin.endTime}.`;
      }
    } else if (sess.end) fc = `Você fez ${s.doneP} pacotes em ${dur(s.elapsed)}${s.perAddr ? `, ${dur(s.perAddr)} por parada` : ""}.`;
    else fc = "A previsão aparece depois da primeira entrega.";
    $("forecast").textContent = fc;
    $("money").innerHTML = [
      [brl(s.gain), "ganho"],
      [brl(s.fuel), `combustível (${s.km} km)`],
      [brl(s.profit), "lucro", s.profit == null ? "" : s.profit >= 0 ? "good" : "bad"],
      [s.profit != null && s.hours > 0.25 ? brl(s.profit / s.hours) : "–", "lucro por hora"],
      [s.gain != null && s.doneP ? brl(s.gain / s.doneP) : "–", "ganho por pacote"],
      [s.profit != null && s.doneP ? brl(s.profit / s.doneP) : "–", "lucro por pacote"],
    ].map(([b, l, c]) => `<div class="kpi ${c || ""}"><b>${b}</b><span>${l}</span></div>`).join("");
    const rows = hist.slice().sort((a, b) => b.t - a.t);
    const sum = k => rows.reduce((t, r) => t + (r[k] || 0), 0);
    $("hist").innerHTML = rows.length
      ? `<thead><tr><th>Dia</th><th>Pct</th><th>Tempo</th><th>Ganho</th><th>Lucro</th></tr></thead><tbody>${rows.map(r => `<tr><td>${new Date(r.t).toLocaleDateString("pt-BR")}</td><td>${r.p}</td><td>${dur(r.ms)}</td><td>${brl(r.g)}</td><td>${brl(r.l)}</td></tr>`).join("")}</tbody>
        <tfoot><tr><td><b>Total</b></td><td><b>${sum("p")}</b></td><td><b>${dur(sum("ms"))}</b></td><td><b>${brl(sum("g"))}</b></td><td><b>${brl(sum("l"))}</b></td></tr></tfoot>`
      : `<tbody><tr><td class="sub" style="white-space:normal">Quando você tocar em "Finalizar entregas", o dia aparece aqui.</td></tr></tbody>`;
  }
  function endSession() {
    if (!sess.start) return;
    sess.end = Date.now();
    const s = stats();
    hist = hist.filter(r => r.id !== D.at + sess.start).concat({ id: D.at + sess.start, t: sess.start, p: s.doneP, a: s.doneA, ms: s.elapsed, g: s.gain || 0, l: s.profit || 0 });
    store.set("re:hist", hist); save(); renderAll();
    location.hash = "#painel";
    toast(`Dia encerrado: ${s.doneP} pacotes em ${dur(s.elapsed)}`);
  }
  [["fPay", "pay"], ["fPayMl", "payMl"], ["fPrice", "price"], ["fKml", "kml"], ["fKm", "km"]].forEach(([id, k]) => {
    $(id).value = fin[k] ?? "";
    $(id).addEventListener("input", e => { const v = parseFloat(String(e.target.value).replace(",", ".")); fin[k] = isFinite(v) ? v : null; store.set("re:fin", fin); if (active) renderPainel(); });
  });
  $("fMode").value = fin.mode; $("fMode").addEventListener("change", e => { fin.mode = e.target.value; store.set("re:fin", fin); if (active) renderPainel(); });
  $("fEnd").value = fin.endTime || ""; $("fEnd").addEventListener("change", e => { fin.endTime = e.target.value; store.set("re:fin", fin); if (active) renderPainel(); });

  // ---------- ajustes ----------
  function fillAjustes() {
    $("fileInfo").textContent = `${D.at} · ${D.pkgs.length} da Shopee${D.extra?.length ? ` + ${D.extra.length} adicionados` : ""} · ${A.length} endereços`;
    $("unplaced").innerHTML = (D.unplaced || []).length ? `<div class="offroute"><b>${D.unplaced.length} endereço(s) não encontrado(s) no mapa.</b> Toque para buscar de novo ou marcar no mapa.</div>` + D.unplaced.map((p, i) => `<button type="button" class="row" style="grid-template-columns:minmax(0,1fr) auto" data-place="${i}"><span><b>${esc(p.address)}</b><br><span class="sub">${esc(PLATFORMS[p.src]?.name || p.src)}${p.code ? " · " + esc(p.code) : ""}</span></span><span class="count">Localizar</span></button>`).join("") : "";
    $("extraList").innerHTML = (D.extra || []).length ? D.extra.map(p => `<div class="row" style="grid-template-columns:minmax(0,1fr) auto"><span><b>${esc(p.address)}</b><br><span class="sub">${esc(PLATFORMS[p.src]?.name || p.src)}${p.code ? " · " + esc(p.code) : ""}</span></span><button type="button" class="line" data-rmextra="${esc(p.tn)}">Remover</button></div>`).join("") : `<p class="sub">Nenhum pacote adicionado à mão.</p>`;
    $("fKm").placeholder = ((D.km || 0) / 1000).toFixed(1) + " (estimado)";
    const sorted = A.slice().sort((a, b) => (a.shopeeStops[0] ?? 1e9) - (b.shopeeStops[0] ?? 1e9));
    $("start").innerHTML = sorted.map(a => `<option value="${esc(a.key)}">${esc(a.label)}${a.shopeeStops.length ? " (Shopee " + a.shopeeStops.join(", ") + ")" : ""}</option>`).join("");
    const rows = [];
    order.forEach(a => a.pkgs.forEach(p => rows.push({ s: p.shopeeStop, a, p })));
    rows.sort((x, y) => (x.s ?? 1e9) - (y.s ?? 1e9) || x.a.n - y.a.n);
    $("dp").innerHTML = `<thead><tr><th>Shopee</th><th>Nossa parada</th><th>Endereço</th><th>Pacote</th></tr></thead><tbody>${rows.map(r => `<tr><td>${r.s ?? "sem nº"}</td><td>${r.a.n}</td><td style="text-align:left">${esc(r.a.label)}</td><td class="mono">${esc(tail(r.p.tn))}</td></tr>`).join("")}</tbody>`;
  }
  $("showDone").checked = showDone;
  $("showDone").addEventListener("change", e => { showDone = e.target.checked; store.set("re:showDone", showDone); drawMarkers(false); });
  $("bagMode").value = bagMode;
  $("bagMode").addEventListener("change", e => { bagMode = e.target.value; store.set("re:bag", bagMode); renderAll(); toast("Sacos atualizados"); });
  $("recalc").addEventListener("click", () => { plan($("start").value); save(); numberOrder(); fillAjustes(); drawMarkers(false); renderAll(); toast("Ordem refeita"); });

  // ---------- adicionar pacote (Mercado Livre ou outro) ----------
  // O endereço vem da busca do OpenStreetMap (perto da rota) ou de um toque no mapa.
  let addDraft = null, geoResults = [], pinMode = false;
  function openAdd(keep) {
    if (!keep) addDraft = { src: "ml", address: "", compl: "", code: "", lat: null, lng: null };
    $("scanOverlay").hidden = false;
    $("scanSheet").innerHTML = `<div class="addr-big">Adicionar pacote</div>
      <div class="form">
        <label for="aSrc" class="full">De onde é<select id="aSrc">${Object.entries(PLATFORMS).filter(([k]) => k !== "shopee").map(([k, v]) => `<option value="${k}">${esc(v.name)}</option>`).join("")}</select></label>
        <label for="aAddr" class="full">Endereço (rua e número)<input id="aAddr" type="search" autocomplete="off" placeholder="ex. Rua Tatuapé, 130" value="${esc(addDraft.address)}"></label>
      </div>
      <div class="nav3" style="grid-template-columns:1fr 1fr"><button type="button" class="brand" id="aFind">Buscar endereço</button><button type="button" class="line" data-pin="1">Marcar no mapa</button></div>
      <div id="aGeo" class="street-more">${addDraft.lat != null ? `<div class="chip ok">Local marcado: ${addDraft.lat.toFixed(5)}, ${addDraft.lng.toFixed(5)}</div>` : ""}</div>
      <div class="form">
        <label for="aCompl" class="full">Complemento ou observação<input id="aCompl" type="text" value="${esc(addDraft.compl)}" placeholder="ex. casa 2, portão azul"></label>
        <label for="aCode" class="full">Código do pacote (opcional)<input id="aCode" type="text" autocapitalize="characters" value="${esc(addDraft.code)}" placeholder="final do código da etiqueta"></label>
      </div>
      <button type="button" class="primary deliver" data-addsave="1">Colocar na rota</button>
      <button type="button" class="line" data-close="1">Cancelar</button>`;
    $("aSrc").value = addDraft.src;
    ["aSrc", "aAddr", "aCompl", "aCode"].forEach(id => $(id).addEventListener("input", syncDraft));
    $("aFind").addEventListener("click", findAddr);
    $("aAddr").addEventListener("keydown", e => { if (e.key === "Enter") findAddr(); });
  }
  function syncDraft() { addDraft.src = $("aSrc").value; addDraft.address = $("aAddr").value.trim(); addDraft.compl = $("aCompl").value.trim(); addDraft.code = $("aCode").value.trim(); }
  async function findAddr() {
    syncDraft();
    if (addDraft.address.length < 4) return toast("Digite a rua e o número.");
    $("aGeo").innerHTML = `<p class="sub">Procurando…</p>`;
    const lats = A.map(a => a.lat), lngs = A.map(a => a.lng);
    const city = D.pkgs[0]?.city || "";
    const vb = lats.length ? `&viewbox=${Math.min(...lngs) - 0.05},${Math.max(...lats) + 0.05},${Math.max(...lngs) + 0.05},${Math.min(...lats) - 0.05}&bounded=1` : "";
    try {
      const q = encodeURIComponent(addDraft.address + (city ? ", " + city : ""));
      let r = await (await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=br&limit=5&addressdetails=1&q=${q}${vb}`)).json();
      if (!r.length && vb) r = await (await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=br&limit=5&addressdetails=1&q=${q}`)).json();
      geoResults = r;
      $("aGeo").innerHTML = r.length
        ? `<div class="eyebrow">Escolha o endereço certo</div>` + r.map((g, i) => `<button type="button" data-geo="${i}"><span>${esc(g.display_name.split(",").slice(0, 4).join(","))}</span></button>`).join("")
        : `<p class="sub">Não achei. Confira o nome da rua ou use "Marcar no mapa".</p>`;
    } catch { $("aGeo").innerHTML = `<p class="sub">Sem internet para buscar o endereço. Use "Marcar no mapa".</p>`; }
  }
  function pickGeo(i) {
    const g = geoResults[i]; if (!g) return;
    syncDraft();
    addDraft.lat = +g.lat; addDraft.lng = +g.lon;
    const a = g.address || {};
    if (a.road && !/\d/.test(addDraft.address)) addDraft.address = a.road + (a.house_number ? ", " + a.house_number : "");
    openAdd(true);
  }
  function startPin() {
    syncDraft();
    $("scanOverlay").hidden = true;
    pinMode = true;
    location.hash = "#mapa";
    $("maptip").hidden = false; $("maptip").textContent = "Toque no mapa onde é a entrega";
    sheetOpen = false; renderSheet();
  }
  function onMapPin(e) {
    if (!pinMode) return;
    pinMode = false; $("maptip").hidden = true;
    addDraft.lat = e.latlng.lat; addDraft.lng = e.latlng.lng;
    openAdd(true);
  }
  function saveAdd() {
    syncDraft();
    if (!addDraft.address) return toast("Digite o endereço.");
    if (addDraft.lat == null) return toast("Escolha o endereço na busca ou marque no mapa.");
    const address = addDraft.address + (addDraft.compl ? ", " + addDraft.compl : "");
    const p = {
      tn: addDraft.code ? addDraft.code.toUpperCase() : "ML" + Date.now().toString(36).toUpperCase(),
      code: addDraft.code, src: addDraft.src, address, bairro: "", city: D.pkgs[0]?.city || "", cep: "",
      lat: addDraft.lat, lng: addDraft.lng, seq: null, shopeeStop: null, at: D.at,
      ...Core.parseAddress(address), window: Core.parseWindow(address),
    };
    if (all().some(x => x.tn === p.tn)) return toast("Esse código já está na rota.");
    D.extra = (D.extra || []).concat(p);
    derive(); plan(nextAddr()?.key); save();
    $("scanOverlay").hidden = true;
    numberOrder(); fillAjustes(); drawMarkers(false); renderAll();
    const a = byTn.get(p.tn);
    toast(`Entrou na rota como parada ${a.n}`);
    select(a.key);
  }

  // ---------- planilha de outra plataforma (Mercado Livre e as próximas) ----------
  // O formato ainda não é conhecido: as colunas são reconhecidas pelo nome; se não der, a entregadora escolhe.
  // Sem coordenadas, cada endereço é procurado no OpenStreetMap (1 por segundo, regra do serviço) e guardado no aparelho.
  const ROLES = [
    ["address", "Endereço (rua)", ["endereco", "address", "logradouro", "rua", "destino", "destination", "street"]],
    ["number", "Número", ["numero", "number", "n°", "nº", "num"]],
    ["compl", "Complemento", ["complemento", "complement", "referencia", "observacao", "obs", "apto"]],
    ["code", "Código do pacote", ["codigo", "tracking", "rastreio", "pacote", "shipment", "envio", "etiqueta", "pedido", "order", "id"]],
    ["name", "Destinatário", ["destinatario", "cliente", "nome", "recebedor", "buyer", "receiver"]],
    ["bairro", "Bairro", ["bairro", "neighborhood", "district"]],
    ["city", "Cidade", ["cidade", "city", "municipio"]],
    ["cep", "CEP", ["cep", "zip", "postal"]],
    ["lat", "Latitude", ["latitude", "lat"]],
    ["lng", "Longitude", ["longitude", "lng", "lon"]],
  ];
  const normH = s => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  let imp = null; // { src, file, rows, head, map }
  function parseCsv(text) {
    const first = text.split(/\r?\n/)[0] || "";
    const sep = [";", ",", "\t"].sort((a, b) => first.split(b).length - first.split(a).length)[0];
    const rows = []; let row = [], cell = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; }
      else if (ch === '"') q = true;
      else if (ch === sep) { row.push(cell); cell = ""; }
      else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
      else cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(r => r.some(c => String(c).trim()));
  }
  function guessMap(head) {
    const map = {}, used = new Set();
    ROLES.forEach(([role, , keys]) => {
      const i = head.findIndex((h, j) => !used.has(j) && keys.some(k => (k.length <= 3 ? normH(h).split(/[^a-z0-9°º]+/).includes(k) : normH(h).includes(k))));
      if (i >= 0) { map[role] = i; used.add(i); }
    });
    return map;
  }
  $("fileOther").addEventListener("change", async e => {
    const f = e.target.files[0];
    e.target.value = "";
    if (!f) return;
    try {
      const rows = /\.csv$/i.test(f.name) || f.type === "text/csv" ? parseCsv(await f.text()) : await readXlsxFile(f);
      const hi = rows.findIndex(r => Object.keys(guessMap(r.map(String))).length >= 2);
      const h = hi >= 0 ? hi : 0;
      imp = { src: $("otherSrc").value, file: f.name, head: rows[h].map(c => String(c ?? "")), rows: rows.slice(h + 1).filter(r => r.some(c => String(c ?? "").trim())) };
      imp.map = guessMap(imp.head);
      if (!imp.rows.length) return toast("O arquivo não tem linhas de pacotes.");
      showMapping(imp.map.address == null);
    } catch { toast("Não consegui ler esse arquivo. Envie em Excel (.xlsx) ou CSV."); }
  });
  function showMapping(needs) {
    $("scanOverlay").hidden = false;
    const opt = role => `<option value="">— não tem —</option>` + imp.head.map((h, i) => `<option value="${i}" ${imp.map[role] === i ? "selected" : ""}>${esc(h || "Coluna " + (i + 1))} · ex.: ${esc(String(imp.rows[0][i] ?? "").slice(0, 24))}</option>`).join("");
    $("scanSheet").innerHTML = `<div class="addr-big">Planilha ${esc(PLATFORMS[imp.src]?.name || imp.src)}</div>
      <p class="sub">${imp.rows.length} linhas em "${esc(imp.file)}". ${needs ? "<b>Não reconheci a coluna do endereço.</b> Diga qual coluna é cada informação:" : "Confira as colunas que reconheci:"}</p>
      <div class="form">${ROLES.map(([role, label]) => `<label for="m_${role}" class="${["address", "code"].includes(role) ? "full" : ""}">${label}${role === "address" ? " *" : ""}<select id="m_${role}">${opt(role)}</select></label>`).join("")}</div>
      <button type="button" class="primary deliver" data-import-go="1">Colocar ${imp.rows.length} pacotes na rota</button>
      <button type="button" class="line" data-close="1">Cancelar</button>`;
  }
  async function runImport() {
    ROLES.forEach(([role]) => { const v = $("m_" + role).value; if (v === "") delete imp.map[role]; else imp.map[role] = +v; });
    if (imp.map.address == null) return toast("Escolha a coluna do endereço.");
    if (!D) { D = { at: "dia-" + dayOf(Date.now()), file: "", pkgs: [], createdAt: Date.now(), order: null, km: null }; ok = {}; sess = {}; }
    const cell = (r, role) => (imp.map[role] == null ? "" : String(r[imp.map[role]] ?? "").trim());
    const city = cell(imp.rows[0], "city") || D.pkgs[0]?.city || "";
    const have = new Set(all().map(p => p.tn));
    const cache = store.get("re:geo", {});
    const todo = [], fail = [];
    imp.rows.forEach((r, i) => {
      let street = cell(r, "address"), num = cell(r, "number"), compl = cell(r, "compl");
      if (!street) return;
      const base = num && !street.includes(num) ? `${street}, ${num}` : street;
      const code = cell(r, "code");
      const tn = (code || `${imp.src.toUpperCase()}-${base}-${i}`).toUpperCase();
      if (have.has(tn)) return;
      const lat = parseFloat(cell(r, "lat").replace(",", ".")), lng = parseFloat(cell(r, "lng").replace(",", "."));
      todo.push({ tn, code, base, compl, name: cell(r, "name"), bairro: cell(r, "bairro"), cep: cell(r, "cep"), city: cell(r, "city") || city, lat: isFinite(lat) && Math.abs(lat) > 0.01 ? lat : null, lng: isFinite(lng) ? lng : null });
    });
    if (!todo.length) { $("scanOverlay").hidden = true; return toast("Esses pacotes já estão na rota."); }
    const lats = A.map(a => a.lat), lngs = A.map(a => a.lng);
    const vb = lats.length ? `&viewbox=${Math.min(...lngs) - 0.08},${Math.max(...lats) + 0.08},${Math.max(...lngs) + 0.08},${Math.min(...lats) - 0.08}` : "";
    const added = [];
    for (let i = 0; i < todo.length; i++) {
      const t = todo[i];
      $("scanSheet").innerHTML = `<div class="addr-big">Localizando endereços</div><p>${i + 1} de ${todo.length}: ${esc(t.base)}</p><div class="bar" style="background:var(--line)"><i style="width:${((i + 1) / todo.length * 100).toFixed(0)}%;background:var(--brand)"></i></div>`;
      if (t.lat == null) {
        const q = [t.base, t.bairro, t.city, t.cep].filter(Boolean).join(", ");
        if (cache[q]) [t.lat, t.lng] = cache[q];
        else {
          try {
            const r = await (await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=br&limit=1&q=${encodeURIComponent(q)}${vb}`)).json();
            if (r[0]) { t.lat = +r[0].lat; t.lng = +r[0].lon; cache[q] = [t.lat, t.lng]; }
          } catch {}
          await new Promise(res => setTimeout(res, 1100));
        }
      }
      const address = t.base + (t.compl ? ", " + t.compl : "");
      const p = { tn: t.tn, code: t.code, src: imp.src, address, bairro: t.bairro, city: t.city, cep: t.cep, recipient: t.name, lat: t.lat, lng: t.lng, seq: null, shopeeStop: null, at: D.at, ...Core.parseAddress(address), window: Core.parseWindow(address) };
      if (t.lat == null) fail.push(p); else added.push(p);
    }
    store.set("re:geo", cache);
    D.extra = (D.extra || []).concat(added);
    D.unplaced = (D.unplaced || []).concat(fail);
    derive(); plan(nextAddr()?.key); save();
    if (!active) start(); else { numberOrder(); fillAjustes(); drawMarkers(true); renderAll(); }
    $("scanOverlay").hidden = true;
    toast(`${added.length} pacote(s) ${PLATFORMS[imp.src]?.name || ""} na rota${fail.length ? ` · ${fail.length} sem localização (veja em Ajustes)` : ""}`);
    location.hash = fail.length ? "#ajustes" : "#mapa";
  }

  // ---------- escanear ----------
  const findPkgByCode = text => {
    const t = String(text || "").toUpperCase().replace(/\s+/g, "");
    return D ? all().find(p => p.tn && t.includes(p.tn.toUpperCase())) || null : null;
  };
  function zxHints() {
    const F = ZXing.BarcodeFormat, hints = new Map();
    hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
    hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [F.CODE_128, F.CODE_39, F.CODE_93, F.ITF, F.EAN_13, F.QR_CODE, F.DATA_MATRIX]);
    return hints;
  }
  // Foto da etiqueta: tenta a imagem inteira e faixas dela (a etiqueta tem mais de um código), em pé e deitada.
  async function decodePhoto(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const iw = img.naturalWidth, ih = img.naturalHeight;
      const scale = Math.min(1, 1600 / Math.max(iw, ih));
      const reader = new ZXing.MultiFormatReader(), hints = zxHints();
      const regions = [[0, 0, 1, 1], [0, 0, 1, 0.5], [0, 0.5, 1, 0.5], [0, 0, 1, 0.34], [0, 0.33, 1, 0.34], [0, 0.66, 1, 0.34], [0, 0.25, 1, 0.5]];
      const read = [];
      for (const [x, y, w, h] of regions) {
        for (const rot of [0, 1]) {
          const sw = w * iw, sh = h * ih, dw = Math.round(sw * scale), dh = Math.round(sh * scale);
          const cv = document.createElement("canvas");
          cv.width = rot ? dh : dw; cv.height = rot ? dw : dh;
          const ctx = cv.getContext("2d");
          if (rot) { ctx.translate(dh, 0); ctx.rotate(Math.PI / 2); }
          ctx.drawImage(img, x * iw, y * ih, sw, sh, 0, 0, dw, dh);
          try {
            const r = reader.decode(new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(new ZXing.HTMLCanvasElementLuminanceSource(cv))), hints);
            const p = findPkgByCode(r.getText());
            if (p) return { p, read };
            if (!read.includes(r.getText())) read.push(r.getText());
          } catch {}
          await new Promise(r => setTimeout(r));
        }
      }
      return { p: null, read };
    } finally { URL.revokeObjectURL(url); }
  }

  function openScan(a, tn, missHtml) {
    $("scanOverlay").hidden = false;
    const tp = tn && all().find(p => p.tn === tn);
    $("scanSheet").innerHTML = missHtml || `<div class="bigno">Parada ${a.n}</div>${tp && bagOf(tp, a) ? `<div class="bagbig">Saco ${esc(bagOf(tp, a))}</div>` : ""}${addrCard(a, tn)}
      <div class="nav3" style="grid-template-columns:1fr 1fr"><button type="button" class="line" data-sel="${esc(a.key)}">Ver no mapa</button><button type="button" class="line" data-close="1">Fechar</button></div>`;
  }
  $("photo").addEventListener("change", async e => {
    const f = e.target.files[0];
    e.target.value = "";
    if (!f) return;
    if (!active) return toast("Abra a planilha da rota antes de escanear.");
    if (!window.ZXing) return toast("O leitor de código não carregou. Confira a internet.");
    openScan(null, null, `<p class="sub">Lendo a etiqueta…</p>`);
    try {
      const { p, read } = await decodePhoto(f);
      if (p) { buzz(60); return openScan(byTn.get(p.tn), p.tn); }
      buzz([200, 80, 200]);
      openScan(null, null, `<div class="miss"><b>${read.length ? "Este pacote não está nesta rota" : "Não consegui ler o código"}</b><span class="sub">${read.length ? "Código lido: " + esc(read.join(", ")) : "Fotografe só a etiqueta, de perto e com luz."}</span></div>
        <label class="btn primary" for="photo">Tentar de novo</label><button type="button" class="line" data-close="1">Fechar</button>`);
    } catch { openScan(null, null, `<div class="miss"><b>Não consegui ler o código</b></div><button type="button" class="line" data-close="1">Fechar</button>`); }
  });

  // ---------- início: o dia salvo só volta se você pedir ----------
  if (D) {
    const okSaved = store.get("re:ok:" + D.at, {});
    const pend = D.pkgs.filter(p => !okSaved[p.tn]).length;
    $("resume").hidden = false;
    $("resume").innerHTML = `<div class="card" style="background:var(--bg)"><b>Rota salva: ${esc(D.at)}</b><span class="sub">${D.pkgs.length} pacotes · ${pend} pendentes</span>
      <div class="nav3" style="grid-template-columns:1fr 1fr"><button type="button" class="brand" data-resume="go">Continuar</button><button type="button" class="line" data-resume="clear">Começar do zero</button></div></div>`;
  }
  route();
})();
