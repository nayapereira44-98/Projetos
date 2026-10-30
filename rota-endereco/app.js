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
  const pkgDone = p => !!ok[p.tn];
  const addrDone = a => a.pkgs.every(pkgDone);
  const extra = p => p.address.split(",").slice(2).join(",").trim();
  const streetName = a => a.label.split(",")[0].trim();
  const shopee = a => (a.shopeeStops.length ? "Shopee " + a.shopeeStops.join(" · ") : "") + (a.unseq ? (a.shopeeStops.length ? " · " : "") + "sem nº" : "");
  const nextAddr = () => order.find(a => !addrDone(a));

  function derive() {
    A = Core.buildAddresses(D.pkgs);
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
    const done = D.pkgs.filter(pkgDone).length;
    $("meta").textContent = `${order.filter(addrDone).length}/${order.length} paradas · ${done}/${D.pkgs.length} pacotes`;
    $("bar").hidden = false; $("barFill").style.width = (done / D.pkgs.length * 100).toFixed(1) + "%";
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
      <div class="chips">${shopee(a) ? `<span class="chip shp">${shopee(a)}</span>` : ""}<span class="chip">${a.pkgs.length} pacote${a.pkgs.length > 1 ? "s" : ""}</span>${addrDone(a) ? `<span class="chip ok">Entregue</span>` : ""}${a.pkgs.some(p => p.window) ? `<span class="chip warn">${a.pkgs.map(p => p.window).filter(Boolean).map(w => (w.until ? "até " + w.until : "após " + w.after)).join(" · ")}</span>` : ""}</div>
      ${a.unseq ? `<div class="offroute">${a.unseq === a.pkgs.length ? "Este endereço está" : `${a.unseq} pacote${a.unseq > 1 ? "s" : ""} deste endereço ${a.unseq > 1 ? "estão" : "está"}`} <b>fora da rota da Shopee</b> (sem número de parada). No app da Shopee ${a.unseq > 1 ? "eles aparecem" : "ele aparece"} no topo da lista, longe da parada${a.shopeeStops.length ? " " + a.shopeeStops.join(" e ") : ""}.</div>` : ""}
      ${a.pkgs.length > 1 && pend.length ? `<div class="together">Este endereço tem ${a.pkgs.length} pacotes${a.shopeeStops.length > 1 ? ` de paradas diferentes da Shopee (${a.shopeeStops.join(" e ")})` : ""}. Entregue todos agora.</div>` : ""}
      <div class="pkgs">${a.pkgs.map(p => `<button type="button" class="pkg${pkgDone(p) ? " done" : ""}${p.tn === tn ? " me" : ""}" data-p="${esc(p.tn)}" aria-pressed="${pkgDone(p)}">
        <span class="box">${pkgDone(p) ? ICON_CHECK : ""}</span>
        <span class="t"><b>${esc(tail(p.tn))}</b> · ${p.shopeeStop != null ? "Shopee " + p.shopeeStop : "fora da rota"}${attempt(p) > 1 ? ` · <span class="att">${attempt(p)}ª tentativa</span>` : ""}${extra(p) ? `<br><span class="sub">${esc(extra(p))}</span>` : ""}</span></button>`).join("")}</div>
      <div class="nav3">
        <a class="btn" href="${Core.links.waze(a)}" target="_blank" rel="noopener">Waze</a>
        <a class="btn" href="${Core.links.gmaps(a)}" target="_blank" rel="noopener">Google</a>
        <a class="btn" href="${Core.links.apple(a)}" target="_blank" rel="noopener">Apple</a>
      </div>
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
        <p class="sub">${D.pkgs.length} pacotes em ${order.length} endereços${sess.start && !sess.end ? ` em ${dur(Date.now() - sess.start)}` : ""}.</p>
        ${sess.start && !sess.end ? `<button type="button" class="primary deliver" data-end="1">Finalizar entregas</button>` : `<a class="btn brand" href="#painel">Ver meu painel</a>`}`;
      return;
    }
    sh.innerHTML = `<button type="button" class="grabwrap" data-grab="1" aria-label="Recolher ou abrir o cartão"><span class="grab"></span></button>${addrCard(a)}`;
  }

  // ---------- mapa ----------
  let map = null, markers = new Map(), line = null, me = null, watchId = null, here = null, fitted = false;
  function ensureMap() {
    if (map || !window.L || !active) return;
    map = L.map("map", { zoomControl: false });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
    drawMarkers(true);
  }
  function pinHtml(a) {
    const nx = nextAddr();
    const cls = addrDone(a) ? "done" : a === nx ? "next" : a.pkgs.length > 1 ? "multi" : "";
    return L.divIcon({ className: "", html: `<div class="pin ${cls}${a.key === selKey ? " sel" : ""}">${addrDone(a) ? "✓" : a.n}</div>`, iconSize: [42, 42], iconAnchor: [21, 21] });
  }
  function drawMarkers(fit) {
    if (!map) return;
    markers.forEach(m => m.remove()); markers.clear();
    order.forEach(a => {
      const m = L.marker([a.lat, a.lng], { icon: pinHtml(a), zIndexOffset: addrDone(a) ? 0 : 500 }).addTo(map);
      m.on("click", () => select(a.key, false));
      markers.set(a.key, m);
    });
    drawLine();
    if (fit && order.length && !fitted) { map.fitBounds(L.latLngBounds(order.map(a => [a.lat, a.lng])), { padding: [40, 40] }); fitted = true; }
  }
  function drawLine() {
    line?.remove();
    const pts = order.filter(a => !addrDone(a)).map(a => [a.lat, a.lng]);
    const css = getComputedStyle(document.documentElement).getPropertyValue("--brand").trim() || "#1f5f3a";
    line = pts.length > 1 ? L.polyline(pts, { color: css, weight: 4, opacity: 0.55, dashArray: "2 8", lineCap: "round" }).addTo(map) : null;
  }
  function updateMarkers() {
    if (!map) return;
    if (markers.size !== order.length) return drawMarkers(false);
    order.forEach(a => { const m = markers.get(a.key); if (m) { m.setIcon(pinHtml(a)); m.setZIndexOffset(addrDone(a) ? 0 : a === nextAddr() ? 1000 : 500); } });
    drawLine();
  }
  function select(key, pan = true) {
    selKey = key;
    location.hash = "#mapa";
    $("sheet").classList.remove("min");
    renderSheet(); updateMarkers();
    const a = byKey.get(key);
    if (map && a && pan) map.setView([a.lat, a.lng], Math.max(map.getZoom(), 17));
  }
  $("btnFit").addEventListener("click", () => { if (map && order.length) map.fitBounds(L.latLngBounds(order.map(a => [a.lat, a.lng])), { padding: [40, 40] }); });

  // Localizador: ponto azul ao vivo e a rua pendente mais perto.
  $("btnLocate").addEventListener("click", () => {
    if (watchId != null) {
      navigator.geolocation.clearWatch(watchId); watchId = null; me?.remove(); me = null; here = null;
      $("btnLocate").classList.remove("on"); $("maptip").hidden = true; return;
    }
    if (!navigator.geolocation) return toast("Este navegador não tem localização.");
    $("btnLocate").classList.add("on");
    let first = true;
    watchId = navigator.geolocation.watchPosition(pos => {
      here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      if (map) {
        if (!me) me = L.marker([here.lat, here.lng], { icon: L.divIcon({ className: "", html: `<div class="me-dot"></div>`, iconSize: [18, 18], iconAnchor: [9, 9] }), zIndexOffset: 2000 }).addTo(map);
        else me.setLatLng([here.lat, here.lng]);
        if (first) map.setView([here.lat, here.lng], 17);
      }
      first = false;
      const pend = order.filter(a => !addrDone(a));
      if (pend.length) {
        const n = pend.map(a => ({ a, d: Core.hav(here, a) })).sort((x, y) => x.d - y.d)[0];
        const left = pend.filter(a => a.street === n.a.street).sort((x, y) => x.num - y.num);
        $("maptip").hidden = false;
        $("maptip").innerHTML = `<button type="button" data-sel="${esc(n.a.key)}" style="min-height:0;padding:0;background:none;font:inherit">Perto: ${esc(streetName(n.a))} · ${Math.round(n.d)} m · faltam nº ${left.map(a => a.nums?.join("/") || "?").join(", ")}</button>`;
      }
    }, () => {
      navigator.geolocation.clearWatch(watchId); watchId = null; $("btnLocate").classList.remove("on");
      toast("A localização foi bloqueada. Permita a localização para este site nos ajustes do celular.");
    }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
  });

  // ---------- ações ----------
  function deliverAddr(a) {
    const done = addrDone(a);
    if (!done && !sess.start) { sess = { start: Date.now() }; toast("Cronômetro iniciado"); }
    a.pkgs.forEach(p => (done ? delete ok[p.tn] : (ok[p.tn] = ok[p.tn] || Date.now())));
    save();
    if (!done) {
      buzz(60);
      selKey = null;
      const nx = nextAddr();
      renderAll();
      if (nx) { toast(`Entregue! Próxima: ${nx.label}`); if (map) map.panTo([nx.lat, nx.lng]); }
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
    else if (d.grab) $("sheet").classList.toggle("min");
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
    markers.forEach(m => m.remove()); markers.clear(); line?.remove(); fitted = false;
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
        const m = new Set(Core.matchTN(D.pkgs, q).map(p => byTn.get(p.tn)));
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
          <span><span class="num">${a.nums?.length ? "nº " + a.nums.join(" / ") : esc(a.label)}</span><br><span class="sub">${shopee(a) || "fora da rota"}${a.pkgs.some(p => attempt(p) > 1) ? " · <b class=\"att\">nova tentativa</b>" : ""} · <span class="mono">${a.pkgs.map(p => esc(tail(p.tn))).join(" ")}</span></span></span>
          <span class="count">${a.pkgs.length}</span></button>`).join("")}</div>`;
      i = j;
    }
    $("list").innerHTML = html || `<p class="empty-list">Nada encontrado para "${esc(q)}".</p>`;
  }
  $("q").addEventListener("input", renderList);

  // ---------- painel ----------
  function stats() {
    const now = sess.end || Date.now();
    const elapsed = sess.start ? now - sess.start : 0;
    const doneA = order.filter(addrDone).length, doneP = D.pkgs.filter(pkgDone).length;
    const leftA = order.length - doneA;
    const perAddr = doneA ? elapsed / doneA : null;
    const pkgsPerAddr = D.pkgs.length / order.length;
    const finish = perAddr && !sess.end ? Date.now() + perAddr * leftA : null;
    const km = fin.km ?? +(((D.km || 0) / 1000).toFixed(1));
    const gain = fin.pay ? (fin.mode === "pacote" ? fin.pay * doneP : fin.pay) : null;
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
      [`${s.doneP}/${D.pkgs.length}`, "pacotes entregues"],
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
  [["fPay", "pay"], ["fPrice", "price"], ["fKml", "kml"], ["fKm", "km"]].forEach(([id, k]) => {
    $(id).value = fin[k] ?? "";
    $(id).addEventListener("input", e => { const v = parseFloat(String(e.target.value).replace(",", ".")); fin[k] = isFinite(v) ? v : null; store.set("re:fin", fin); if (active) renderPainel(); });
  });
  $("fMode").value = fin.mode; $("fMode").addEventListener("change", e => { fin.mode = e.target.value; store.set("re:fin", fin); if (active) renderPainel(); });
  $("fEnd").value = fin.endTime || ""; $("fEnd").addEventListener("change", e => { fin.endTime = e.target.value; store.set("re:fin", fin); if (active) renderPainel(); });

  // ---------- ajustes ----------
  function fillAjustes() {
    $("fileInfo").textContent = `${D.at} · ${D.pkgs.length} pacotes · ${A.length} endereços`;
    $("fKm").placeholder = ((D.km || 0) / 1000).toFixed(1) + " (estimado)";
    const sorted = A.slice().sort((a, b) => (a.shopeeStops[0] ?? 1e9) - (b.shopeeStops[0] ?? 1e9));
    $("start").innerHTML = sorted.map(a => `<option value="${esc(a.key)}">${esc(a.label)}${a.shopeeStops.length ? " (Shopee " + a.shopeeStops.join(", ") + ")" : ""}</option>`).join("");
    const rows = [];
    order.forEach(a => a.pkgs.forEach(p => rows.push({ s: p.shopeeStop, a, p })));
    rows.sort((x, y) => (x.s ?? 1e9) - (y.s ?? 1e9) || x.a.n - y.a.n);
    $("dp").innerHTML = `<thead><tr><th>Shopee</th><th>Nossa parada</th><th>Endereço</th><th>Pacote</th></tr></thead><tbody>${rows.map(r => `<tr><td>${r.s ?? "sem nº"}</td><td>${r.a.n}</td><td style="text-align:left">${esc(r.a.label)}</td><td class="mono">${esc(tail(r.p.tn))}</td></tr>`).join("")}</tbody>`;
  }
  $("recalc").addEventListener("click", () => { plan($("start").value); save(); numberOrder(); fillAjustes(); drawMarkers(false); renderAll(); toast("Ordem refeita"); });

  // ---------- escanear ----------
  const findPkgByCode = text => {
    const t = String(text || "").toUpperCase().replace(/\s+/g, "");
    return D?.pkgs.find(p => p.tn && t.includes(p.tn.toUpperCase())) || null;
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
    $("scanSheet").innerHTML = missHtml || `<div class="bigno">Parada ${a.n}</div>${addrCard(a, tn)}
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
