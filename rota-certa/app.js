// Rota Certa — interface. Depende de core.js (global Core).
(() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const brl = v => (v == null || !isFinite(v) ? "–" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
  const km = m => (m / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " km";
  const kmN = v => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " km";
  const hhmm = d => new Date(d).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const dur = min => { min = Math.max(0, Math.round(min)); const h = Math.floor(min / 60), m = min % 60; return h ? `${h}h${String(m).padStart(2, "0")}` : `${m} min`; };
  const tail = tn => tn.slice(-5);
  const zc = z => `--zc: var(--z${z + 1})`;

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

  // ---------- armazenamento ----------
  const store = {
    get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  const DEF_FIN = { fuel: "gasolina", price: 6.29, kml: 11, extras: 0, payMode: "rota", payValue: 0 };
  const DEF_ASSUME = { speed: 18, stopMin: 2, extraPkgMin: 0.5, searchMessy: 1.2, searchOrg: 0.3 };
  const S = {
    route: store.get("rc:route", null),
    prog: null,
    fin: { ...DEF_FIN, ...store.get("rc:fin", {}) },
    assume: { ...DEF_ASSUME, ...store.get("rc:assume", {}) },
    hist: store.get("rc:hist", []),
    stops: [], byKey: new Map(), byTn: new Map(), display: [],
    failOpen: null, gpsWatch: null, lastPos: null, wake: null, recalcArmed: false,
  };
  const newProg = () => ({ status: {}, reason: {}, loaded: {}, loadedZone: {}, loadLog: [], picked: {}, later: [], missing: {}, doneAt: {}, order: null, startedAt: null, finishedAt: null, odoStart: null, odoEnd: null, gpsKm: 0, cdKm: 0 });
  const progKey = () => "rc:prog:" + S.route.id;
  const saveProg = () => store.set(progKey(), S.prog);
  const saveRoute = () => store.set("rc:route", S.route);

  // Rotas do dia: cada pacote guarda o AT ID da planilha de onde veio.
  function normalizeRoute() {
    const r = S.route;
    if (!r.routes) r.routes = [{ id: r.id, at: r.id, file: r.file }];
    r.pkgs.forEach(p => { if (!p.route) p.route = r.routes[0].id; });
    r.settings.multiMode = r.settings.multiMode || "seq";
  }
  const multi = () => S.route.routes.length > 1;
  const ri = p => Math.max(0, S.route.routes.findIndex(r => r.id === p.route));
  const routeDesc = i => { const r = S.route.routes[i]; return i > 0 && r.addedAt ? `pedidos das ${hhmm(r.addedAt)}` : (r.at || r.id); };
  const rTag = (i, big) => `<span class="rtag r${(i % 3) + 1}${big ? " big" : ""}">Rota ${i + 1}</span>`;
  const rTags = s => (multi() ? s.ris.map(i => rTag(i)).join("") : "");
  // Números de parada da Shopee de um local; com várias rotas, cada número leva a rota junto (R1·48).
  const refs = s => {
    const seen = new Set(), out = [];
    s.pkgs.forEach(p => { if (p.shopeeStop == null) return; const k = (multi() ? `R${ri(p) + 1}·` : "") + p.shopeeStop; if (!seen.has(k)) { seen.add(k); out.push(k); } });
    return out.sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
  };
  const pkgRef = p => (multi() ? `R${ri(p) + 1} · ` : "") + (p.shopeeStop != null ? "Shopee " + p.shopeeStop : "sem nº");

  const toast = msg => { const t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => (t.hidden = true), 2400); };
  const buzz = ms => { try { navigator.vibrate?.(ms); } catch {} };

  // ---------- planilha ----------
  $("file").addEventListener("change", async e => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const { pkgs, bad } = Core.parseRows(await readXlsxFile(f));
      if (!pkgs.length) throw new Error("A planilha não tem pacotes com coordenadas.");
      const at = (pkgs[0].at || f.name) + "";
      // Com o dia aberto, a planilha nova sempre soma; na tela inicial, ela começa um dia novo.
      if (S.route && !$("app").hidden) await importMore(at, f.name, pkgs, bad);
      else await newDay(at, f.name, pkgs, bad);
    } catch (err) {
      toast(err.message || "Não consegui ler a planilha.");
    } finally { e.target.value = ""; }
  });

  async function newDay(at, file, pkgs, bad) {
    if (S.route) store.set(progKey(), null);
    pkgs.forEach(p => (p.route = at));
    S.route = { id: at, file, pkgs, bad, createdAt: Date.now(), routes: [{ id: at, at, file, addedAt: Date.now() }], settings: { radius: 20, start: "shopee", vehicle: S.route?.settings.vehicle || "carro", blockSize: 10, maxPkgs: 25, multiMode: "seq" }, plan: null };
    S.prog = newProg();
    saveRoute(); saveProg();
    $("resume").hidden = true; $("addRoute").hidden = true;
    await boot(true);
    location.hash = "#carregar";
    toast(`${pkgs.length} pacotes carregados da planilha`);
  }

  // A planilha da Shopee vem acumulada: o que ainda não foi entregue + os pedidos novos.
  // Pacote já conhecido continua na rota de antes; pacote novo vira a próxima rota;
  // pacote que sumiu da planilha já foi baixado no app da Shopee.
  async function importMore(at, file, pkgs, bad) {
    const known = new Map(S.route.pkgs.map(p => [p.tn, p]));
    const incoming = new Set(pkgs.map(p => p.tn));
    const fresh = pkgs.filter(p => !known.has(p.tn));
    const overlap = pkgs.length - fresh.length;
    pkgs.forEach(p => { const k = known.get(p.tn); if (k) Object.assign(k, p, { route: k.route }); });
    const gone = overlap ? S.route.pkgs.filter(p => !incoming.has(p.tn) && !S.prog.status[p.tn]) : [];
    S.prog.gone = S.prog.gone || {};
    gone.forEach(p => { setOk(p.tn); S.prog.reason[p.tn] = "Saiu da planilha da Shopee"; S.prog.gone[p.tn] = 1; });
    let n = null;
    if (fresh.length) {
      n = S.route.routes.length + 1;
      const rid = `${at}#${n}`;
      S.route.routes.push({ id: rid, at, file, addedAt: Date.now() });
      fresh.forEach(p => (p.route = rid));
      S.route.pkgs = S.route.pkgs.concat(fresh);
    }
    const badKnown = new Set((S.route.bad || []).map(p => p.tn));
    S.route.bad = (S.route.bad || []).concat(bad.filter(p => !badKnown.has(p.tn)));
    S.lastImport = { at, file, pkgs, bad, gone: gone.map(p => p.tn) };
    saveRoute(); saveProg();
    if (!fresh.length && !gone.length) { toast("Nenhum pedido novo nesta planilha"); return; }
    fillSettings(); derive();
    await plan({ keep: true });
    route();
    $("addRoute").hidden = false;
    $("addRoute").innerHTML = `<h2>Planilha somada ao dia</h2>
      ${overlap ? `<p>${overlap} pacote(s) que você já tinha continuam na rota de antes.</p>` : ""}
      ${fresh.length ? `<p>${rTag(n - 1, true)} <b>${fresh.length} pedido(s) novo(s)</b> viraram a Rota ${n}${S.zoneSplit && multi() ? `, nas zonas ${S.zoneSplit[n - 1].map(i => Core.VEHICLES[S.route.settings.vehicle].zones[i].code).join(", ")}` : ""}.</p>` : ""}
      ${gone.length ? `<p><b>${gone.length} pacote(s) não estão mais na planilha</b> e foram marcados como entregues (já baixados no app da Shopee): <span class="mono">${gone.map(p => esc(tail(p.tn))).join(", ")}</span>.</p>` : ""}
      <div class="actions">
        <button type="button" class="primary" data-import="ok">Entendi</button>
        ${gone.length ? `<button type="button" class="ghost" data-import="ungone">Não entreguei esses</button>` : ""}
        <button type="button" class="ghost" data-import="newday">Usar só esta planilha (dia novo)</button>
      </div>`;
    location.hash = fresh.length ? "#carregar" : "#rota";
    $("addRoute").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function importChoice(choice) {
    const li = S.lastImport;
    $("addRoute").hidden = true;
    if (!li) return;
    if (choice === "newday") { S.lastImport = null; return newDay(li.at, li.file, li.pkgs, li.bad); }
    if (choice === "ungone") {
      li.gone.forEach(tn => { delete S.prog.status[tn]; delete S.prog.reason[tn]; delete S.prog.gone[tn]; });
      saveProg(); renderAll(); toast("Pacotes voltaram para a rota");
    }
    S.lastImport = null;
  }

  // Tela inicial: o dia salvo só volta se você pedir.
  function showResume() {
    const r = S.route, pend = r.pkgs.filter(p => !S.prog.status[p.tn]).length;
    const when = r.createdAt ? new Date(r.createdAt) : null;
    const today = when && when.toDateString() === new Date().toDateString();
    $("resume").hidden = false;
    $("resume").innerHTML = `<h2>${today ? "Dia em andamento" : "Rota salva" + (when ? " de " + when.toLocaleDateString("pt-BR") : "")}</h2>
      <p>${r.routes.length > 1 ? r.routes.length + " rotas" : "1 rota"} · ${r.pkgs.length} pacotes · <b>${pend} pendentes</b></p>
      <div class="actions">
        <button type="button" class="primary" data-resume="go">Continuar ${today ? "o dia" : "esta rota"}</button>
        <button type="button" class="ghost" data-resume="clear">Começar do zero</button>
      </div>
      <p class="sub">"Começar do zero" apaga esta rota do aparelho; o histórico de ganhos continua. Abrir uma planilha aqui também começa um dia novo.</p>`;
  }

  function clearDay() {
    store.set(progKey(), null); store.set("rc:route", null);
    S.route = null; S.prog = null; S.display = []; S.lastImport = null;
    $("app").hidden = true; $("resume").hidden = true; $("addRoute").hidden = true; $("empty").hidden = false;
    $("subtitle").textContent = "Rota, carregamento e ganhos do dia";
    document.querySelector('header label[for="file"]').textContent = "Abrir planilha";
    history.replaceState(null, "", location.pathname + location.search);
    toast("Pronto. Abra a planilha para começar.");
  }

  async function removeRoute(i) {
    const id = S.route.routes[i].id;
    S.route.routes.splice(i, 1);
    S.route.pkgs = S.route.pkgs.filter(p => p.route !== id);
    S.route.bad = (S.route.bad || []).filter(p => p.route !== id);
    saveRoute(); fillSettings(); derive();
    await plan({ keep: true });
    toast("Rota removida do dia");
  }

  async function boot(forcePlan) {
    normalizeRoute();
    $("empty").hidden = true; $("app").hidden = false;

    fillSettings();
    derive();
    if (forcePlan || !planMatches()) await plan();
    else { derive(); renderAll(); }
    route();
  }

  // ---------- plano ----------
  function planMatches() {
    const p = S.route.plan;
    return p && p.orderKeys.length === S.stops.length && p.orderKeys.every(k => S.byKey.has(k));
  }

  async function roadTable(points) {
    if (points.length > 100) return null;
    const coords = points.map(p => p.lng.toFixed(6) + "," + p.lat.toFixed(6)).join(";");
    const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 9000);
    try {
      const r = await fetch("https://router.project-osrm.org/table/v1/driving/" + coords + "?annotations=distance", { signal: ctl.signal });
      const j = await r.json();
      if (j.code !== "Ok" || !j.distances || j.distances.some(row => row.some(v => v == null))) return null;
      return j.distances;
    } catch { return null; } finally { clearTimeout(tm); }
  }

  // Paradas do dia. "seq": cada rota agrupada e percorrida separada, uma depois da outra. "join": tudo junto.
  const joined = () => !multi() || S.route.settings.multiMode === "join";
  function buildStops() {
    const { radius } = S.route.settings;
    const stops = joined()
      ? Core.groupStops(S.route.pkgs, radius)
      : S.route.routes.flatMap(r => Core.groupStops(S.route.pkgs.filter(p => p.route === r.id), radius));
    stops.forEach(s => { s.ris = [...new Set(s.pkgs.map(ri))].sort((a, b) => a - b); s.ri = s.ris[0]; });
    return stops;
  }

  async function plan(opts = {}) {
    const st = S.route.settings;
    const stops = buildStops();
    const points = stops.slice();
    let gpsIdx = -1;
    if (st.start === "gps" && S.gpsStart) { points.push({ ...S.gpsStart, street: "" }); gpsIdx = points.length - 1; }
    $("foot").textContent = "Calculando distâncias pelas ruas…";
    const road = await roadTable(points);
    const groups = joined() ? [stops.map((_, i) => i)] : S.route.routes.map((_, r) => stops.map((s, i) => (s.ri === r ? i : -1)).filter(i => i >= 0));
    const old = opts.keep && S.route.plan ? S.route.plan.orderKeys : null;
    const stopOrder = [], shopee = [];
    groups.forEach((I, g) => {
      if (!I.length) return;
      shopee.push(...I.slice().sort((a, b) => stops[a].minSeq - stops[b].minSeq));
      const keys = new Set(I.map(i => stops[i].key));
      // Rota que já estava no plano mantém a ordem (e as zonas) de antes.
      if (old && [...keys].every(k => old.includes(k))) {
        stopOrder.push(...old.filter(k => keys.has(k)).map(k => stops.findIndex(s => s.key === k)));
        return;
      }
      const sub = I.slice();
      let start = -1;
      if (g === 0 && gpsIdx >= 0) { sub.push(gpsIdx); start = sub.length - 1; }
      else if (g === 0 && st.start.startsWith("s")) start = sub.findIndex(i => stops[i].key === st.start.slice(1));
      else if (stopOrder.length) {
        const last = points[stopOrder[stopOrder.length - 1]];
        start = sub.reduce((b, i, k) => (Core.hav(last, points[i]) < Core.hav(last, points[sub[b]]) ? k : b), 0);
      }
      if (start < 0) start = sub.reduce((b, i, k) => (stops[i].minSeq < stops[sub[b]].minSeq ? k : b), 0);
      const subRoad = road ? sub.map(i => sub.map(j => road[i][j])) : null;
      const C = Core.buildCost(sub.map(i => points[i]), subRoad, road ? 40 : 60);
      stopOrder.push(...Core.solve(C, start).map(k => sub[k]).filter(i => i < stops.length));
    });
    if (gpsIdx >= 0 && stopOrder.length) shopee.unshift(gpsIdx);
    S.route.plan = {
      orderKeys: stopOrder.map(i => stops[i].key),
      matrix: road ? stopOrder.map(i => stopOrder.map(j => Math.round(road[i][j]))) : null,
      road: !!road,
      km: Core.distOf(points, stopOrder, road),
      shopeeKm: Core.distOf(points, shopee, road),
    };
    saveRoute();
    derive();
    renderAll();
  }

  function derive() {
    const st = S.route.settings;
    S.stops = buildStops();
    S.byKey = new Map(S.stops.map(s => [s.key, s]));
    S.byTn = new Map();
    S.stops.forEach(s => s.pkgs.forEach(p => S.byTn.set(p.tn, s)));
    if (!planMatches()) { S.display = []; return; }
    const planStops = S.route.plan.orderKeys.map(k => S.byKey.get(k));
    // Bloco fecha ao atingir N paradas ou o limite de pacotes, para nenhuma zona lotar.
    // Com rotas separadas, um bloco nunca mistura rotas e cada rota usa as suas próprias zonas do carro.
    const sep = !joined();
    const nZones = (Core.VEHICLES[st.vehicle] || Core.VEHICLES.carro).zones.length;
    S.zoneSplit = sep ? Core.splitZones(nZones, S.route.routes.map(r => S.route.pkgs.filter(p => p.route === r.id).length)) : null;
    let b = 0, cnt = 0, pk = 0, prevRi = null;
    const firstBlock = {};
    planStops.forEach((s, i) => {
      const newRoute = sep && prevRi !== null && s.ri !== prevRi;
      if (i > 0 && (newRoute || cnt >= st.blockSize || (cnt > 0 && pk + s.pkgs.length > (st.maxPkgs || 25)))) { b++; cnt = 0; pk = 0; }
      if (sep && firstBlock[s.ri] == null) firstBlock[s.ri] = b;
      s.pi = i; s.block = b; cnt++; pk += s.pkgs.length; prevRi = s.ri;
      Object.assign(s, sep ? Core.zoneFor(b - firstBlock[s.ri], st.vehicle, S.zoneSplit[s.ri]) : Core.zoneFor(b, st.vehicle));
    });
    S.planStops = planStops;
    const later = S.prog.later.filter(k => S.byKey.has(k));
    // Ordem refeita na rua ("reorganizar daqui" ou "achei, ir agora"); blocos e zonas continuam os do plano.
    const own = S.prog.order && S.prog.order.length === planStops.length && S.prog.order.every(k => S.byKey.has(k)) ? S.prog.order.map(k => S.byKey.get(k)) : planStops;
    S.display = own.filter(s => !later.includes(s.key)).concat(later.map(k => S.byKey.get(k)));
    S.display.forEach((s, i) => (s.n = i + 1));
  }

  const dist = (a, b) => S.route.plan.matrix ? S.route.plan.matrix[a.pi][b.pi] : Core.hav(a, b) * Core.STREET_FACTOR;
  const pkgDone = p => !!S.prog.status[p.tn];
  const stopDone = s => s.pkgs.every(pkgDone);
  // Pacote "não achei" fica pendente, mas fora da fila até você encontrar.
  const pkgMissing = p => !pkgDone(p) && !!S.prog.missing?.[p.tn];
  const pkgOpen = p => !pkgDone(p) && !S.prog.missing?.[p.tn];
  const stopActive = s => s.pkgs.some(pkgOpen);
  const stopMissing = s => s.pkgs.some(pkgMissing);
  function setOk(tn) { S.prog.status[tn] = "ok"; delete S.prog.reason[tn]; if (S.prog.missing) delete S.prog.missing[tn]; S.prog.doneAt = S.prog.doneAt || {}; S.prog.doneAt[tn] = Date.now(); }
  function clearStatus(tn) { delete S.prog.status[tn]; delete S.prog.reason[tn]; if (S.prog.doneAt) delete S.prog.doneAt[tn]; }
  const stopDoneAt = s => Math.max(0, ...s.pkgs.map(p => S.prog.doneAt?.[p.tn] || 0));
  const stopFailed = s => s.pkgs.some(p => S.prog.status[p.tn] === "fail");
  const anyLoaded = () => Object.keys(S.prog.loaded).length > 0;

  function etas() {
    const a = S.assume, search = anyLoaded() ? a.searchOrg : a.searchMessy;
    let t = Date.now(), prev = null;
    const firstOpen = S.display.findIndex(stopActive);
    if (firstOpen > 0) prev = S.display[firstOpen - 1];
    S.display.forEach(s => {
      if (!stopActive(s)) { s.eta = null; return; }
      if (prev) t += dist(prev, s) / 1000 / a.speed * 3600e3;
      s.eta = t;
      s.late = s.until && hhmm(t) > s.until;
      t += (a.stopMin + a.extraPkgMin * (s.pkgs.length - 1) + search) * 60e3;
      prev = s;
    });
    return t;
  }

  // ---------- abas ----------
  const TABS = ["carregar", "rota", "ganhos"];
  function route() {
    if (!S.route) return;
    let tab = location.hash.slice(1);
    if (!TABS.includes(tab)) tab = anyLoaded() || Object.keys(S.prog.status).length ? "rota" : "carregar";
    TABS.forEach(t => {
      $("view-" + t).hidden = t !== tab;
      document.querySelector(`[data-tab="${t}"]`).toggleAttribute("aria-current", t === tab);
      if (t === tab) document.querySelector(`[data-tab="${t}"]`).setAttribute("aria-current", "page");
    });
    if (tab === "rota") drawMap();
  }
  window.addEventListener("hashchange", route);

  function renderAll() {
    if (!S.display.length) return;
    const endT = etas();
    renderRoute(endT);
    renderLoad();
    renderMoney();
    const total = S.route.pkgs.length;
    $("tabLoad").textContent = `${Object.keys(S.prog.loaded).length}/${total}`;
    $("tabRoute").textContent = `${S.display.filter(stopDone).length}/${S.display.length}`;
    $("tabMoney").textContent = brl(money().profit).replace(/\s/g, " ");
    if (!$("view-rota").hidden) drawMap();
  }

  // ---------- ROTA ----------
  // Paradas pendentes que ficam a pé daqui (até 120 m) ou na mesma rua (até 400 m) e que a ordem só visitaria
  // mais tarde: avisar para entregar junto e não voltar. Não mexe em blocos nem zonas.
  function aroundHere(n) {
    const act = S.display.filter(stopActive);
    const after = act.indexOf(n);
    const soon = new Set(after >= 0 ? act.slice(after + 1, after + 2) : []);
    return act.filter(s => s !== n && !soon.has(s))
      .map(s => ({ s, d: Core.hav(n, s) }))
      .filter(x => x.d <= 120 || (x.s.street && x.s.street === n.street && x.d <= 400))
      .sort((a, b) => a.d - b.d).slice(0, 5);
  }

  // Pacotes que você não achou: ficam aqui até aparecerem.
  function renderPend() {
    const list = S.display.filter(stopMissing);
    $("pendBox").hidden = !list.length;
    $("pendBox").innerHTML = list.length ? `<h2>Não achei: ${list.reduce((a, s) => a + s.pkgs.filter(pkgMissing).length, 0)} pacote(s)</h2>
      <p class="sub">Quando achar, escaneie a etiqueta ou toque em "Achei, ir agora": a parada vira a próxima.</p>
      ${list.map(s => `<div class="pend">${multi() ? rTags(s) : ""}<b>Parada ${s.n}</b> · ${esc(s.label)}<div class="sub mono">${s.pkgs.filter(pkgMissing).map(p => `${esc(tail(p.tn))} (${pkgRef(p)})`).join(" · ")}</div>
        <div class="actions"><button type="button" class="primary" data-found="${esc(s.key)}">Achei, ir agora</button><button type="button" data-ok="${esc(s.key)}">Já entreguei</button><a class="btn" href="${Core.links.waze(s)}" target="_blank" rel="noopener">Waze</a></div></div>`).join("")}` : "";
  }

  // Refaz a ordem das paradas que faltam a partir de onde você está; blocos e zonas do carro não mudam.
  function reorderFrom(from) {
    const rest = S.display.filter(s => stopActive(s) && s !== from);
    if (!rest.length) { S.outOfOrder = null; renderAll(); return; }
    const pts = [from, ...rest];
    const C = pts.map(a => pts.map(b => (a === b ? 0 : dist(a, b) + (a.street && b.street && a.street !== b.street ? 40 : 0))));
    const order = Core.solve(C, 0).slice(1).map(i => pts[i]);
    const fixed = S.display.filter(s => !stopActive(s) || s === from);
    S.prog.order = fixed.concat(order).map(s => s.key);
    S.prog.later = [];
    S.outOfOrder = null;
    saveProg(); derive(); renderAll();
    toast("Rota reorganizada a partir daqui");
  }

  function renderRoutes() {
    const R = S.route.routes, veh = Core.VEHICLES[S.route.settings.vehicle];
    document.querySelector('header label[for="file"]').textContent = "Somar planilha";
    $("subtitle").textContent = R.length > 1 ? `${R.length} rotas · ${S.route.pkgs.length} pacotes` : S.route.file.replace(/\.xlsx$/i, "");
    const html = `<div class="top"><h2>${R.length > 1 ? R.length + " rotas hoje" : "Rota do dia"}</h2><label class="btn ghost" for="file">+ Somar planilha</label></div>` +
      R.map((r, i) => {
        const pk = S.route.pkgs.filter(p => p.route === r.id);
        const done = pk.filter(p => S.prog.status[p.tn]).length, loaded = pk.filter(p => S.prog.loaded[p.tn]).length;
        const zs = S.zoneSplit && R.length > 1 ? S.zoneSplit[i].map(z => veh.zones[z].code).join(", ") : null;
        return `<div class="rrow">${rTag(i, true)}<div><b>${esc(routeDesc(i))}</b><div class="sub">${pk.length} pct · ${loaded} no carro · ${done} feitos${zs ? ` · zona${S.zoneSplit[i].length > 1 ? "s" : ""} ${zs}` : ""}</div></div>${R.length > 1 ? `<button type="button" class="ghost" data-rmroute="${i}">Remover</button>` : ""}</div>`;
      }).join("") + `<p class="sub">Pegou mais pedidos? Exporte a planilha de novo no app da Shopee e toque em <b>+ Somar planilha</b>. O que você já tinha continua igual e os pedidos novos viram a próxima rota.</p>
      <div class="actions"><button type="button" class="danger" data-clearday="1">Começar dia novo</button></div>`;
    document.querySelectorAll(".routesBox").forEach(el => (el.innerHTML = html));
  }

  function zoneTag(s) {
    return `<span class="zone-tag" style="background: var(--z${s.zoneIdx + 1})"><b>${s.zone.code}</b>${esc(s.zone.name)}</span>`;
  }

  function renderRoute(endT) {
    const d = S.display, plan = S.route.plan;
    const pk = S.route.pkgs;
    const shopeeStops = new Set(pk.map(p => p.shopeeStop).filter(v => v != null)).size;
    const unseq = pk.filter(p => p.seq == null);
    const doneStops = d.filter(stopDone).length;
    const save = plan.shopeeKm - plan.km;
    $("stats").innerHTML = [
      [d.length, `paradas reais (Shopee: ${shopeeStops}${unseq.length ? " + " + unseq.length + " sem nº" : ""})`],
      [km(plan.km), plan.road ? "percurso pelas ruas" : "percurso estimado"],
      [save > 50 ? "−" + km(save) : "≈", "contra a ordem da Shopee", save > 50 ? "good" : ""],
      [doneStops < d.length ? hhmm(endT) : "Fim", doneStops < d.length ? "previsão de término" : "rota concluída"],
    ].map(([b, s, c]) => `<div class="stat ${c || ""}"><b>${b}</b><span>${s}</span></div>`).join("");

    const warn = [];
    if (unseq.length) {
      const where = [...new Set(unseq.map(p => S.byTn.get(p.tn).n))].sort((a, b) => a - b);
      warn.push(`<b>${unseq.length} pacote(s) sem número da Shopee</b> (reentregas e novas tentativas) foram colocados nas paradas ${where.join(", ")}. Eles aparecem com a etiqueta "sem nº".`);
    }
    const late = d.filter(s => s.late);
    if (late.length) warn.push(`<b>Horário em risco:</b> ${late.map(s => `parada ${s.n} (até ${s.until}, chegada prevista ${hhmm(s.eta)})`).join("; ")}. Use "Depois" em outras paradas ou comece por ela.`);
    if (S.route.bad?.length) warn.push(`${S.route.bad.length} pacote(s) sem coordenadas ficaram fora da rota: ${S.route.bad.map(p => esc(p.tn)).join(", ")}.`);
    $("warn").hidden = !warn.length; $("warn").innerHTML = warn.map(w => `<p>${w}</p>`).join("");
    renderRoutes();
    const multiLocs = d.filter(s => refs(s).length > 1 || (s.unseq && s.pkgs.length > 1)).sort((a, b) => a.ri - b.ri || (a.shopeeStops[0] ?? 1e9) - (b.shopeeStops[0] ?? 1e9));
    $("multiBox").hidden = !multiLocs.length;
    $("multiSum").textContent = `${multiLocs.length} locais com mais de uma parada da Shopee`;
    $("multiList").innerHTML = multiLocs.map(s => `<button type="button" class="${stopDone(s) ? "done" : ""}" data-showstop="${esc(s.key)}">
      <span class="stopnums">${refs(s).map(x => `<span>${x}</span>`).join("")}${s.unseq ? `<span>sem nº</span>` : ""}</span>
      <span style="flex:1;min-width:0">${esc(s.label)}<br><span class="sub">${s.pkgs.length} pacotes · nossa parada ${s.n}${stopDone(s) ? " · entregue" : ""}</span></span></button>`).join("");

    const nextIdx = d.findIndex(stopActive);
    const n = d[nextIdx];
    renderPend();
    S.lastNextBlock = n ? n.block : null;
    renderPick(n);

    if (n) {
      const reasons = S.failOpen === n.key ? `
        <div class="eyebrow">Por que não entregou?</div>
        <div class="reasons">${["Ausente", "Endereço não encontrado", "Recusado", "Outro motivo"].map(r => `<button type="button" data-fail="${esc(n.key)}" data-reason="${r}">${r}</button>`).join("")}</div>
        <button type="button" data-failcancel="1">Cancelar</button>` : "";
      $("next").innerHTML = `
        ${multi() ? `<div>${n.ris.map(i => rTag(i, true)).join(" ")}</div>` : ""}
        <div class="eyebrow">Próxima parada · ${n.n} de ${d.length} · chegada ~${hhmm(n.eta)}</div>
        <div class="addr">${esc(n.label)}</div>
        <div class="meta"><span>${n.pkgs.length} pacote${n.pkgs.length > 1 ? "s" : ""}</span>${zoneTag(n)}${refs(n).length ? `<span>Shopee ${refs(n).join(", ")}</span>` : ""}${n.unseq ? "<span>sem nº</span>" : ""}${n.until ? `<span>até ${n.until}</span>` : ""}</div>
        ${n.pkgs.length > 1 ? `<div class="alert">Leve ${n.pkgs.length} pacotes para este local${refs(n).length > 1 ? `: paradas Shopee ${refs(n).join(" + ")}` : ""}${n.unseq ? ` + ${n.unseq} sem nº` : ""}</div>` : ""}
        <div class="meta mono">${n.pkgs.map(p => esc(tail(p.tn)) + ` (${pkgRef(p).replace("Shopee ", "")})`).join(" · ")}</div>
        <div class="row">
          <a class="btn primary" href="${Core.links.waze(n)}" target="_blank" rel="noopener">Waze</a>
          <a class="btn" href="${Core.links.gmaps(n)}" target="_blank" rel="noopener">Google</a>
          <a class="btn" href="${Core.links.apple(n)}" target="_blank" rel="noopener">Apple</a>
        </div>
        <div class="row">
          <button type="button" class="okb" data-ok="${esc(n.key)}">Entregue</button>
          <button type="button" data-failopen="${esc(n.key)}">Não entregue</button>
          <button type="button" data-later="${esc(n.key)}">Depois</button>
        </div>
        ${(() => { const near = aroundHere(n); return near.length ? `<div class="aqui"><b>Aproveite aqui, para não voltar depois:</b>${near.map(({ s, d }) => `<div class="aqui-row"><span><b>Parada ${s.n}</b> · zona ${s.zone.code}${multi() ? " · R" + (s.ri + 1) : ""} · ${esc(s.label)} · ${Math.round(d)} m${s.street === n.street ? " · mesma rua" : ""}<br><span class="mono">${s.pkgs.filter(pkgOpen).map(p => `${esc(tail(p.tn))} (${pkgRef(p).replace("Shopee ", "")})`).join(" · ")}</span></span><button type="button" data-ok="${esc(s.key)}" data-together="1">Entreguei junto</button></div>`).join("")}</div>` : ""; })()}
        <div class="row two">
          <button type="button" data-missing="${esc(n.key)}">Não achei o pacote</button>
          <button type="button" data-other="1">Entreguei outro</button>
        </div>
        ${S.outOfOrder && S.byKey.get(S.outOfOrder) ? `<div class="ooo"><span>Você entregou fora da ordem (${esc(S.byKey.get(S.outOfOrder).label)}).</span><button type="button" class="primary" data-reorder="${esc(S.outOfOrder)}">Reorganizar o resto a partir de lá</button><button type="button" data-reorder-no="1">Seguir a ordem</button></div>` : ""}${reasons}`;
    } else if (d.some(stopMissing)) {
      $("next").innerHTML = `<div class="addr">Só faltam os pacotes que você não achou</div><div class="meta">Veja a lista "Não achei" acima. Quando encontrar, toque em "Achei, ir agora".</div>`;
    } else {
      const fails = pk.filter(p => S.prog.status[p.tn] === "fail").length;
      $("next").innerHTML = `<div class="addr">Rota concluída</div><div class="meta">${d.length} paradas · ${pk.length - fails} entregues${fails ? ` · ${fails} para devolver ao CD` : ""}. Veja o resultado em Ganhos.</div>`;
    }

    const open = d.filter(s => !stopDone(s));
    const size = Math.min(10, S.route.settings.blockSize);
    let legs = "";
    for (let i = 0; i < open.length; i += size) {
      const part = open.slice(i, i + size);
      legs += `<a class="btn" href="${Core.links.gmapsLeg(part)}" target="_blank" rel="noopener">Paradas ${part[0].n}–${part[part.length - 1].n}</a>`;
    }
    $("legs").innerHTML = legs || `<span class="sub">Nenhuma parada pendente.</span>`;

    let html = "", prevBlock = -1;
    d.forEach((s, i) => {
      if (s.block !== prevBlock) {
        const members = d.filter(x => x.block === s.block);
        if (multi() && !joined() && (prevBlock < 0 || d[i - 1].ri !== s.ri)) html += `<div class="route-head">${rTag(s.ri, true)}<span class="sub">${esc(routeDesc(s.ri))} · ${d.filter(x => x.ri === s.ri).length} paradas</span></div>`;
        html += `<div class="block-head"><h3>Bloco ${s.block + 1}</h3>${rTags(s)}${zoneTag(s)}<span class="sub">${members.reduce((a, x) => a + x.pkgs.length, 0)} pct${s.layer ? " · por baixo" : ""}</span></div>`;
        prevBlock = s.block;
      }
      const done = stopDone(s), failed = stopFailed(s);
      const manyRefs = refs(s).length > 1;
      const rows = s.pkgs.map(p => {
        const st = S.prog.status[p.tn];
        const extra = p.address.split(",").slice(2).join(",").trim();
        return `<li><span class="t">${esc(p.tn)} · ${pkgRef(p)}${extra ? `<br><span class="sub">${esc(extra)}</span>` : ""}${st === "fail" ? `<br><span class="sub">Não entregue: ${esc(S.prog.reason[p.tn] || "")}</span>` : ""}</span>
          <span class="st"><button type="button" class="${st === "ok" ? "on-ok" : ""}" data-pok="${esc(p.tn)}" aria-label="Entregue">✓</button><button type="button" class="${st === "fail" ? "on-bad" : ""}" data-pfail="${esc(p.tn)}" aria-label="Não entregue">✗</button><button type="button" class="${pkgMissing(p) ? "on-warn" : ""}" data-pmiss="${esc(p.tn)}" aria-label="Não achei">?</button><button type="button" data-copy="${esc(p.tn)}">Copiar</button></span></li>`;
      }).join("");
      html += `<article class="stop${done ? " done" : ""}${failed ? " failed" : ""}${stopMissing(s) ? " missing" : ""}${i === nextIdx ? " current" : ""}" style="${zc(s.zoneIdx)}">
        <div class="plate">${s.n}</div>
        <div class="body">
          <div class="street">${esc(s.label)}${s.numbers.length > 1 ? ` <span class="sub">(nº ${esc(s.numbers.join(", "))})</span>` : ""}</div>
          <div class="sub">${esc(s.bairro)}${i > 0 && d[i - 1].street === s.street ? " · mesma rua da anterior" : ""}${s.eta ? " · ~" + hhmm(s.eta) : ""}</div>
          <div class="chips">
            ${rTags(s)}<span class="chip count">${s.pkgs.length} pct</span>
            ${refs(s).map(x => `<span class="chip${manyRefs ? " hot" : ""}">Shopee ${x}</span>`).join("")}
            ${s.unseq ? `<span class="chip hot">${s.unseq} sem nº</span>` : ""}
            ${s.until ? `<span class="chip time">até ${s.until}</span>` : ""}
            ${s.after ? `<span class="chip time">após ${s.after}</span>` : ""}
            ${stopActive(s) && i !== nextIdx ? (() => { const nb = aroundHere(s).filter(x => x.d <= 120 && Math.abs(x.s.n - s.n) > 2).map(x => x.s.n); return nb.length ? `<span class="chip hot">perto: ${nb.join(", ")}</span>` : ""; })() : ""}
            ${stopMissing(s) ? `<span class="chip time">não achei ${s.pkgs.filter(pkgMissing).length}</span>` : ""}
            ${stopDoneAt(s) && done ? `<span class="chip">entregue ${hhmm(stopDoneAt(s))}</span>` : ""}
          </div>
          <details class="pk"><summary>Pacotes: ${s.pkgs.map(p => esc(tail(p.tn))).join(" · ")}</summary><ul>${rows}</ul></details>
          <div class="actions">
            <a class="btn" href="${Core.links.waze(s)}" target="_blank" rel="noopener">Waze</a>
            <a class="btn" href="${Core.links.gmaps(s)}" target="_blank" rel="noopener">Google</a>
            <button type="button" data-ok="${esc(s.key)}">${done && !failed ? "Entregue ✓" : "Entregue"}</button>
          </div>
        </div>
      </article>`;
    });
    $("list").innerHTML = html;
    $("foot").textContent = plan.road
      ? "Distâncias medidas pelas ruas (OpenStreetMap / OSRM), respeitando mão única."
      : "Distâncias estimadas em linha reta com fator de ruas, porque o serviço de rotas não respondeu neste navegador.";
  }

  function renderPick(next) {
    const box = $("pickCard");
    if (!next) { box.innerHTML = ""; return; }
    const blockStops = S.display.filter(s => s.block === next.block && !stopDone(s));
    const items = blockStops.flatMap(s => s.pkgs.filter(p => !pkgDone(p)).map(p => ({ p, s })));
    const left = items.filter(x => !S.prog.picked[x.p.tn]);
    if (!left.length) { box.innerHTML = ""; return; }
    const z = next;
    box.innerHTML = `<section class="pick" style="${zc(z.zoneIdx)}">
      <div class="pick-head"><div class="pick-letter">${z.zone.code}</div>
        <div>${multi() ? z.ris.map(i => rTag(i)).join("") : ""}<h3>Separe o bloco ${z.block + 1}: ${items.length} pacotes</h3>
        <p class="sub">${esc(z.zone.name)}${z.layer ? " (por baixo)" : ""} · paradas ${blockStops[0].n}–${blockStops[blockStops.length - 1].n}. Deixe à mão para as próximas ${blockStops.length} paradas.</p></div></div>
      <ul>${items.map(({ p, s }) => `<li><button type="button" class="${S.prog.picked[p.tn] ? "picked" : ""}" data-pick="${esc(p.tn)}"><span class="tn-end">${esc(tail(p.tn))}</span><span class="sub">${multi() ? `R${ri(p) + 1} · ` : ""}parada ${s.n} · ${esc(s.label.split(",")[0])}</span></button></li>`).join("")}</ul>
      <button type="button" class="primary" data-pickall="${z.block}">Separei todos</button>
    </section>`;
  }

  document.addEventListener("click", e => {
    const t = e.target.closest("button, a");
    if (!t || !S.route) return;
    const ds = t.dataset;
    const stop = k => S.byKey.get(k);
    if (ds.import) { importChoice(ds.import); return; }
    if (ds.resume === "go") { $("resume").hidden = true; boot(false); return; }
    if (ds.resume === "clear" || ds.clearday != null) {
      if (t.dataset.armed) return void clearDay();
      const label = t.textContent;
      t.dataset.armed = "1"; t.textContent = "Toque de novo para apagar";
      setTimeout(() => { delete t.dataset.armed; t.textContent = label; }, 4000);
      return;
    }
    if (ds.moved) { S.prog.loadedZone[ds.moved] = S.byTn.get(ds.moved).zone.code; saveProg(); renderAll(); return; }
    if (ds.rmroute != null) {
      if (t.dataset.armed) return void removeRoute(+ds.rmroute);
      t.dataset.armed = "1"; t.textContent = "Toque de novo para remover";
      setTimeout(() => { delete t.dataset.armed; t.textContent = "Remover"; }, 4000);
      return;
    }
    if (ds.ok) {
      const s = stop(ds.ok), done = stopDone(s) && !stopFailed(s);
      const expected = S.display.find(stopActive);
      s.pkgs.forEach(p => { if (done) clearStatus(p.tn); else if (S.prog.status[p.tn] !== "ok") setOk(p.tn); });
      const ooo = !ds.together && !done && expected && expected !== s && S.display.some(x => stopActive(x) && x !== s);
      S.outOfOrder = ooo ? s.key : null;
      afterStatus(done ? null : ooo ? `Parada ${s.n} entregue fora da ordem` : `Parada ${s.n} entregue`);
      if (t.closest("#findResult")) { $("findResult").innerHTML = ""; $("shopeeStopInput").value = ""; $("findInput").value = ""; }
      if (ooo) $("next").scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (ds.missing) {
      S.prog.missing = S.prog.missing || {};
      stop(ds.missing).pkgs.filter(pkgOpen).forEach(p => (S.prog.missing[p.tn] = Date.now()));
      afterStatus("Anotado. Quando achar, escaneie o pacote ou toque em Achei.");
    } else if (ds.pmiss) {
      S.prog.missing = S.prog.missing || {};
      S.prog.missing[ds.pmiss] ? delete S.prog.missing[ds.pmiss] : (S.prog.missing[ds.pmiss] = Date.now());
      afterStatus();
    } else if (ds.found) {
      const s = stop(ds.found);
      s.pkgs.forEach(p => delete S.prog.missing[p.tn]);
      // Vira a próxima parada.
      const keys = S.display.map(x => x.key).filter(k => k !== s.key);
      const at = keys.findIndex(k => stopActive(S.byKey.get(k)));
      keys.splice(at < 0 ? keys.length : at, 0, s.key);
      S.prog.order = keys; S.prog.later = S.prog.later.filter(k => k !== s.key);
      saveProg(); derive(); renderAll();
      toast(`Achou! A parada ${s.n} é a próxima.`);
      $("next").scrollIntoView({ behavior: "smooth", block: "start" });
      if (t.closest("#findResult")) $("findResult").innerHTML = "";
    } else if (ds.reorder) {
      reorderFrom(stop(ds.reorder));
    } else if (ds.reorderNo) {
      S.outOfOrder = null; renderAll();
    } else if (ds.other) {
      $("findInput").scrollIntoView({ behavior: "smooth", block: "center" });
      $("findInput").focus();
      toast("Escaneie ou digite o pacote que você entregou");
    } else if (ds.showstop) {
      const s = stop(ds.showstop);
      showStop(s, `Paradas Shopee ${refs(s).join(" + ") || "sem nº"} no mesmo local`);
      $("findResult").scrollIntoView({ behavior: "smooth", block: "center" });
    } else if (ds.failopen) { S.failOpen = ds.failopen; renderAll(); }
    else if (ds.failcancel) { S.failOpen = null; renderAll(); }
    else if (ds.fail) {
      stop(ds.fail).pkgs.forEach(p => { if (!S.prog.status[p.tn]) { S.prog.status[p.tn] = "fail"; S.prog.reason[p.tn] = ds.reason; } });
      S.failOpen = null; afterStatus("Marcado como não entregue. Vai para a lista de devolução.");
    } else if (ds.later) {
      S.prog.later = S.prog.later.filter(k => k !== ds.later).concat(ds.later);
      saveProg(); derive(); renderAll(); toast("Parada movida para o fim da rota");
    } else if (ds.pok || ds.pfail) {
      const tn = ds.pok || ds.pfail, want = ds.pok ? "ok" : "fail";
      if (S.prog.status[tn] === want) clearStatus(tn);
      else if (want === "ok") setOk(tn);
      else { S.prog.status[tn] = "fail"; S.prog.reason[tn] = "Não entregue"; delete S.prog.missing?.[tn]; }
      afterStatus(want === "ok" && S.prog.status[tn] ? "Pacote entregue" : null);
      if (t.closest("#findResult")) {
        if ($("shopeeStopInput").value) $("shopeeStopInput").dispatchEvent(new Event("input"));
        else if (S.lastFound) showStop(S.byKey.get(S.lastFound.key), S.lastFound.title, S.lastFound.tn);
      }
    } else if (ds.copy) {
      navigator.clipboard?.writeText(ds.copy).then(() => toast("Código copiado: cole no app da SPX"), () => toast(ds.copy));
    } else if (ds.pick) {
      S.prog.picked[ds.pick] ? delete S.prog.picked[ds.pick] : (S.prog.picked[ds.pick] = 1);
      saveProg(); renderAll();
    } else if (ds.pickall != null) {
      S.display.filter(s => s.block === +ds.pickall).forEach(s => s.pkgs.forEach(p => (S.prog.picked[p.tn] = 1)));
      saveProg(); renderAll(); toast("Bloco separado. Boa rota!");
    }
  });

  function afterStatus(msg) {
    const prevBlock = S.lastNextBlock;
    if (!S.prog.startedAt && Object.keys(S.prog.status).length) S.prog.startedAt = Date.now();
    const allDone = S.display.every(stopDone);
    if (allDone && !S.prog.finishedAt) S.prog.finishedAt = Date.now();
    if (!allDone) S.prog.finishedAt = null;
    saveProg();
    renderAll();
    const next = S.display.find(stopActive);
    if (next && prevBlock != null && next.block !== prevBlock && $("pickCard").innerHTML) {
      buzz([80, 60, 80]);
      toast(`Bloco ${next.block + 1}: separe os pacotes da zona ${next.zone.code}`);
      $("pickCard").scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (msg) toast(msg);
  }

  $("findInput").addEventListener("input", e => {
    const m = Core.matchTN(S.route?.pkgs || [], e.target.value);
    $("shopeeStopInput").value = "";
    if (m.length === 1 && e.target.value.replace(/[^A-Za-z0-9]/g, "").length >= 4) return showFound(m[0]);
    $("findResult").innerHTML = m.slice(0, 8).map(p => {
      const s = S.byTn.get(p.tn), st = S.prog.status[p.tn];
      return `<p><b class="mono">${esc(p.tn)}</b> → parada ${s.n} · zona ${s.zone.code} (${esc(s.zone.name)}) · ${esc(s.label)}${st ? (st === "ok" ? " · entregue" : " · não entregue") : ""}</p>`;
    }).join("") || (e.target.value.length >= 3 ? "Nenhum pacote desta rota termina assim." : "");
  });

  $("copy").addEventListener("click", async () => {
    const txt = S.display.map(s => `${s.n}. ${multi() ? s.ris.map(i => "R" + (i + 1)).join("+") + " " : ""}[${s.zone.code}] ${s.label} (${s.pkgs.length} pct; Shopee ${s.shopeeStops.join(", ") || "sem nº"})\n   ${s.pkgs.map(p => p.tn).join(" ")}`).join("\n");
    try { await navigator.clipboard.writeText(txt); toast("Lista copiada"); } catch { toast("Não foi possível copiar neste navegador"); }
  });

  // ---------- ajustes ----------
  function fillSettings() {
    const st = S.route.settings;
    $("vehicle").innerHTML = Object.entries(Core.VEHICLES).map(([k, v]) => `<option value="${k}">${esc(v.name)}</option>`).join("");
    $("multiMode").value = st.multiMode || "seq";
    $("vehicle").value = st.vehicle; $("blockSize").value = st.blockSize; $("maxPkgs").value = st.maxPkgs || 25; $("radius").value = st.radius; $("radiusVal").textContent = st.radius;
    const stops = Core.groupStops(S.route.pkgs, st.radius).sort((a, b) => a.minSeq - b.minSeq);
    $("start").innerHTML = `<option value="shopee">Primeira parada da Shopee</option><option value="gps">Minha localização atual</option>` +
      stops.map(s => `<option value="s${esc(s.key)}">${esc(s.label)}${s.shopeeStops.length ? " (Shopee " + s.shopeeStops[0] + ")" : ""}</option>`).join("");
    $("start").value = [...$("start").options].some(o => o.value === st.start) ? st.start : "shopee";
    const f = S.fin, a = S.assume, p = S.prog;
    $("fuel").value = f.fuel; $("price").value = f.price; $("kml").value = f.kml; $("extras").value = f.extras; $("payMode").value = f.payMode; $("payValue").value = f.payValue;
    $("aSpeed").value = a.speed; $("aStop").value = a.stopMin; $("aExtra").value = a.extraPkgMin; $("aMessy").value = a.searchMessy; $("aOrg").value = a.searchOrg;
    $("odoStart").value = p.odoStart ?? ""; $("odoEnd").value = p.odoEnd ?? ""; $("cdKm").value = p.cdKm || 0;
  }
  $("radius").addEventListener("input", e => ($("radiusVal").textContent = e.target.value));
  $("multiMode").addEventListener("change", async e => {
    S.route.settings.multiMode = e.target.value; saveRoute(); derive();
    await plan();
    toast(e.target.value === "join" ? "Rotas juntas num caminho só" : "Uma rota depois da outra");
  });
  $("vehicle").addEventListener("change", e => { S.route.settings.vehicle = e.target.value; saveRoute(); derive(); renderAll(); });
  $("blockSize").addEventListener("change", e => { S.route.settings.blockSize = Math.max(3, Math.min(20, +e.target.value || 10)); e.target.value = S.route.settings.blockSize; saveRoute(); derive(); renderAll(); });
  $("maxPkgs").addEventListener("change", e => { S.route.settings.maxPkgs = Math.max(5, Math.min(80, +e.target.value || 25)); e.target.value = S.route.settings.maxPkgs; saveRoute(); derive(); renderAll(); });
  $("start").addEventListener("change", async e => {
    if (e.target.value === "gps") {
      try {
        S.gpsStart = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(p => res({ lat: p.coords.latitude, lng: p.coords.longitude }), rej, { enableHighAccuracy: true, timeout: 10000 }));
      } catch { toast("Localização indisponível aqui. Escolha uma parada para começar."); e.target.value = S.route.settings.start; return; }
    }
  });
  $("recalc").addEventListener("click", async () => {
    if (anyLoaded() && !S.recalcArmed) { S.recalcArmed = true; $("recalcNote").hidden = false; return; }
    S.recalcArmed = false; $("recalcNote").hidden = true;
    Object.assign(S.route.settings, { start: $("start").value, radius: +$("radius").value, vehicle: $("vehicle").value });
    S.prog.later = [];
    saveProg();
    await plan();
    toast("Rota recalculada");
  });

  // ---------- CARREGAR ----------
  let scanTimer = null;
  $("scanInput").addEventListener("input", e => {
    clearTimeout(scanTimer);
    const q = e.target.value.trim();
    const m = Core.matchTN(S.route?.pkgs || [], q);
    if (m.length === 1 && q.replace(/[^A-Za-z0-9]/g, "").length >= 4) return registerLoad(m[0]);
    if (m.length > 1) $("scanResult").innerHTML = `<p class="sub">${m.length} pacotes terminam assim: ${m.map(p => `<b class="mono">${esc(p.tn)}</b>`).join(", ")}. Digite mais um caractere.</p>`;
    else if (!m.length && q.length >= 5) scanTimer = setTimeout(() => showMiss(q), 500);
    else $("scanResult").innerHTML = "";
  });
  $("scanInput").addEventListener("keydown", e => {
    if (e.key !== "Enter") return;
    const m = Core.matchTN(S.route?.pkgs || [], e.target.value);
    if (m.length === 1) registerLoad(m[0]); else if (!m.length) showMiss(e.target.value);
  });
  function showMiss(q) {
    $("scanResult").innerHTML = `<div class="hit miss"><div class="big">?</div><div class="nm">${esc(q.toUpperCase())} não está nesta rota</div><div>Confira o código. Pode ser pacote de outro motorista.</div></div>`;
    buzz([200, 80, 200]);
  }
  function registerLoad(p) {
    const s = S.byTn.get(p.tn);
    const again = !!S.prog.loaded[p.tn];
    if (!again) { S.prog.loaded[p.tn] = Date.now(); S.prog.loadLog.push(p.tn); }
    S.prog.loadedZone = S.prog.loadedZone || {};
    S.prog.loadedZone[p.tn] = s.zone.code;
    saveProg();
    $("scanInput").value = "";
    $("scanResult").innerHTML = `<div class="hit${again ? " again" : ""}" style="${zc(s.zoneIdx)}">
      ${multi() ? `<div class="rline">${rTag(ri(p), true)}</div>` : ""}
      <div class="big">${s.zone.code}</div>
      <div class="nm">Parada ${s.n} · ${esc(s.zone.name)}${s.layer ? " · por baixo" : ""}</div>
      <div>${again ? "Já carregado antes · " : ""}Bloco ${s.block + 1} · ${esc(s.label)}</div>
      <div class="mono">${esc(p.tn)}</div></div>`;
    buzz(again ? [60, 60, 60] : 60);
    $("scanUndo").disabled = !S.prog.loadLog.length;
    renderAll();
  }
  $("scanUndo").addEventListener("click", () => {
    const tn = S.prog.loadLog.pop();
    if (!tn) return;
    delete S.prog.loaded[tn]; if (S.prog.loadedZone) delete S.prog.loadedZone[tn]; saveProg();
    $("scanResult").innerHTML = `<p class="sub">Desfeito: ${esc(tn)}</p>`;
    $("scanUndo").disabled = !S.prog.loadLog.length;
    renderAll();
  });

  // ---------- leitura do código de barras (ZXing) ----------
  const findPkgByCode = text => {
    const t = String(text || "").toUpperCase().replace(/\s+/g, "");
    return S.route?.pkgs.find(p => p.tn && t.includes(p.tn.toUpperCase())) || null;
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

  function scanMiss(ctx, read) {
    const box = ctx === "load" ? $("scanResult") : $("findResult");
    box.innerHTML = read.length
      ? `<div class="hit miss"><div class="big">?</div><div class="nm">Este pacote não está nesta rota</div><div>Código lido: <span class="mono">${esc(read.join(", "))}</span></div></div>`
      : `<div class="hit again"><div class="big">?</div><div class="nm">Não consegui ler o código</div><div>Fotografe só a etiqueta, de perto, com luz e sem tremer. Ou digite o final do código.</div></div>`;
    buzz([200, 80, 200]);
  }
  const onScanned = (p, ctx) => { if (ctx === "load") return registerLoad(p); $("findInput").value = ""; showFound(p); };

  [["photoScan", "load", "scanResult"], ["photoFind", "find", "findResult"]].forEach(([id, ctx, out]) => {
    $(id).addEventListener("change", async e => {
      const f = e.target.files[0];
      e.target.value = "";
      if (!f || !S.route) return;
      if (!window.ZXing) return toast("O leitor de código não carregou. Confira a internet e abra o app de novo.");
      $(out).innerHTML = `<p class="sub">Lendo a etiqueta…</p>`;
      try {
        const { p, read } = await decodePhoto(f);
        p ? onScanned(p, ctx) : scanMiss(ctx, read);
      } catch { scanMiss(ctx, []); }
    });
  });

  // Câmera contínua: funciona quando o navegador libera a câmera ao vivo (no link do GitHub Pages, por exemplo).
  const live = {};
  if (window.ZXing && navigator.mediaDevices?.getUserMedia) { $("liveScan").hidden = false; $("liveFind").hidden = false; }
  [["liveScan", "camVideo", "load"], ["liveFind", "findVideo", "find"]].forEach(([btn, vid, ctx]) => {
    $(btn).addEventListener("click", async () => {
      if (live[ctx]) { live[ctx].reset(); live[ctx] = null; $(vid).hidden = true; $(btn).textContent = "Câmera contínua"; return; }
      const reader = new ZXing.BrowserMultiFormatReader(zxHints(), 250);
      let last = "", lastAt = 0;
      live[ctx] = reader; $(vid).hidden = false; $(btn).textContent = "Fechar câmera";
      try {
        await reader.decodeFromVideoDevice(undefined, $(vid), res => {
          if (!res) return;
          const txt = res.getText();
          if (txt === last && Date.now() - lastAt < 3000) return;
          last = txt; lastAt = Date.now();
          const p = findPkgByCode(txt);
          p ? onScanned(p, ctx) : scanMiss(ctx, [txt]);
        });
      } catch {
        reader.reset(); live[ctx] = null; $(vid).hidden = true; $(btn).textContent = "Câmera contínua";
        toast("A câmera ao vivo não abriu aqui. Use Escanear etiqueta.");
      }
    });
  });

  // Todos os pacotes deste local (com o nº de parada da Shopee de cada um) e os locais a poucos passos.
  function locBox(s, tn) {
    const near = Core.nearby(s, S.display, 60).filter(x => !stopDone(x.s));
    return `<div class="loc">
      <b class="alert">${s.pkgs.length > 1 ? `Neste local: ${s.pkgs.length} pacotes` : "Só este pacote neste local"}</b>
      ${refs(s).length ? `<div class="stopnums">${refs(s).map(x => `<span>Shopee ${x}</span>`).join("")}${s.unseq ? `<span>${s.unseq} sem nº</span>` : ""}</div>` : ""}
      <ul>${s.pkgs.map(p => `<li class="${p.tn === tn ? "me" : ""} ${S.prog.status[p.tn] ? "done" : ""}"><span class="mono">${esc(tail(p.tn))}</span><span>${pkgRef(p)}</span><span>${esc(p.address.split(",").slice(2).join(",").trim())}</span>${pkgMissing(p) ? "<b>não achei</b>" : ""}${S.prog.doneAt?.[p.tn] ? `<span>entregue ${hhmm(S.prog.doneAt[p.tn])}</span>` : ""}${!pkgDone(p) ? `<button type="button" class="mini" data-pok="${esc(p.tn)}">Entregue</button>` : ""}</li>`).join("")}</ul>
      ${near.length ? `<div class="near">A poucos passos: ${near.map(x => `${Math.round(x.d)} m, ${esc(x.s.label)} (Shopee ${refs(x.s).join(", ") || "sem nº"}, ${x.s.pkgs.length} pct)`).join("; ")}</div>` : ""}
    </div>`;
  }

  function showStop(s, title, tn) { S.lastFound = { key: s.key, title, tn }; $("findResult").innerHTML = stopCard(s, title, tn); buzz(60); }
  function stopCard(s, title, tn) {
    return `<div class="hit" style="${zc(s.zoneIdx)}">
      ${multi() ? `<div class="rline">${s.ris.map(i => rTag(i, true)).join(" ")}</div>` : ""}
      <div class="big">${s.n}</div>
      <div class="nm">${title}</div>
      <div>${esc(s.label)} · nossa parada ${s.n} de ${S.display.length}</div>
      <div>Zona ${s.zone.code}: ${esc(s.zone.name)} · Bloco ${s.block + 1}${stopDone(s) ? " · já entregue" : ""}</div>
      ${locBox(s, tn)}
      <div class="nav"><a class="btn" href="${Core.links.waze(s)}" target="_blank" rel="noopener">Waze</a><a class="btn" href="${Core.links.gmaps(s)}" target="_blank" rel="noopener">Google</a>${stopMissing(s) ? `<button type="button" class="btn" data-found="${esc(s.key)}">Achei, ir agora</button>` : ""}${!stopDone(s) ? `<button type="button" class="btn" data-ok="${esc(s.key)}">Entregar ${s.pkgs.filter(p => !pkgDone(p)).length > 1 ? "todos" : ""}</button>` : ""}</div></div>`;
  }

  $("shopeeStopInput").addEventListener("input", e => {
    const n = parseInt(e.target.value, 10);
    if (!S.route || !n) { $("findResult").innerHTML = ""; return; }
    $("findInput").value = "";
    // Com várias rotas, o mesmo número de parada existe em cada uma: mostra todas.
    const hits = S.display.filter(x => x.shopeeStops.includes(n));
    if (!hits.length) { $("findResult").innerHTML = `<p>A parada ${n} da Shopee não está ${multi() ? "em nenhuma das rotas" : "nesta planilha"}.</p>`; return; }
    const head = hits.length > 1 ? `<p><b>A parada ${n} existe em ${hits.length} rotas.</b> Confira a rota na etiqueta.</p>` : "";
    $("findResult").innerHTML = head + hits.map(s => {
      const others = refs(s).filter(x => x !== (multi() ? `R${s.pkgs.find(p => p.shopeeStop === n) ? ri(s.pkgs.find(p => p.shopeeStop === n)) + 1 : 0}·${n}` : String(n)));
      return stopCard(s, `Parada Shopee ${n}${others.length ? ` fica junto com ${others.join(", ")}` : ""}`);
    }).join("");
    buzz(60);
  });

  function showFound(p) {
    $("shopeeStopInput").value = "";
    const s = S.byTn.get(p.tn), st = S.prog.status[p.tn];
    if (s) return showStop(s, `${pkgMissing(p) ? "Você tinha marcado “não achei”: " : ""}Pacote ${esc(tail(p.tn))} · ${pkgRef(p)}${st ? (st === "ok" ? " · entregue" : " · não entregue") : ""}`, p.tn);
  }


  function renderLoad() {
    const st = S.route.settings, veh = Core.VEHICLES[st.vehicle];
    const total = S.route.pkgs.length, loaded = Object.keys(S.prog.loaded).length;
    $("loadCount").textContent = `${loaded} de ${total} pacotes`;
    const zones = veh.zones.map((z, i) => ({ z, i, blocks: new Set(), routes: new Set(), total: 0, loaded: 0, missing: [] }));
    S.planStops.forEach(s => {
      const Z = zones[s.zoneIdx];
      Z.blocks.add(s.block + 1);
      s.ris.forEach(r => Z.routes.add(r));
      s.pkgs.forEach(p => { Z.total++; if (S.prog.loaded[p.tn]) Z.loaded++; else Z.missing.push(p.tn); });
    });
    const used = zones.filter(Z => Z.total);
    $("zoneProgress").innerHTML = used.map(Z => `<div class="zrow" style="${zc(Z.i)}"><div class="zl">${Z.z.code}</div>
      <div>${multi() ? [...Z.routes].map(r => rTag(r)).join("") + " " : ""}<b>${esc(Z.z.name)}</b> <span class="sub">· bloco ${[...Z.blocks].join(" e ")}</span><div class="bar"><i style="width:${(Z.loaded / Z.total * 100).toFixed(0)}%"></i></div></div>
      <span class="num">${Z.loaded}/${Z.total}</span></div>`).join("");
    const miss = used.flatMap(Z => Z.missing.map(tn => `${Z.z.code}: ${tn}`));
    $("missingBox").hidden = !miss.length || !loaded;
    $("missingSum").textContent = `Faltam carregar ${miss.length} pacote(s)`;
    $("missingList").textContent = miss.join(" · ");
    $("scanUndo").disabled = !S.prog.loadLog.length;

    // Pacotes já no carro que mudaram de zona (por exemplo, porque outra rota entrou no dia).
    const moved = Object.entries(S.prog.loadedZone || {}).map(([tn, code]) => ({ tn, code, s: S.byTn.get(tn) })).filter(x => x.s && x.s.zone.code !== x.code && !S.prog.status[x.tn]);
    $("movedBox").hidden = !moved.length;
    $("movedBox").innerHTML = moved.length ? `<h2>Mudar de lugar: ${moved.length} pacote(s)</h2><p class="sub">As zonas foram redistribuídas entre as rotas. Mova estes pacotes que já estão no carro:</p>
      <ul class="moved">${moved.map(x => `<li><span class="mono">${esc(tail(x.tn))}</span> ${multi() ? rTag(ri(S.route.pkgs.find(p => p.tn === x.tn))) : ""} de <b>${x.code}</b> para <b>${x.s.zone.code}</b> <button type="button" class="ghost" data-moved="${esc(x.tn)}">Mudei</button></li>`).join("")}</ul>` : "";

    $("vehicleSvg").innerHTML = vehicleSvg(st.vehicle, zones);
    const blocks = S.planStops[S.planStops.length - 1].block + 1;
    $("vehicleNote").textContent = S.zoneSplit && multi()
      ? S.zoneSplit.map((zs, r) => `Rota ${r + 1}: zona${zs.length > 1 ? "s" : ""} ${zs.map(i => veh.zones[i].code).join(", ")}`).join(" · ") + ". Cada rota fica separada no carro; dentro dela, os blocos seguem a ordem de entrega."
      : blocks > veh.zones.length
      ? `${blocks} blocos para ${veh.zones.length} zonas: a partir do bloco ${veh.zones.length + 1}, os pacotes vão por baixo, voltando à zona A. Quando o bloco de cima acabar, o de baixo aparece. Para evitar camadas, aumente as paradas por bloco nos ajustes da rota.`
      : `Frente do veículo para cima. O lado direito é o da calçada. ${blocks} blocos de até ${st.blockSize} paradas ou ${st.maxPkgs || 25} pacotes.`;

    const legs = []; for (let i = 1; i < S.planStops.length; i++) legs.push(dist(S.planStops[i - 1], S.planStops[i]));
    const est = Core.estimateMinutes(legs, S.planStops, S.assume);
    $("timeCompare").innerHTML = `<div><b>${dur(est.messy)}</b><span class="sub">sem organizar</span></div><div><b>${dur(est.organized)}</b><span class="sub">por zonas</span></div><div class="gain"><b>−${dur(est.messy - est.organized)}</b><span class="sub">de ganho</span></div>`;
    $("timeNote").textContent = `Estimativa com ${S.planStops.length} paradas, ${km(S.route.plan.km)}: direção a ${S.assume.speed} km/h, ${S.assume.stopMin} min por parada e busca do pacote de ${S.assume.searchMessy} min (carro bagunçado) contra ${S.assume.searchOrg} min (por zona). Ajuste em Ganhos › Premissas de tempo.`;
  }

  function vehicleSvg(kind, zones) {
    const lay = {
      carro: { w: 300, h: 560, body: `<rect x="20" y="10" width="260" height="540" rx="70" fill="var(--surface)" stroke="var(--ink)" stroke-width="4"/><rect x="50" y="70" width="200" height="50" rx="10" fill="var(--line)"/><text x="150" y="102" text-anchor="middle" font-size="16" fill="var(--muted)">para-brisa</text><rect x="45" y="150" width="100" height="100" rx="12" fill="var(--line)"/><text x="95" y="205" text-anchor="middle" font-size="15" fill="var(--muted)">motorista</text>`,
        rects: [[155, 150, 100, 100], [155, 270, 100, 110], [45, 270, 100, 110], [155, 400, 100, 120], [45, 400, 100, 120]] },
      utilitario: { w: 300, h: 600, body: `<rect x="20" y="10" width="260" height="580" rx="40" fill="var(--surface)" stroke="var(--ink)" stroke-width="4"/><rect x="45" y="40" width="100" height="100" rx="12" fill="var(--line)"/><text x="95" y="95" text-anchor="middle" font-size="15" fill="var(--muted)">motorista</text><line x1="20" y1="160" x2="280" y2="160" stroke="var(--ink)" stroke-width="3"/><text x="150" y="582" text-anchor="middle" font-size="14" fill="var(--muted)">portas traseiras</text>`,
        rects: [[155, 40, 100, 100], [155, 450, 100, 110], [45, 450, 100, 110], [155, 320, 100, 115], [45, 320, 100, 115], [45, 180, 210, 125]] },
      moto: { w: 300, h: 380, body: `<rect x="40" y="20" width="220" height="340" rx="24" fill="var(--surface)" stroke="var(--ink)" stroke-width="4"/><text x="150" y="14" text-anchor="middle" font-size="14" fill="var(--muted)">tampa da bag</text>`,
        rects: [[60, 40, 180, 95], [60, 145, 180, 95], [60, 250, 180, 95]] },
    }[kind];
    const z = zones.map((Z, i) => {
      const [x, y, w, h] = lay.rects[i];
      const blocks = [...Z.blocks];
      return `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="var(--z${i + 1})" opacity="${Z.total ? 1 : 0.25}"/>
        <text x="${x + w / 2}" y="${y + h / 2 + 4}" text-anchor="middle" font-size="40" font-weight="800" fill="var(--z-ink)">${Z.z.code}</text>
        <text x="${x + w / 2}" y="${y + h / 2 + 28}" text-anchor="middle" font-size="14" fill="var(--z-ink)">${blocks.length ? (multi() ? [...Z.routes].map(r => "R" + (r + 1)).join("+") + " · " : "") + "bl. " + blocks.join(", ") : "livre"}</text></g>`;
    }).join("");
    return `<svg class="vehicle" viewBox="0 0 ${lay.w} ${lay.h}" role="img" aria-label="Zonas do veículo vistas de cima">${lay.body}${z}</svg>`;
  }

  // ---------- GANHOS ----------
  function kmUsed() {
    const p = S.prog;
    if (p.odoStart != null && p.odoEnd != null && p.odoEnd > p.odoStart) return { km: p.odoEnd - p.odoStart, src: "pelo odômetro" };
    if (p.gpsKm > 0.2) return { km: p.gpsKm, src: "medido pelo GPS" };
    return { km: S.route.plan.km / 1000 + (+p.cdKm || 0), src: "estimado pela rota" + (p.cdKm ? " + trajeto do CD" : "") };
  }
  function hoursWorked() {
    const p = S.prog;
    if (p.startedAt) return ((p.finishedAt || Date.now()) - p.startedAt) / 3.6e6;
    return null;
  }
  function money() {
    const pk = S.route.pkgs;
    const delivered = pk.filter(p => S.prog.status[p.tn] === "ok").length;
    const stopsDone = S.display.filter(s => s.pkgs.some(p => S.prog.status[p.tn] === "ok")).length;
    const { km: k } = kmUsed();
    return { ...Core.finance({ ...S.fin, km: k, delivered, stopsDone, hours: hoursWorked() || 0, routes: S.route.routes.length }), delivered, k };
  }

  function renderMoney() {
    const p = S.prog, m = money(), ku = kmUsed(), h = hoursWorked();
    $("clock").textContent = p.startedAt ? `${hhmm(p.startedAt)} → ${p.finishedAt ? hhmm(p.finishedAt) : "agora"} · ${dur(h * 60)}` : "não iniciada";
    $("dayStart").textContent = p.startedAt ? "Marcar início agora" : "Iniciar rota agora";
    $("dayEnd").disabled = !p.startedAt;
    $("dayInfo").textContent = p.startedAt ? "A rota começa sozinha na primeira entrega marcada e termina na última." : "Ou ela começa sozinha quando você marcar a primeira entrega.";
    $("kmInfo").textContent = `Usando ${kmN(ku.km)}, ${ku.src}.${p.gpsKm ? ` GPS: ${kmN(p.gpsKm)}.` : ""}`;
    $("gpsBtn").textContent = S.gpsWatch != null ? "Parar medição pelo GPS" : "Medir km pelo GPS";
    const total = S.route.pkgs.length;
    $("moneyStats").innerHTML = [
      [brl(m.gain), `ganho bruto · ${m.delivered}/${total} entregues`],
      [brl(m.fuel), `combustível · ${m.liters.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ${S.fin.fuel === "gnv" ? "m³" : "L"}`],
      [brl(m.profit), "lucro líquido", m.profit >= 0 ? "good" : "badv"],
      [m.perHour != null && h >= 0.25 ? brl(m.perHour) : "–", "lucro por hora"],
      [kmN(m.k), "rodados"],
      [m.costPerKm != null ? brl(m.costPerKm) : "–", "custo por km"],
      [m.perPkg != null ? brl(m.perPkg) : "–", "lucro por pacote"],
      [h ? dur(h * 60) : "–", "horas na rua"],
    ].map(([b, s, c]) => `<div class="stat ${c || ""}"><b>${b}</b><span>${s}</span></div>`).join("");
    $("fuelTip").textContent = S.fin.fuel === "etanol" || S.fin.fuel === "gasolina"
      ? "Regra prática: etanol compensa quando custa até 70% do preço da gasolina, porque o carro roda cerca de 30% menos por litro."
      : "";

    const fails = S.route.pkgs.filter(x => S.prog.status[x.tn] === "fail");
    $("returns").innerHTML = fails.length ? `<div class="card"><h2>Devolver ao CD: ${fails.length}</h2>${fails.map(x => `<p class="sub"><b class="mono">${esc(x.tn)}</b> · ${esc(S.prog.reason[x.tn] || "")} · ${esc(x.address)}</p>`).join("")}</div>` : "";

    const hist = S.hist.slice().sort((a, b) => b.date.localeCompare(a.date));
    if (!hist.length) { $("hist").innerHTML = `<tbody><tr><td class="sub" style="text-align:left;white-space:normal">Toque em "Fechar o dia" ao terminar para guardar o resultado aqui.</td></tr></tbody>`; $("clearHist").hidden = true; return; }
    const sum = k => hist.reduce((s, r) => s + (r[k] || 0), 0);
    const row = r => `<td>${r.ok}</td><td>${kmN(r.km)}</td><td>${r.hours ? dur(r.hours * 60) : "–"}</td><td>${brl(r.gain)}</td><td>${brl(r.cost)}</td><td>${brl(r.profit)}</td>`;
    $("hist").innerHTML = `<thead><tr><th>Dia</th><th>Entregues</th><th>Km</th><th>Horas</th><th>Ganho</th><th>Gasto</th><th>Lucro</th></tr></thead>
      <tbody>${hist.map(r => `<tr><td>${r.date.split("-").reverse().join("/")}</td>${row(r)}</tr>`).join("")}</tbody>
      <tfoot><tr><td>Total</td>${row({ ok: sum("ok"), km: sum("km"), hours: sum("hours"), gain: sum("gain"), cost: sum("cost"), profit: sum("profit") })}</tr></tfoot>`;
    $("clearHist").hidden = false;
  }

  const bindNum = (id, obj, key, save) => $(id).addEventListener("input", e => { const v = parseFloat(String(e.target.value).replace(",", ".")); obj()[key] = isFinite(v) ? v : (key.startsWith("odo") ? null : 0); save(); renderAll(); });
  const saveFin = () => store.set("rc:fin", S.fin), saveAssume = () => store.set("rc:assume", S.assume);
  [["price", "price"], ["kml", "kml"], ["extras", "extras"], ["payValue", "payValue"]].forEach(([id, k]) => bindNum(id, () => S.fin, k, saveFin));
  [["aSpeed", "speed"], ["aStop", "stopMin"], ["aExtra", "extraPkgMin"], ["aMessy", "searchMessy"], ["aOrg", "searchOrg"]].forEach(([id, k]) => bindNum(id, () => S.assume, k, saveAssume));
  [["odoStart", "odoStart"], ["odoEnd", "odoEnd"], ["cdKm", "cdKm"]].forEach(([id, k]) => bindNum(id, () => S.prog, k, saveProg));
  $("fuel").addEventListener("change", e => { S.fin.fuel = e.target.value; saveFin(); renderAll(); });
  $("payMode").addEventListener("change", e => { S.fin.payMode = e.target.value; saveFin(); renderAll(); });
  $("dayStart").addEventListener("click", () => { S.prog.startedAt = Date.now(); S.prog.finishedAt = null; saveProg(); renderAll(); toast("Rota iniciada às " + hhmm(S.prog.startedAt)); });
  $("dayEnd").addEventListener("click", () => { S.prog.finishedAt = Date.now(); saveProg(); renderAll(); toast("Rota finalizada às " + hhmm(S.prog.finishedAt)); });

  $("gpsBtn").addEventListener("click", async () => {
    if (S.gpsWatch != null) {
      navigator.geolocation.clearWatch(S.gpsWatch); S.gpsWatch = null; S.lastPos = null;
      try { await S.wake?.release(); } catch {} S.wake = null;
      renderAll(); return;
    }
    if (!navigator.geolocation) return toast("GPS indisponível neste navegador. Use o odômetro.");
    S.gpsWatch = navigator.geolocation.watchPosition(pos => {
      const c = pos.coords;
      if (c.accuracy > 35) return;
      const here = { lat: c.latitude, lng: c.longitude };
      if (S.lastPos) {
        const d = Core.hav(S.lastPos, here);
        if (d < 15) return;
        if (d < 2000) { S.prog.gpsKm = (S.prog.gpsKm || 0) + d / 1000; saveProg(); }
      }
      S.lastPos = here;
      if (!$("view-ganhos").hidden) renderMoney();
    }, () => { toast("Sem permissão de localização. Use o odômetro."); navigator.geolocation.clearWatch(S.gpsWatch); S.gpsWatch = null; renderAll(); }, { enableHighAccuracy: true, maximumAge: 5000 });
    try { S.wake = await navigator.wakeLock?.request("screen"); } catch {}
    toast("Medindo km pelo GPS. Deixe esta tela aberta.");
    renderAll();
  });

  $("closeDay").addEventListener("click", () => {
    const m = money(), h = hoursWorked();
    const today = new Date(S.prog.startedAt || Date.now());
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const entry = { date, id: S.route.id, ok: m.delivered, fail: S.route.pkgs.filter(p => S.prog.status[p.tn] === "fail").length, km: m.k, hours: h || 0, gain: m.gain, cost: m.costs, profit: m.profit };
    S.hist = S.hist.filter(r => r.id !== entry.id).concat(entry);
    store.set("rc:hist", S.hist); renderAll(); toast("Dia guardado no histórico");
  });
  $("clearHist").addEventListener("click", e => {
    if (e.target.dataset.armed) { S.hist = []; store.set("rc:hist", []); delete e.target.dataset.armed; e.target.textContent = "Apagar histórico"; renderAll(); return; }
    e.target.dataset.armed = "1"; e.target.textContent = "Toque de novo para apagar tudo";
    setTimeout(() => { delete e.target.dataset.armed; e.target.textContent = "Apagar histórico"; }, 4000);
  });
  setInterval(() => { if (S.route && S.display.length && !$("view-ganhos").hidden) renderMoney(); }, 30000);

  // ---------- mapa ----------
  function drawMap() {
    const cv = $("map"), ctx = cv.getContext("2d");
    const css = getComputedStyle(document.documentElement), tok = n => css.getPropertyValue(n).trim();
    const W = cv.width, H = cv.height, pad = 70;
    ctx.clearRect(0, 0, W, H);
    const o = S.display;
    if (!o.length) return;
    const lats = o.map(s => s.lat), lngs = o.map(s => s.lng);
    const kx = Math.cos((Math.min(...lats) + Math.max(...lats)) / 2 * Math.PI / 180);
    const x0 = Math.min(...lngs) * kx, x1 = Math.max(...lngs) * kx, y0 = Math.min(...lats), y1 = Math.max(...lats);
    const sc = Math.min((W - 2 * pad) / (x1 - x0 || 1e-6), (H - 2 * pad) / (y1 - y0 || 1e-6));
    const ox = (W - (x1 - x0) * sc) / 2, oy = (H - (y1 - y0) * sc) / 2;
    const P = s => [ox + (s.lng * kx - x0) * sc, H - (oy + (s.lat - y0) * sc)];
    ctx.lineWidth = 6; ctx.lineJoin = "round"; ctx.strokeStyle = tok("--muted");
    ctx.beginPath(); o.forEach((s, i) => { const [x, y] = P(s); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
    const nextIdx = o.findIndex(stopActive);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    o.forEach((s, i) => {
      const [x, y] = P(s), r = i === nextIdx ? 40 : 30;
      ctx.globalAlpha = stopDone(s) ? 0.35 : 1;
      // Rota 1 círculo, Rota 2 quadrado, Rota 3 losango.
      ctx.beginPath();
      if (s.ri % 3 === 1) ctx.rect(x - r, y - r, 2 * r, 2 * r);
      else if (s.ri % 3 === 2) { ctx.moveTo(x, y - r * 1.25); ctx.lineTo(x + r * 1.25, y); ctx.lineTo(x, y + r * 1.25); ctx.lineTo(x - r * 1.25, y); ctx.closePath(); }
      else ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = tok(`--z${s.zoneIdx + 1}`); ctx.fill();
      if (i === nextIdx) { ctx.lineWidth = 8; ctx.strokeStyle = tok("--ink"); ctx.stroke(); }
      if (s.unseq) { ctx.lineWidth = 5; ctx.strokeStyle = tok("--accent"); ctx.setLineDash([10, 8]); ctx.beginPath(); ctx.arc(x, y, r + 10, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
      ctx.fillStyle = tok("--z-ink"); ctx.font = `bold ${s.n > 99 ? 24 : 30}px ` + tok("--font-display");
      ctx.fillText(String(s.n), x, y + 1);
    });
    ctx.globalAlpha = 1;
  }
  window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", () => S.display.length && drawMap());

  // ---------- início ----------
  if (S.route) {
    normalizeRoute();
    S.prog = { ...newProg(), ...store.get(progKey(), {}) };
    showResume();
  }
})();
