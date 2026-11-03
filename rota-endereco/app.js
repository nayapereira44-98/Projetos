// Rota Certa (v2) — app de entrega por endereço com mapa, escaneamento, cronômetro e painel.
// Depende de ../rota-certa/core.js (global Core), Leaflet (global L, mapa) e ZXing (código de barras).
(() => {
  const $ = id => document.getElementById(id);
  // Página antiga guardada no cache do celular com o código novo: os botões travariam. Recarrega uma vez sem cache;
  // se ainda não bater, mostra um aviso para atualizar.
  const NEED = ["issueBox", "issueAj", "ind", "opps", "histSum", "histChart", "hist", "fBase", "fOther", "recalcHere", "routeCmp", "finBox"];
  if (NEED.some(id => !$(id))) {
    let tried = false;
    try { tried = sessionStorage.getItem("re:reload") === "1"; sessionStorage.setItem("re:reload", "1"); } catch {}
    if (!tried) { location.replace(location.pathname + "?v=" + Date.now() + location.hash); return; }
    document.body.insertAdjacentHTML("afterbegin", `<button type="button" onclick="location.replace(location.pathname + '?v=' + Date.now())" style="position:fixed;inset:auto 12px 96px 12px;z-index:2000;background:#e8590c;color:#fff;border:0;border-radius:14px;padding:14px;font:700 1rem system-ui">O app foi atualizado. Toque aqui para carregar a versão nova.</button>`);
    return;
  }
  try { sessionStorage.removeItem("re:reload"); } catch {}
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
    if (bagMode === "area") return "Área " + areaOf(a || byTn.get(p.tn));
    return p.shopeeStop != null ? range10(p.shopeeStop) : "sem nº";
  };
  const bagsOf = a => [...new Set(a.pkgs.filter(p => !pkgDone(p)).map(p => bagOf(p, a)).filter(Boolean))];
  const bagChip = a => (bagsOf(a).length && bagMode !== "area" ? `<span class="chip bag">Saco ${bagsOf(a).join(" + ")}</span>` : "");
  function nextLeg(n = 10) {
    if (mode !== "perto" || typeof here === "undefined" || !here) return order.filter(a => !addrDone(a)).slice(0, n);
    const left = pendingList().slice(), out = [];
    let pt = here, area = lastArea();
    while (out.length < n && left.length) {
      const inA = left.filter(a => areaOf(a) === area);
      const b = nearestFrom(pt, inA.length ? inA : left);
      out.push(b); left.splice(left.indexOf(b), 1); pt = b; area = areaOf(b);
    }
    return out;
  }
  const shopee = a => (a.shopeeStops.length ? "Shopee " + a.shopeeStops.join(" · ") : "") + (a.unseq ? (a.shopeeStops.length ? " · " : "") + "sem nº" : "");
  // Modo "Perto de mim" (padrão): a parada da vez é a pendente mais perto de você, terminando a área atual antes de ir
  // para outra. Modo "Rota": segue a ordem calculada. Sem GPS, os dois seguem a ordem.
  let mode = store.get("re:mode", "perto");
  const pendingList = () => { const l = order.filter(a => !addrDone(a)); const now = l.filter(a => !(D.later || []).includes(a.key)); return now.length ? now : l; };
  function lastArea() {
    let best = null, t = 0;
    all().forEach(p => { if (ok[p.tn] > t) { t = ok[p.tn]; best = p; } });
    return best ? areaOf(byTn.get(best.tn)) : null;
  }
  function nearestFrom(pt, list) { let b = null, bd = Infinity; list.forEach(a => { const d = Core.hav(pt, a); if (d < bd) { bd = d; b = a; } }); return b; }
  // A parada da vez fica "presa" enquanto você está nela (80 m) ou enquanto nenhuma outra está 50 m mais perto,
  // para o cartão não trocar na hora de tocar em Entreguei.
  let curKey = null;
  function nextAddr() {
    const pend = pendingList();
    if (!pend.length) return undefined;
    if (mode !== "perto" || typeof here === "undefined" || !here) return pend[0];
    const la = lastArea();
    const inArea = la != null ? pend.filter(a => areaOf(a) === la) : [];
    const best = nearestFrom(here, inArea.length ? inArea : pend);
    const cur = curKey && byKey.get(curKey);
    if (cur && pend.includes(cur) && (Core.hav(here, cur) <= 80 || Core.hav(here, cur) - Core.hav(here, best) < 50)) return cur;
    curKey = best.key;
    return best;
  }

  // Áreas: endereços a até X m (padrão 700) do centro de uma área ficam juntos. Numeradas na ordem da rota e guardadas,
  // para os sacos por área não mudarem durante o dia.
  let areaRadius = store.get("re:areaR", 700);
  function ensureAreas() {
    if (!D) return;
    D.areaSeeds = D.areaSeeds || []; D.areaOf = D.areaOf || {};
    order.forEach(a => {
      if (D.areaOf[a.key] != null) return;
      let i = D.areaSeeds.findIndex(s => Core.hav(s, a) <= areaRadius);
      if (i < 0) { D.areaSeeds.push({ lat: a.lat, lng: a.lng }); i = D.areaSeeds.length - 1; }
      D.areaOf[a.key] = i + 1;
    });
  }
  const areaOf = a => (a && D?.areaOf ? D.areaOf[a.key] : null);
  // Conferência na separação: pacote fotografado (ou marcado à mão) antes de sair.
  const isChecked = p => !!D?.checked?.[p.tn];
  const checkedOf = a => a.pkgs.filter(isChecked).length;
  const areaChip = a => (areaOf(a) ? `<span class="chip area">Área ${areaOf(a)}</span>` : "");

  // Posições corrigidas na conferência de endereço (D.fix, por código do pacote). A posição original fica guardada
  // em olat/olng para poder desfazer.
  function applyFixes() {
    const fx = D.fix || {};
    all().forEach(p => {
      if (fx[p.tn]) {
        if (p.olat == null) { p.olat = p.lat; p.olng = p.lng; }
        p.lat = fx[p.tn].lat; p.lng = fx[p.tn].lng;
      } else if (p.olat != null) { p.lat = p.olat; p.lng = p.olng; delete p.olat; delete p.olng; }
    });
  }
  function derive() {
    applyFixes();
    A = Core.buildAddresses(all());
    byKey = new Map(A.map(a => [a.key, a]));
    byTn = new Map();
    A.forEach(a => a.pkgs.forEach(p => byTn.set(p.tn, a)));
  }
  const orderOk = () => D.order && D.order.length === A.length && D.order.every(k => byKey.has(k));

  // Ordem só dos endereços pendentes, a partir de `startKey`; os já entregues ficam na frente.
  // Com o GPS ligado e nenhuma entrega feita (ou pedindo "a partir de onde estou"), a rota sai de onde você está.
  // Endereços com horário ("entrega até 12:00", "após 14h") são encaixados pelo relógio.
  function plan(startKey, fromHere) {
    const doneA = (orderOk() ? D.order.map(k => byKey.get(k)) : A).filter(addrDone);
    const pend = A.filter(a => !addrDone(a));
    if (!pend.length) { D.order = doneA.map(a => a.key); return; }
    const start = pend.some(a => a.key === startKey) ? startKey : pend.reduce((b, a) => ((a.shopeeStops[0] ?? 1e9) < (b.shopeeStops[0] ?? 1e9) ? a : b)).key;
    const from = here && (fromHere || (!doneA.length && !startKey)) ? { ...here } : null;
    const now = new Date();
    const perStop = sess.start && doneA.length >= 3 ? (Date.now() - sess.start) / 60000 / doneA.length : 3;
    const r = Core.addressRoute(pend, start, { from, clock: { start: now.getHours() * 60 + now.getMinutes(), stopMin: Math.min(10, Math.max(1.5, perStop)) } });
    D.order = doneA.concat(r.order).map(a => a.key);
    if (!D.km) D.km = r.km;
    // Comparação com a ordem da Shopee, pelo mesmo critério de distância.
    const shp = pend.slice().sort((a, b) => (a.shopeeStops[0] ?? 1e9) - (b.shopeeStops[0] ?? 1e9));
    D.cmp = { app: r.km, shopee: Core.seqMeters(shp, from), n: pend.length, from: !!from, at: Date.now() };
  }
  function numberOrder() {
    if (!orderOk()) plan(null);
    order = D.order.map(k => byKey.get(k));
    // "Ninguém atendeu": o endereço vai para o fim até ser entregue.
    const later = (D.later || []).filter(k => byKey.has(k) && !addrDone(byKey.get(k)));
    D.later = later;
    order = order.filter(a => !later.includes(a.key)).concat(later.map(k => byKey.get(k)));
    order.forEach((a, i) => (a.n = i + 1));
    ensureAreas();
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
    renderIssues(); checkAddresses();
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
      <div class="eyebrow">${a === nx ? (mode === "perto" && here ? "Mais perto de você" : "Próxima parada") : "Parada"} ${a.n} de ${order.length}${addrDone(a) ? " · entregue" : ""}</div>
      <div><div class="addr-big">${esc(a.label)}</div><div class="sub">${esc([a.bairro, ...new Set(a.pkgs.map(p => String(p.cep || "").replace(/\D/g, "")).filter(c => c.length === 8).map(c => "CEP " + c.slice(0, 5) + "-" + c.slice(5)))].filter(Boolean).join(" · "))}</div></div>
      ${issues.has(a.key) ? `<button type="button" class="issue-bar" data-issues="1"><b>Conferir endereço</b><span>${esc([issues.get(a.key).pin, issues.get(a.key).cep].filter(Boolean).join(" "))}</span></button>` : ""}
      ${a.pkgs.some(p => D.fix?.[p.tn]) ? `<button type="button" class="line" data-fixundo="${esc(a.key)}">Posição corrigida por você · voltar à da planilha</button>` : ""}
      <div class="chips">${navText(a)}${areaChip(a)}${shopee(a) ? `<span class="chip shp">${shopee(a)}</span>` : ""}<span class="chip">${a.pkgs.length} pacote${a.pkgs.length > 1 ? "s" : ""}</span>${platformsOf(a).filter(k => k !== "shopee").map(k => `<span class="chip ${PLATFORMS[k]?.cls || "other"}">${esc(PLATFORMS[k]?.name || k)}</span>`).join("")}${addrDone(a) ? `<span class="chip ok">Entregue</span>` : ""}${a.pkgs.some(p => p.window) ? `<span class="chip warn">${a.pkgs.map(p => p.window).filter(Boolean).map(w => (w.until ? "até " + w.until : "após " + w.after)).join(" · ")}</span>` : ""}</div>
      ${platformsOf(a).length > 1 ? `<div class="together">Neste endereço tem entrega de ${platformsOf(a).map(k => PLATFORMS[k]?.name || k).join(" e ")}: ${platformsOf(a).map(k => `${a.pkgs.filter(p => srcOf(p) === k).length} ${PLATFORMS[k]?.name || k}`).join(", ")}.</div>` : ""}
      ${a.unseq ? `<div class="offroute">${a.unseq === a.pkgs.length ? "Este endereço está" : `${a.unseq} pacote${a.unseq > 1 ? "s" : ""} deste endereço ${a.unseq > 1 ? "estão" : "está"}`} <b>fora da rota da Shopee</b> (sem número de parada). No app da Shopee ${a.unseq > 1 ? "eles aparecem" : "ele aparece"} no topo da lista, longe da parada${a.shopeeStops.length ? " " + a.shopeeStops.join(" e ") : ""}.</div>` : ""}
      ${a.pkgs.length > 1 && pend.length ? `<div class="together">Este endereço tem ${a.pkgs.length} pacotes${a.shopeeStops.length > 1 ? ` de paradas diferentes da Shopee (${a.shopeeStops.join(" e ")})` : ""}. Entregue todos agora.</div>` : ""}
      <div class="pkgs">${a.pkgs.map(p => `<button type="button" class="pkg${pkgDone(p) ? " done" : ""}${p.tn === tn ? " me" : ""}" data-p="${esc(p.tn)}" aria-pressed="${pkgDone(p)}">
        <span class="box">${pkgDone(p) ? ICON_CHECK : ""}</span>
        <span class="t"><b>${esc(tail(p.tn))}</b> · ${esc(pkgLabel(p))}${bagOf(p, a) && bagMode !== "none" && !p.src ? ` · <span class="bagt">saco ${bagOf(p, a)}</span>` : ""}${!pkgDone(p) ? (isChecked(p) ? ` · <span class="chk on">conferido</span>` : ` · <span class="chk">sem foto</span>`) : ""}${attempt(p) > 1 ? ` · <span class="att">${attempt(p)}ª tentativa</span>` : ""}${extra(p) ? `<br><span class="sub">${esc(extra(p))}</span>` : ""}</span></button>`).join("")}</div>
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
            <span class="chips">${issues.has(a.key) ? `<span class="chip warn">Conferir endereço</span>` : ""}${navText(a)}${areaChip(a)}${a.pkgs.length > 1 ? `<span class="chip count">${a.pkgs.length} pacotes</span>` : ""}${bagChip(a)}${shopee(a) ? `<span class="chip shp">${shopee(a)}</span>` : ""}${platformsOf(a).filter(k => k !== "shopee").map(k => `<span class="chip ${PLATFORMS[k]?.cls || "other"}">${esc(PLATFORMS[k]?.name || k)}</span>`).join("")}</span>
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
    document.querySelectorAll("[data-mode]").forEach(b => b.classList.toggle("on", b.dataset.mode === mode));
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
    // Km rodados de verdade, medidos pelo GPS enquanto as entregas estão em andamento e o app está aberto.
    if (active && sess.start && !sess.end) {
      sess.trk = Core.trackStep(sess.trk, { lat: here.lat, lng: here.lng, acc: pos.coords.accuracy, t: pos.timestamp || Date.now() });
      if (Date.now() - (onPos.saved || 0) > 15000) { onPos.saved = Date.now(); store.set(sessKey(), sess); }
    }
    if (map) {
      const ll = [here.lat, here.lng];
      if (!me) me = L.marker(ll, { icon: L.divIcon({ className: "", html: `<div class="me-dot"></div>`, iconSize: [22, 22], iconAnchor: [11, 11] }), zIndexOffset: 2000, interactive: false }).addTo(map);
      else me.setLatLng(ll);
      if (!accCircle) accCircle = L.circle(ll, { radius: pos.coords.accuracy, color: "#1c7ed6", weight: 1, opacity: 0.4, fillOpacity: 0.08, interactive: false }).addTo(map);
      else accCircle.setLatLng(ll).setRadius(pos.coords.accuracy);
      if (follow || first) frame();
    }
    if (mode === "perto" && !selKey) { renderSheet(); updateMarkers(); }
    hereAlert();
    updateNav(false);
  }
  // Passou perto (60 m) de qualquer endereço pendente, mesmo fora da ordem ou numa rua errada: avisa na hora.
  const alerted = {};
  function hereAlert() {
    if (!here) { $("hereTip").hidden = true; return; }
    const near = pendingList().map(a => ({ a, d: Core.hav(here, a) })).filter(x => x.d <= 60).sort((x, y) => x.d - y.d);
    if (!near.length) { $("hereTip").hidden = true; return; }
    const pk = near.reduce((t, x) => t + x.a.pkgs.filter(p => !pkgDone(p)).length, 0);
    $("hereTip").hidden = false;
    $("hereTip").innerHTML = `<button type="button" data-sel="${esc(near[0].a.key)}"><b>Aqui tem entrega:</b> ${near.map(x => `${esc(x.a.label)} (${x.a.pkgs.filter(p => !pkgDone(p)).length})`).join(" · ")}<br><span>${pk} pacote${pk > 1 ? "s" : ""} · ${near.map(x => x.a.pkgs.filter(p => !pkgDone(p)).map(p => esc(tail(p.tn)) + (bagOf(p, x.a) ? " " + esc(bagOf(p, x.a)) : "")).join(", ")).join(" · ")}</span></button>`;
    const fresh = near.filter(x => !alerted[x.a.key] || Date.now() - alerted[x.a.key] > 5 * 60000);
    if (fresh.length) { fresh.forEach(x => (alerted[x.a.key] = Date.now())); buzz([150, 80, 150]); }
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
      selKey = null; sheetOpen = false; curKey = null;
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
    else if (d.mode) setMode(d.mode);
    else if (d.checkview) { onlyMissing = true; showChecked([], [], []); }
    else if (d.chk) {
      D.checked = D.checked || {};
      D.checked[d.chk] ? delete D.checked[d.chk] : (D.checked[d.chk] = Date.now());
      save(); renderList(); showChecked([], [], []);
    }
    else if (d.grab) { sheetOpen = !sheetOpen; renderSheet(); }
    else if (d.later) {
      D.later = (D.later || []).filter(k => k !== d.later).concat(d.later);
      D.laterEver = [...new Set((D.laterEver || []).concat(d.later))];
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
    else if (d.issues) openIssues();
    else if (d.fixuse) { const [key, which] = d.fixuse.split("::"); const it = issues.get(key); applyFix(key, it && it[which], t.dataset.lbl); }
    else if (d.fixok) { D.fixOk = { ...(D.fixOk || {}), [d.fixok]: 1 }; issues.delete(d.fixok); save(); renderAll(); renderIssues(); openIssues(); toast("Endereço mantido como está"); }
    else if (d.fixpin) { pinFix = d.fixpin; $("scanOverlay").hidden = true; location.hash = "#mapa"; $("maptip").hidden = false; $("maptip").textContent = "Toque no mapa onde fica este endereço"; sheetOpen = false; renderSheet(); }
    else if (d.fixundo) { const a = byKey.get(d.fixundo); if (a) { a.pkgs.forEach(p => delete D.fix?.[p.tn]); derive(); plan(nextAddr()?.key); save(); numberOrder(); drawMarkers(false); renderAll(); toast("Posição original de volta"); } }
    else if (d.per) { histPer = +d.per; store.set("re:per", histPer); renderPainel(); }
    else if (d.histadd) openHistForm(null);
    else if (d.histedit) openHistForm(d.histedit);
    else if (d.histsave) saveHistForm(d.histsave);
    else if (d.histdel) return twoTap(t, () => { hist = hist.filter(r => r.id !== d.histdel); store.set("re:hist", hist); $("scanOverlay").hidden = true; renderPainel(); toast("Rota apagada do histórico"); });
    else if (d.csv) exportCsv();
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
    rows = rows.slice().sort((x, y) => (areaOf(x) || 0) - (areaOf(y) || 0) || x.n - y.n);
    const nx = nextAddr();
    let html = "";
    for (let i = 0; i < rows.length;) {
      let j = i; while (j < rows.length && rows[j].street === rows[i].street && areaOf(rows[j]) === areaOf(rows[i]) && rows[j].n - rows[i].n === j - i) j++;
      const g = rows.slice(i, j), pk = g.reduce((t, a) => t + a.pkgs.length, 0), left = g.filter(a => !addrDone(a)).length;
      if (areaOf(g[0]) !== areaOf(rows[i - 1])) {
        const inA = order.filter(a => areaOf(a) === areaOf(g[0]));
        const leftA = inA.filter(a => !addrDone(a));
        html += `<div class="area-head"><b>Área ${areaOf(g[0])}</b><span>${leftA.reduce((t, a) => t + a.pkgs.filter(p => !pkgDone(p)).length, 0)} pacotes faltando · ${leftA.length}/${inA.length} endereços</span></div>`;
      }
      html += `<div class="street"><div class="street-head"><b>${esc(streetName(g[0]))}</b><span>${esc(g[0].bairro)} · ${pk} pct${left ? ` · faltam ${left}` : " · feita"}</span></div>
        ${g.map(a => `<button type="button" class="row${addrDone(a) ? " done" : ""}${a === nx ? " next" : ""}" data-sel="${esc(a.key)}">
          <span class="n">${addrDone(a) ? "✓" : a.n}</span>
          <span><span class="num">${a.nums?.length ? "nº " + a.nums.join(" / ") : esc(a.label)}</span><br><span class="sub">${[shopee(a), ...platformsOf(a).filter(k => k !== "shopee").map(k => PLATFORMS[k]?.name || k)].filter(Boolean).join(" · ") || "fora da rota"}${a.pkgs.some(p => attempt(p) > 1) ? " · <b class=\"att\">nova tentativa</b>" : ""}${issues.has(a.key) ? " · <b class=\"att\">conferir endereço</b>" : ""} · <span class="mono">${a.pkgs.map(p => esc(tail(p.tn))).join(" ")}</span></span></span>
          <span class="count">${a.pkgs.length}${bagsOf(a).length ? `<br><small>${bagsOf(a).join("+")}</small>` : ""}${!addrDone(a) ? `<br><small class="${checkedOf(a) === a.pkgs.length ? "chk on" : "chk"}">📷 ${checkedOf(a)}/${a.pkgs.length}</small>` : ""}</span></button>`).join("")}</div>`;
      i = j;
    }
    const leg = nextLeg();
    $("legBtn").hidden = leg.length < 2;
    if (leg.length > 1) { $("legBtn").href = Core.links.gmapsLeg(leg); $("legBtn").textContent = `Próximas ${leg.length} paradas no Google Maps (${leg[0].n} a ${leg[leg.length - 1].n})`; }
    const pend = all().filter(p => !pkgDone(p)), got = pend.filter(isChecked).length;
    $("checkBox").innerHTML = pend.length ? `<div class="top" style="display:flex;justify-content:space-between;gap:8px;align-items:baseline"><b>Conferência na separação</b><span class="sub">${got} de ${pend.length} conferidos${got < pend.length ? ` · faltam ${pend.length - got}` : " · tudo conferido ✓"}</span></div>
      <div class="bar" style="background:var(--line)"><i style="width:${(got / pend.length * 100).toFixed(0)}%;background:${got === pend.length ? "var(--ok)" : "var(--brand)"}"></i></div>
      <div class="nav3" style="grid-template-columns:1fr 1fr"><label class="btn brand" for="photoMany">Fotografar pacotes</label><button type="button" class="line" data-checkview="1">Ver o que falta</button></div>` : "";
    $("list").innerHTML = html || `<p class="empty-list">Nada encontrado para "${esc(q)}".</p>`;
  }
  $("q").addEventListener("input", renderList);

  function setMode(m) {
    mode = m; store.set("re:mode", mode); selKey = null;
    document.querySelectorAll("[data-mode]").forEach(b => b.classList.toggle("on", b.dataset.mode === mode));
    if ($("routeMode")) $("routeMode").value = mode;
    renderAll(); if (map && follow) frame(); updateNav(true);
    toast(mode === "perto" ? "Perto de mim: a parada da vez é a mais perto de você" : "Seguindo a ordem da rota");
  }

  // ---------- painel ----------
  // Km do dia: o que você digitar > o medido pelo GPS (a partir de 1 km) > a rota estimada + ida e volta do CD.
  function stats() {
    const now = sess.end || Date.now();
    const elapsed = sess.start ? now - sess.start : 0;
    const doneA = order.filter(addrDone).length, doneP = all().filter(pkgDone).length;
    const leftA = order.length - doneA;
    const perAddr = doneA ? elapsed / doneA : null;
    const pkgsPerAddr = all().length / order.length;
    const finish = perAddr && !sess.end ? Date.now() + perAddr * leftA : null;
    const kmEst = +(((D.km || 0) / 1000) + (fin.base || 0)).toFixed(1);
    const kmGps = sess.trk ? +(sess.trk.m / 1000).toFixed(1) : 0;
    const km = fin.km != null ? fin.km : kmGps >= 1 ? kmGps : kmEst;
    const kmSrc = fin.km != null ? "informado por você" : kmGps >= 1 ? "medido pelo GPS" : "estimado: rota" + (fin.base ? " + ida e volta do CD" : "");
    const doneBy = k => all().filter(p => pkgDone(p) && srcOf(p) === k).length;
    const pS = doneBy("shopee"), pM = doneBy("ml"), pO = doneBy("outro");
    const gS = fin.pay ? (fin.mode === "pacote" ? fin.pay * pS : fin.pay) : 0;
    const gM = fin.payMl || 0;
    const gain = fin.pay || fin.payMl ? gS + gM : null;
    const liters = fin.kml > 0 ? km / fin.kml : 0;
    const fuel = fin.price ? liters * fin.price : 0;
    const other = fin.other || 0;
    const profit = gain != null ? gain - fuel - other : null;
    const hours = elapsed / 3.6e6;
    return { elapsed, doneA, doneP, leftA, perAddr, pkgsPerAddr, finish, km, kmEst, kmGps, kmSrc, liters, gain, gS, gM, pS, pM, pO, fuel, other, profit, hours };
  }
  // A rota de hoje no formato do histórico.
  function todayRec() {
    const s = stats();
    return {
      id: D.at + sess.start, t: sess.start, at: D.at, p: s.doneP, a: s.doneA, total: all().length, ms: s.elapsed,
      km: s.km, kmEst: s.kmEst, kmGps: s.kmGps, fuel: +s.fuel.toFixed(2), other: s.other, g: s.gain || 0, l: s.profit || 0,
      gS: s.gS, gM: s.gM, pS: s.pS, pM: s.pM, pO: s.pO,
      later: (D.laterEver || []).length, att2: all().filter(p => pkgDone(p) && attempt(p) > 1).length,
    };
  }
  function renderSession() {
    const s = stats();
    $("session").innerHTML = !sess.start
      ? `<h2>Pronto para começar?</h2><p>Toque quando sair para a primeira entrega. O app conta o tempo e monta o seu painel.</p><button type="button" data-start="1">Iniciar entregas</button>`
      : !sess.end
        ? `<div class="eyebrow" style="color:inherit;opacity:.85">Entregando desde ${hhmm(sess.start)}</div><div class="clock">${clock(s.elapsed)}</div><button type="button" class="stop" data-end="1">Finalizar entregas</button>`
        : `<div class="eyebrow" style="color:inherit;opacity:.85">Entregas de ${hhmm(sess.start)} às ${hhmm(sess.end)}</div><div class="clock">${dur(s.elapsed)}</div><button type="button" data-reopen="1">Retomar cronômetro</button>`;
  }
  let histPer = store.get("re:per", 30);
  const n1 = (v, d = 1) => (v == null || !isFinite(v) ? "–" : v.toLocaleString("pt-BR", { maximumFractionDigits: d, minimumFractionDigits: d }));
  const pctTxt = v => (v == null || !isFinite(v) ? "–" : Math.round(v * 100) + "%");
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
    const cmp = D.cmp && D.cmp.shopee > D.cmp.app + 300 ? ` A ordem do app tem ${fmtDist(D.cmp.shopee - D.cmp.app)} a menos que a da Shopee.` : "";
    $("forecast").textContent = fc + cmp;

    // Bruto → combustível → outros gastos → líquido. Pago por rota: o valor por pacote divide pelos pacotes da rota.
    const noPay = s.gain == null;
    const perRoute = fin.mode !== "pacote" && !sess.end;
    const pkgBase = Math.max(1, perRoute ? all().length : s.doneP || all().length);
    $("money").innerHTML = noPay
      ? `<p class="sub">Informe quanto a rota paga em <b>Valores do dia</b> para ver o bruto e o líquido.</p>`
      : `<div class="wf">
          <div><span>Bruto${s.gM && s.gS ? ` <small>Shopee ${brl(s.gS)} · Mercado Livre ${brl(s.gM)}</small>` : ""}</span><b>${brl(s.gain)}</b></div>
          <div class="minus"><span>Combustível <small>${n1(s.km)} km ${s.kmSrc} · ${n1(s.liters)} L</small></span><b>− ${brl(s.fuel)}</b></div>
          ${s.other ? `<div class="minus"><span>Outros gastos</span><b>− ${brl(s.other)}</b></div>` : ""}
          <div class="total ${s.profit >= 0 ? "good" : "bad"}"><span>Líquido <small>margem ${pctTxt(s.gain ? s.profit / s.gain : null)}</small></span><b>${brl(s.profit)}</b></div>
        </div>
        <div class="grid2">${[
          [brl(s.gain / pkgBase), "bruto por pacote" + (perRoute ? " da rota" : "")],
          [brl(s.profit / pkgBase), "líquido por pacote" + (perRoute ? " da rota" : "")],
          [s.hours > 0.5 ? brl(s.profit / s.hours) : "–", "líquido por hora"],
          [s.km ? brl(s.profit / s.km) : "–", "líquido por km"],
        ].map(([b, l]) => `<div class="kpi"><b>${b}</b><span>${l}</span></div>`).join("")}</div>`;
    if (noPay) $("finBox").open = true;

    // Indicadores de hoje x média das rotas anteriores
    const past = hist.filter(r => !sess.start || r.id !== D.at + sess.start);
    const avg = past.length ? Core.summarize(past) : null;
    // Hoje só entra na comparação com dados suficientes: rota finalizada ou 30 min e 10 pacotes.
    const enough = sess.end || (s.elapsed >= 30 * 60000 && s.doneP >= 10);
    const today = sess.start && enough ? Core.routeKpis(todayRec()) : null;
    const IND = [
      ["Pacotes por hora", "pkgPerHour", v => n1(v), 1],
      ["Minutos por parada", "minPerStop", v => n1(v), -1],
      ["Km por pacote", "kmPerPkg", v => n1(v, 2), -1],
      ["Bruto por pacote", "grossPerPkg", brl, 1],
      ["Líquido por pacote", "netPerPkg", brl, 1],
      ["Líquido por hora", "netPerHour", brl, 1],
      ["Margem líquida", "margin", pctTxt, 1],
    ];
    $("ind").innerHTML = !today && !avg
      ? `<p class="sub">Os indicadores aparecem depois de 30 minutos de entrega. A comparação começa depois da primeira rota finalizada.</p>`
      : `${!today && sess.start ? `<p class="sub">Os números de hoje aparecem depois de 30 minutos e 10 pacotes entregues. Abaixo, a sua média.</p>` : ""}<div class="ind">${IND.map(([name, k, f, dir]) => {
          const tv = today ? today[k] : null, av = avg ? avg[k] : null;
          let delta = "";
          if (tv != null && av) {
            const ch = tv / av - 1, good = ch * dir >= 0;
            if (Math.abs(ch) >= 0.03) delta = `<span class="delta ${good ? "up" : "down"}">${ch > 0 ? "▲" : "▼"} ${Math.abs(Math.round(ch * 100))}%</span>`;
          }
          return `<div class="ind-row"><span class="ind-name">${name}</span><b>${today ? f(tv) : avg ? f(av) : "–"}</b><span class="ind-avg">${today && avg ? "média " + f(av) : avg ? "sua média" : ""}</span>${delta}</div>`;
        }).join("")}</div>`;

    // Oportunidades
    const ins = Core.insights(hist);
    const issueN = issues.size;
    const extraOpp = [];
    if (issueN) extraOpp.push({ tone: "warn", text: `${issueN} endereço${issueN > 1 ? "s" : ""} da rota de hoje com rua, CEP ou posição que não batem. Conferir antes de sair evita voltas.`, act: `<button type="button" class="line" data-issues="1">Conferir endereços</button>` });
    if (D.cmp && D.cmp.shopee > D.cmp.app * 1.1) extraOpp.push({ tone: "good", text: `A ordem do app economiza ${fmtDist(D.cmp.shopee - D.cmp.app)} (${Math.round((1 - D.cmp.app / D.cmp.shopee) * 100)}%) em relação à ordem da Shopee nos ${D.cmp.n} endereços que faltavam.` });
    const opps = extraOpp.concat(ins);
    $("opps").innerHTML = opps.length
      ? opps.map(o => `<div class="opp ${o.tone}"><p>${esc(o.text)}</p>${o.act || ""}</div>`).join("")
      : `<p class="sub">Depois de duas ou três rotas finalizadas, o app compara cada dia com a sua média e mostra onde dá para ganhar tempo e dinheiro.</p>`;

    renderHist();
  }

  // ---------- histórico ----------
  function histRows() {
    const cut = histPer ? Date.now() - histPer * 864e5 : 0;
    return hist.filter(r => r.t >= cut).sort((a, b) => b.t - a.t);
  }
  function renderHist() {
    document.querySelectorAll("[data-per]").forEach(b => b.classList.toggle("on", +b.dataset.per === histPer));
    const rows = histRows();
    if (!rows.length) {
      $("histSum").innerHTML = ""; $("histChart").innerHTML = "";
      $("hist").innerHTML = `<p class="hempty">${hist.length ? "Nenhuma rota neste período." : `Quando você tocar em "Finalizar entregas", a rota aparece aqui. Para comparar com rotas que você já fez, use "Registrar rota anterior".`}</p>`;
      return;
    }
    const sm = Core.summarize(rows);
    $("histSum").innerHTML = [
      [sm.n, sm.n > 1 ? "rotas" : "rota"],
      [sm.p, "pacotes entregues"],
      [brl(sm.gross), "bruto"],
      [brl(sm.net), "líquido", sm.net >= 0 ? "good" : "bad"],
      [brl(sm.perRoute.gross), "bruto médio por rota"],
      [brl(sm.perRoute.net), "líquido médio por rota"],
      [brl(sm.grossPerPkg), "valor médio por pacote"],
      [brl(sm.netPerPkg), "líquido médio por pacote"],
      [sm.perRoute.km != null ? n1(sm.perRoute.km) + " km" : "–", "km médio por rota"],
      [brl(sm.perRoute.fuel), "combustível médio por rota"],
    ].map(([b, l, c]) => `<div class="kpi ${c || ""}"><b>${b}</b><span>${l}</span></div>`).join("")
      + Object.entries(sm.plat).map(([k, v]) => `<div class="kpi"><b>${brl(v.perPkg)}</b><span>por pacote · ${esc(k)} (${v.p} pct)</span></div>`).join("");
    // Gráfico: bruto e líquido das últimas 14 rotas do período, da mais antiga para a mais nova.
    const last = rows.slice(0, 14).reverse();
    const ks = last.map(r => ({ r, k: Core.routeKpis(r) }));
    const max = Math.max(...ks.map(x => x.k.gross), 1);
    const W = 340, H = 150, bw = W / ks.length;
    $("histChart").innerHTML = `<div class="legend"><span><i class="lg-g"></i>Bruto</span><span><i class="lg-n"></i>Líquido</span></div>
      <svg viewBox="0 0 ${W} ${H + 18}" role="img" aria-label="Bruto e líquido por rota">
        <line x1="0" x2="${W}" y1="${H}" y2="${H}" class="axis"/>
        ${ks.map((x, i) => {
          const gh = x.k.gross / max * (H - 8), nh = Math.max(0, x.k.net) / max * (H - 8), cx = i * bw;
          const w = Math.min(14, bw * 0.34);
          return `<rect class="bar-g" x="${(cx + bw / 2 - w - 1).toFixed(1)}" y="${(H - gh).toFixed(1)}" width="${w.toFixed(1)}" height="${gh.toFixed(1)}" rx="2"><title>${new Date(x.r.t).toLocaleDateString("pt-BR")}: bruto ${brl(x.k.gross)}</title></rect>
            <rect class="bar-n" x="${(cx + bw / 2 + 1).toFixed(1)}" y="${(H - nh).toFixed(1)}" width="${w.toFixed(1)}" height="${nh.toFixed(1)}" rx="2"><title>líquido ${brl(x.k.net)}</title></rect>
            ${ks.length <= 10 || i % 2 === 0 ? `<text x="${(cx + bw / 2).toFixed(1)}" y="${H + 13}" text-anchor="middle">${new Date(x.r.t).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</text>` : ""}`;
        }).join("")}
      </svg>`;
    $("hist").innerHTML = rows.map(r => {
      const k = Core.routeKpis(r);
      const day = new Date(r.t).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
      return `<div class="hrow"><span class="hd">${esc(day)}<small>${r.p} pct${k.km ? " · " + n1(k.km) + " km" : ""}${r.manual ? " · registrada à mão" : ""}</small></span><span class="hv ${k.net >= 0 ? "" : "neg"}">${brl(k.net)}</span>
        <span class="hs">Bruto ${brl(k.gross)} · combustível ${brl(k.fuel)}${k.other ? " · outros " + brl(k.other) : ""} · ${brl(k.netPerPkg)} por pacote</span><button type="button" class="tiny" data-histedit="${esc(r.id)}" aria-label="Editar rota de ${new Date(r.t).toLocaleDateString("pt-BR")}">Editar</button></div>`;
    }).join("");
  }
  // Registrar ou editar uma rota (para trazer rotas antigas e comparar).
  function openHistForm(id) {
    const r = id ? hist.find(x => x.id === id) : null;
    const v = (x, d = "") => (x == null || x === "" ? d : x);
    const day = new Date(r ? r.t : Date.now() - 864e5);
    const iso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
    const k = r ? Core.routeKpis(r) : null;
    $("scanOverlay").hidden = false;
    $("scanSheet").innerHTML = `<div class="addr-big">${r ? "Editar rota" : "Registrar rota anterior"}</div>
      <p class="sub">Preencha o que souber. Se o combustível ficar em branco, o app calcula pelo km, pelo preço do litro e pelo consumo dos Valores do dia.</p>
      <div class="form">
        <label for="hDay" class="full">Dia<input id="hDay" type="date" value="${iso}"></label>
        <label for="hPS">Pacotes Shopee<input id="hPS" type="number" inputmode="numeric" value="${v(r?.pS ?? (r && !r.pM ? r.p : ""))}"></label>
        <label for="hPM">Pacotes Mercado Livre<input id="hPM" type="number" inputmode="numeric" value="${v(r?.pM)}"></label>
        <label for="hGS">Shopee pagou (R$)<input id="hGS" type="number" inputmode="decimal" step="0.01" value="${v(r?.gS ?? (r && !r.gM ? r.g : ""))}"></label>
        <label for="hGM">Mercado Livre pagou (R$)<input id="hGM" type="number" inputmode="decimal" step="0.01" value="${v(r?.gM)}"></label>
        <label for="hA">Paradas (opcional)<input id="hA" type="number" inputmode="numeric" value="${v(r?.a)}"></label>
        <label for="hH">Horas trabalhadas<input id="hH" type="number" inputmode="decimal" step="0.25" value="${r ? +(r.ms / 3.6e6).toFixed(2) : ""}"></label>
        <label for="hKm">Km rodados<input id="hKm" type="number" inputmode="decimal" step="0.1" value="${v(r?.km)}"></label>
        <label for="hFuel">Combustível (R$)<input id="hFuel" type="number" inputmode="decimal" step="0.01" value="${r ? +k.fuel.toFixed(2) : ""}"></label>
        <label for="hOther" class="full">Outros gastos (R$): pedágio, estacionamento, alimentação<input id="hOther" type="number" inputmode="decimal" step="0.01" value="${v(r?.other)}"></label>
      </div>
      <button type="button" class="primary" data-histsave="${esc(id || "")}">${r ? "Salvar alterações" : "Registrar rota"}</button>
      ${r ? `<button type="button" class="danger" data-histdel="${esc(id)}">Apagar esta rota</button>` : ""}
      <button type="button" class="line" data-close="1">Cancelar</button>`;
  }
  function saveHistForm(id) {
    const num = k => { const x = parseFloat(String($(k).value).replace(",", ".")); return isFinite(x) ? x : null; };
    const day = $("hDay").value ? new Date($("hDay").value + "T08:00:00") : null;
    const pS = num("hPS") || 0, pM = num("hPM") || 0, gS = num("hGS") || 0, gM = num("hGM") || 0;
    if (!day || !(pS + pM)) return toast("Informe o dia e quantos pacotes entregou.");
    const km = num("hKm");
    let fuel = num("hFuel");
    if (fuel == null && km && fin.kml > 0 && fin.price) fuel = +(km / fin.kml * fin.price).toFixed(2);
    const old = id ? hist.find(x => x.id === id) : null;
    const rec = {
      ...(old || {}), id: id || "man" + Date.now(), t: day.getTime(), manual: old ? old.manual : true,
      p: pS + pM, pS, pM, pO: 0, gS, gM, g: gS + gM, a: num("hA") || 0, ms: (num("hH") || 0) * 3.6e6,
      km: km || 0, fuel: fuel || 0, other: num("hOther") || 0,
    };
    rec.l = rec.g - rec.fuel - rec.other;
    hist = hist.filter(r => r.id !== rec.id).concat(rec);
    store.set("re:hist", hist);
    $("scanOverlay").hidden = true; renderPainel();
    toast(old ? "Rota atualizada" : "Rota registrada");
  }
  function exportCsv() {
    const rows = hist.slice().sort((a, b) => a.t - b.t);
    if (!rows.length) return toast("O histórico ainda está vazio.");
    const head = ["Dia", "Pacotes", "Pacotes Shopee", "Pacotes Mercado Livre", "Paradas", "Horas", "Km", "Combustível (R$)", "Outros gastos (R$)", "Bruto (R$)", "Shopee (R$)", "Mercado Livre (R$)", "Líquido (R$)", "Bruto por pacote", "Líquido por pacote", "Km por pacote", "Pacotes por hora", "Líquido por hora", "Margem", "Voltar depois", "Nova tentativa"];
    const f = v => (v == null || !isFinite(v) ? "" : String(+v.toFixed(2)).replace(".", ","));
    const lines = rows.map(r => {
      const k = Core.routeKpis(r);
      return [new Date(r.t).toLocaleDateString("pt-BR"), r.p, r.pS ?? "", r.pM ?? "", r.a || "", f(k.hours), f(k.km || null), f(k.fuel), f(k.other), f(k.gross), f(r.gS), f(r.gM), f(k.net), f(k.grossPerPkg), f(k.netPerPkg), f(k.kmPerPkg), f(k.pkgPerHour), f(k.netPerHour), k.margin != null ? Math.round(k.margin * 100) + "%" : "", r.later ?? "", r.att2 ?? ""].join(";");
    });
    const blob = new Blob(["﻿" + head.join(";") + "\n" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `rota-certa-historico-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast("Planilha do histórico baixada");
  }
  function endSession() {
    if (!sess.start) return;
    sess.end = Date.now();
    const rec = todayRec();
    hist = hist.filter(r => r.id !== rec.id).concat(rec);
    store.set("re:hist", hist); save(); renderAll();
    location.hash = "#painel";
    toast(`Dia encerrado: ${rec.p} pacotes em ${dur(rec.ms)}`);
  }
  [["fPay", "pay"], ["fPayMl", "payMl"], ["fPrice", "price"], ["fKml", "kml"], ["fKm", "km"], ["fBase", "base"], ["fOther", "other"]].forEach(([id, k]) => {
    $(id).value = fin[k] ?? "";
    $(id).addEventListener("input", e => { const v = parseFloat(String(e.target.value).replace(",", ".")); fin[k] = isFinite(v) ? v : null; store.set("re:fin", fin); if (active) renderPainel(); });
  });
  $("fMode").value = fin.mode; $("fMode").addEventListener("change", e => { fin.mode = e.target.value; store.set("re:fin", fin); if (active) renderPainel(); });
  $("fEnd").value = fin.endTime || ""; $("fEnd").addEventListener("change", e => { fin.endTime = e.target.value; store.set("re:fin", fin); if (active) renderPainel(); });

  // ---------- conferência de endereço: rua x CEP x posição ----------
  // 1) Pino longe das casas vizinhas da mesma rua ou do mesmo CEP (sem internet).
  // 2) A rua da etiqueta x a rua do CEP no ViaCEP.
  // 3) Para cada alerta, a posição sugerida: pela numeração das casas vizinhas, pela busca do endereço e pela rua do CEP.
  let issues = new Map(), pinFix = null, checking = false;
  const cepCache = store.get("re:cep", {}), geoCache = store.get("re:geoq", {});
  const fmtCep = c => (c && c.length === 8 ? c.slice(0, 5) + "-" + c.slice(5) : c || "");
  async function viaCep(cep) {
    if (cepCache[cep] !== undefined) return cepCache[cep];
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      if (!r.ok) return r.status === 400 ? (cepCache[cep] = { erro: true }) : null;
      const j = await r.json();
      cepCache[cep] = j.erro ? { erro: true } : { logradouro: j.logradouro || "", bairro: j.bairro || "", localidade: j.localidade || "", uf: j.uf || "" };
      store.set("re:cep", cepCache);
      return cepCache[cep];
    } catch { return null; }
  }
  let geoQ = Promise.resolve();
  function geocode(q) {
    if (geoCache[q] !== undefined) return Promise.resolve(geoCache[q]);
    const job = geoQ.then(async () => {
      if (geoCache[q] !== undefined) return geoCache[q];
      try {
        const r = await (await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=br&limit=1&q=${encodeURIComponent(q)}`)).json();
        geoCache[q] = r[0] ? { lat: +r[0].lat, lng: +r[0].lon } : null;
        store.set("re:geoq", geoCache);
      } catch { geoCache[q] = undefined; }
      await new Promise(res => setTimeout(res, 1100)); // regra do Nominatim: 1 busca por segundo
      return geoCache[q] ?? null;
    });
    geoQ = job.catch(() => null);
    return job;
  }
  async function checkAddresses() {
    if (!D || checking) return;
    checking = true;
    try {
      const ok_ = D.fixOk || {}, found = new Map();
      const fixed = a => a.pkgs.every(p => D.fix?.[p.tn]);
      Core.pinOutliers(A).forEach((o, key) => {
        const a = byKey.get(key);
        if (!a || fixed(a)) return;
        found.set(key, { pin: o.why === "rua" ? `O pino está a ${fmtDist(o.meters)} da casa ${o.ref.num} da mesma rua.` : `O pino está a ${fmtDist(o.meters)} dos outros endereços do CEP ${fmtCep(a.cep)}.`, near: o.guess });
      });
      const ceps = [...new Set(A.map(a => a.cep).filter(Boolean))].filter(c => cepCache[c] === undefined);
      for (let i = 0; i < ceps.length; i += 4) await Promise.all(ceps.slice(i, i + 4).map(viaCep));
      A.forEach(a => {
        if (!a.cep || a.key.startsWith("geo|") || fixed(a)) return;
        const c = Core.cepCheck(a.street, cepCache[a.cep]);
        if (c.status === "mismatch") found.set(a.key, { ...(found.get(a.key) || {}), cep: `O CEP ${fmtCep(a.cep)} é da ${c.name}, não da rua da etiqueta.`, cepStreet: c.name });
        else if (c.status === "invalid") found.set(a.key, { ...(found.get(a.key) || {}), cep: `O CEP ${fmtCep(a.cep)} não existe nos Correios.` });
      });
      issues = new Map([...found].filter(([k]) => !ok_[k] && byKey.has(k)));
      renderIssues();
      for (const [key, it] of issues) {
        const a = byKey.get(key);
        if (!a || !a.num) continue;
        const city = a.pkgs[0].city || cepCache[a.cep]?.localidade || "";
        const g1 = await geocode(`${streetName(a)}, ${a.num}, ${city}`);
        if (g1 && Core.hav(g1, a) > 120) it.label = g1;
        if (it.cepStreet) { const g2 = await geocode(`${it.cepStreet}, ${a.num}, ${city}`); if (g2 && Core.hav(g2, a) > 120) it.byCep = g2; }
        if (issues.has(key)) renderIssues();
      }
    } finally { checking = false; }
  }
  function renderIssues() {
    const n = issues.size;
    const box = `<button type="button" class="issue-bar" data-issues="1"><b>${n} endereço${n > 1 ? "s" : ""} para conferir</b><span>Rua, CEP ou posição no mapa não batem. Corrigir antes de sair evita voltas.</span></button>`;
    $("issueBox").innerHTML = n ? box : "";
    $("issueAj").innerHTML = n ? box : `<p class="sub">${checking ? "Conferindo os endereços…" : "Nenhum endereço com rua, CEP ou posição estranhos."}</p>`;
    if (!$("scanOverlay").hidden && $("issuesView")) openIssues();
  }
  function openIssues() {
    $("scanOverlay").hidden = false;
    const opt = (key, which, pt, lbl, a) => (pt ? `<button type="button" class="line" data-fixuse="${esc(key)}::${which}" data-lbl="${esc(lbl)}">Usar posição ${esc(lbl)}<small>${fmtDist(Core.hav(pt, a))} do pino atual</small></button>` : "");
    $("scanSheet").innerHTML = `<div class="addr-big" id="issuesView">Conferir endereços</div>
      <p class="sub">O app cruza a rua da etiqueta, o CEP (Correios) e a posição das casas vizinhas. Escolha a posição certa e a rota é refeita na hora.</p>
      ${issues.size ? [...issues].map(([key, it]) => {
        const a = byKey.get(key); if (!a) return "";
        return `<div class="issue">
          <div class="issue-top"><span class="mini-n">${a.n}</span><span><b>${esc(a.label)}</b><br><span class="sub">${esc([shopee(a), a.cep ? "CEP " + fmtCep(a.cep) : "", a.pkgs.length + " pacote" + (a.pkgs.length > 1 ? "s" : "")].filter(Boolean).join(" · "))}</span></span></div>
          ${it.pin ? `<p>📍 ${esc(it.pin)}</p>` : ""}${it.cep ? `<p>✉️ ${esc(it.cep)}</p>` : ""}
          <div class="issue-opts">
            ${opt(key, "near", it.near, "pelas casas vizinhas", a)}${opt(key, "label", it.label, "pela rua da etiqueta", a)}${opt(key, "byCep", it.byCep, "pela rua do CEP", a)}
            ${!it.near && !it.label && !it.byCep ? `<p class="sub">${checking ? "Procurando a posição certa…" : "Sem posição sugerida. Marque no mapa ou confira com o cliente."}</p>` : ""}
            <div class="nav3"><button type="button" class="line" data-fixpin="${esc(key)}">Marcar no mapa</button><button type="button" class="line" data-sel="${esc(key)}">Ver no mapa</button><button type="button" class="line" data-fixok="${esc(key)}">Está certo</button></div>
          </div></div>`;
      }).join("") : `<p>Tudo certo: nenhum endereço para conferir.</p>`}
      <button type="button" class="line" data-close="1">Fechar</button>`;
  }
  function applyFix(key, pt, label) {
    const a = byKey.get(key);
    if (!a || !pt) return;
    D.fix = D.fix || {};
    a.pkgs.forEach(p => (D.fix[p.tn] = { lat: pt.lat, lng: pt.lng }));
    issues.delete(key);
    const before = D.cmp?.app;
    derive(); plan(nextAddr()?.key); save(); numberOrder(); fillAjustes(); drawMarkers(false); renderAll(); renderIssues();
    if (!$("scanOverlay").hidden && $("issuesView")) { if (issues.size) openIssues(); else $("scanOverlay").hidden = true; }
    toast(`Posição corrigida (${label}). Rota refeita${before && D.cmp ? `: ${n1(D.cmp.app / 1000)} km` : ""}.`);
  }

  // ---------- ajustes ----------
  function fillAjustes() {
    $("fileInfo").textContent = `${D.at} · ${D.pkgs.length} da Shopee${D.extra?.length ? ` + ${D.extra.length} adicionados` : ""} · ${A.length} endereços`;
    $("unplaced").innerHTML = (D.unplaced || []).length ? `<div class="offroute"><b>${D.unplaced.length} endereço(s) não encontrado(s) no mapa.</b> Toque para buscar de novo ou marcar no mapa.</div>` + D.unplaced.map((p, i) => `<button type="button" class="row" style="grid-template-columns:minmax(0,1fr) auto" data-place="${i}"><span><b>${esc(p.address)}</b><br><span class="sub">${esc(PLATFORMS[p.src]?.name || p.src)}${p.code ? " · " + esc(p.code) : ""}</span></span><span class="count">Localizar</span></button>`).join("") : "";
    $("extraList").innerHTML = (D.extra || []).length ? D.extra.map(p => `<div class="row" style="grid-template-columns:minmax(0,1fr) auto"><span><b>${esc(p.address)}</b><br><span class="sub">${esc(PLATFORMS[p.src]?.name || p.src)}${p.code ? " · " + esc(p.code) : ""}</span></span><button type="button" class="line" data-rmextra="${esc(p.tn)}">Remover</button></div>`).join("") : `<p class="sub">Nenhum pacote adicionado à mão.</p>`;
    $("fKm").placeholder = (((D.km || 0) / 1000) + (fin.base || 0)).toFixed(1) + " (estimado)";
    $("routeCmp").innerHTML = D.cmp ? `Ordem calculada para ${D.cmp.n} endereços: <b>${fmtDist(D.cmp.app)}</b> na ordem do app${D.cmp.from ? " saindo de onde você estava" : ""}, ${fmtDist(D.cmp.shopee)} na ordem da Shopee${D.cmp.shopee > D.cmp.app + 100 ? ` (<b>${fmtDist(D.cmp.shopee - D.cmp.app)} a menos</b>)` : ""}. Distância pela rua estimada.` : "";
    const sorted = A.slice().sort((a, b) => (a.shopeeStops[0] ?? 1e9) - (b.shopeeStops[0] ?? 1e9));
    $("start").innerHTML = sorted.map(a => `<option value="${esc(a.key)}">${esc(a.label)}${a.shopeeStops.length ? " (Shopee " + a.shopeeStops.join(", ") + ")" : ""}</option>`).join("");
    const rows = [];
    order.forEach(a => a.pkgs.forEach(p => rows.push({ s: p.shopeeStop, a, p })));
    rows.sort((x, y) => (x.s ?? 1e9) - (y.s ?? 1e9) || x.a.n - y.a.n);
    $("dp").innerHTML = `<thead><tr><th>Shopee</th><th>Nossa parada</th><th>Endereço</th><th>Pacote</th></tr></thead><tbody>${rows.map(r => `<tr><td>${r.s ?? "sem nº"}</td><td>${r.a.n}</td><td style="text-align:left">${esc(r.a.label)}</td><td class="mono">${esc(tail(r.p.tn))}</td></tr>`).join("")}</tbody>`;
  }
  $("showDone").checked = showDone;
  $("showDone").addEventListener("change", e => { showDone = e.target.checked; store.set("re:showDone", showDone); drawMarkers(false); });
  $("routeMode").value = mode;
  $("routeMode").addEventListener("change", e => setMode(e.target.value));
  $("areaR").value = areaRadius;
  $("areaR").addEventListener("change", e => {
    areaRadius = Math.max(200, Math.min(2000, +e.target.value || 700)); e.target.value = areaRadius; store.set("re:areaR", areaRadius);
    if (D) { D.areaSeeds = []; D.areaOf = {}; ensureAreas(); save(); renderAll(); toast("Áreas refeitas"); }
  });
  $("bagMode").value = bagMode;
  $("bagMode").addEventListener("change", e => { bagMode = e.target.value; store.set("re:bag", bagMode); renderAll(); toast("Sacos atualizados"); });
  $("recalc").addEventListener("click", () => { plan($("start").value); save(); numberOrder(); fillAjustes(); drawMarkers(false); renderAll(); toast("Ordem refeita"); });
  $("recalcHere").addEventListener("click", () => {
    if (!here) { startGps(false); return toast("Ligando a localização. Toque de novo em alguns segundos."); }
    curKey = null; plan(null, true); save(); numberOrder(); fillAjustes(); drawMarkers(false); renderAll(); updateNav(true);
    toast(`Rota refeita a partir de onde você está: ${fmtDist(D.cmp.app)}`);
  });

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
    if (pinFix) { const k = pinFix; pinFix = null; $("maptip").hidden = true; applyFix(k, { lat: e.latlng.lat, lng: e.latlng.lng }, "marcada no mapa"); return; }
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
      if (p) { D.checked = D.checked || {}; D.checked[p.tn] = D.checked[p.tn] || Date.now(); save(); renderList(); buzz(60); return openScan(byTn.get(p.tn), p.tn); }
      buzz([200, 80, 200]);
      openScan(null, null, `<div class="miss"><b>${read.length ? "Este pacote não está nesta rota" : "Não consegui ler o código"}</b><span class="sub">${read.length ? "Código lido: " + esc(read.join(", ")) : "Fotografe só a etiqueta, de perto e com luz."}</span></div>
        <label class="btn primary" for="photo">Tentar de novo</label><button type="button" class="line" data-close="1">Fechar</button>`);
    } catch { openScan(null, null, `<div class="miss"><b>Não consegui ler o código</b></div><button type="button" class="line" data-close="1">Fechar</button>`); }
  });

  // ---------- conferir pacotes por foto (várias de uma vez) ----------
  // Lê o código de cada etiqueta, marca como conferido e mostra a área de cada pacote, para separar por área de uma vez.
  $("photoMany").addEventListener("change", async e => {
    const files = [...e.target.files];
    e.target.value = "";
    if (!files.length) return;
    if (!active) return toast("Abra a planilha da rota antes de conferir.");
    if (!window.ZXing) return toast("O leitor de código não carregou. Confira a internet.");
    D.checked = D.checked || {};
    const found = [], fails = [], others = [];
    $("scanOverlay").hidden = false;
    for (let i = 0; i < files.length; i++) {
      $("scanSheet").innerHTML = `<div class="addr-big">Lendo etiquetas</div><p>${i + 1} de ${files.length}</p><div class="bar" style="background:var(--line)"><i style="width:${((i + 1) / files.length * 100).toFixed(0)}%;background:var(--brand)"></i></div>`;
      try {
        const { p, read } = await decodePhoto(files[i]);
        if (p) { D.checked[p.tn] = Date.now(); found.push(p); }
        else if (read.length) others.push(read[0]); else fails.push(i + 1);
      } catch { fails.push(i + 1); }
    }
    save(); renderAll();
    showChecked(found, fails, others);
  });
  let onlyMissing = false;
  function showChecked(found, fails, others) {
    const chk = D.checked || {};
    const areas = [...new Set(order.map(areaOf))].sort((x, y) => x - y);
    const rows = areas.map(n => {
      const all_ = order.filter(a => areaOf(a) === n).flatMap(a => a.pkgs.filter(p => !pkgDone(p)).map(p => ({ p, a })));
      const pk = onlyMissing ? all_.filter(x => !chk[x.p.tn]) : all_;
      if (!pk.length) return "";
      const got = all_.filter(x => chk[x.p.tn]);
      return `<div class="card" style="background:var(--bg)"><div class="area-head" style="margin:0"><b>Área ${n}</b><span>${got.length}/${all_.length} conferidos</span></div>
        <div class="chklist">${pk.map(x => `<button type="button" class="${chk[x.p.tn] ? "on" : ""}" data-chk="${esc(x.p.tn)}"><span class="box">${chk[x.p.tn] ? "✓" : ""}</span><b class="mono">${esc(tail(x.p.tn))}</b><span class="sub">${esc(x.a.label)}${bagOf(x.p, x.a) && bagMode !== "area" ? " · saco " + esc(bagOf(x.p, x.a)) : ""}</span></button>`).join("")}</div></div>`;
    }).join("");
    $("scanOverlay").hidden = false;
    $("scanSheet").innerHTML = `<div class="addr-big">Conferência por área</div>
      ${found.length || fails.length || others.length ? `<p>${found.length} etiqueta(s) lida(s)${others.length ? ` · ${others.length} de fora da rota` : ""}${fails.length ? ` · ${fails.length} foto(s) sem código legível (nº ${fails.join(", ")})` : ""}.</p>` : ""}
      ${found.length ? `<div class="chips">${found.map(p => `<span class="chip area">${esc(tail(p.tn))} → Área ${areaOf(byTn.get(p.tn))}</span>`).join("")}</div>` : ""}
      <p class="sub">Coloque os pacotes de cada área juntos (saco ou caixa). Marcado = já conferido. Etiqueta não saiu na foto? Toque no pacote para marcar à mão.</p>
      <label style="display:flex;gap:10px;align-items:center"><input type="checkbox" id="onlyMissing" ${onlyMissing ? "checked" : ""} style="width:24px;height:24px"> Mostrar só os que faltam</label>
      ${rows}
      <label class="btn primary" for="photoMany">Fotografar mais pacotes</label>
      <button type="button" class="line" data-close="1">Fechar</button>`;
  }

  document.addEventListener("change", e => { if (e.target.id === "onlyMissing") { onlyMissing = e.target.checked; showChecked([], [], []); } });

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
