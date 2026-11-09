// Rota Certa v3: limpo e direto, no estilo dos apps de rota.
// Início (o que dá para fazer) · Mapa (paradas numeradas) · Bipar · Paradas (lista e anotações) · Carregar (de trás
// para frente). A rota é montada pelo endereço (rua inteira de uma vez) e fica fixa depois de criada.
// Depende de ../rota-certa/core.js (Core), Leaflet (L) e ZXing.
(() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const store = {
    get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { toast("Memória do celular cheia: finalize rotas antigas."); } },
  };
  const toast = msg => { const t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => (t.hidden = true), 2600); };
  const buzz = ms => { try { navigator.vibrate?.(ms); } catch {} };
  const hhmm = t => new Date(t).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const ddmm = t => new Date(t).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  const tail = tn => String(tn).slice(-5);
  const tnHtml = tn => `<span class="mono">${esc(String(tn).slice(0, -5))}<b>${esc(tail(tn))}</b></span>`;
  const ICON = {
    check: `<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>`,
    chev: `<svg class="i chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 6l6 6-6 6"/></svg>`,
    x: `<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>`,
    file: `<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>`,
    pin: `<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>`,
    scan: `<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10"/></svg>`,
    box: `<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 7l9-4 9 4-9 4-9-4zM3 7v10l9 4 9-4V7M12 11v10"/></svg>`,
    map: `<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14"/></svg>`,
    clock: `<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`,
    note: `<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M5 4h14v16H5zM9 9h6M9 13h6M9 17h3"/></svg>`,
  };

  // Leitor .xlsx mínimo (lê o zip com DecompressionStream do navegador).
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
  // R: a rota aberta. st: situação de cada pacote (ok = entregue, fail = não entregue, com motivo). notes: anotação
  // por parada. loaded: pacotes já colocados no carro. H: rotas finalizadas (histórico).
  let R = store.get("rc3:route", null), H = store.get("rc3:hist", []);
  let A = [], byKey = new Map(), byTn = new Map(), stops = [];
  let SLOTS = null, activeSlot = null; // várias rotas em andamento (ver "rotas em andamento" mais abaixo)
  const save = () => { store.set("rc3:route", R); persistSlots(); try { window.RCApp?.onSave?.(); } catch {} };
  const saveH = () => store.set("rc3:hist", H);
  const pst = p => R?.st?.[p.tn]?.s || null;
  const resolved = p => !!pst(p);
  const done = a => a.pkgs.every(resolved);
  function stateOf(a) {
    const s = a.pkgs.map(pst);
    if (s.every(x => x === "ok")) return "ok";
    if (s.every(x => x === "fail")) return "fail";
    if (s.some(Boolean)) return "part";
    return "idle";
  }
  function derive() {
    if (!R) { A = []; stops = []; byKey = new Map(); byTn = new Map(); return; }
    A = Core.buildAddresses(R.pkgs);
    byKey = new Map(A.map(a => [a.key, a]));
    byTn = new Map(); A.forEach(a => a.pkgs.forEach(p => byTn.set(p.tn, a)));
    const known = (R.order || []).filter(k => byKey.has(k));
    const set = new Set(known);
    stops = known.map(k => byKey.get(k)).concat(A.filter(a => !set.has(a.key)));
    stops.forEach((a, i) => (a.n = i + 1));
  }
  // Rota em equipe: parada que outra pessoa pegou ("Pego esta") sai da sua sequência.
  const me = () => window.RCApp?.user?.uid || null;
  const claimOf = a => window.RCApp?.remote?.claims?.[a.key] || null;
  const otherClaim = a => { const c = claimOf(a); return c && c.uid !== me() ? c : null; };
  const nextStop = () => stops.find(a => !done(a) && !otherClaim(a)) || stops.find(a => !done(a));
  const byTxt = s => (s?.byName && s.by !== me() ? " · " + s.byName : "");
  const shopeeTxt = a => (a.shopeeStops?.length ? a.shopeeStops.join(" · ") : "");
  const cepOf = a => { const c = String(a.pkgs.find(p => p.cep)?.cep || "").replace(/\D/g, ""); return c.length === 8 ? c.slice(0, 5) + "-" + c.slice(5) : ""; };
  const compl = p => String(p.address || "").split(",").slice(2).join(",").trim();

  // ---------- rota pelo endereço ----------
  // O Core junta os números da mesma rua e faz a rua inteira de uma vez, escolhendo o sentido. Começa pela rua
  // mais perto de você (GPS). Os endereços já resolvidos ficam na frente.
  function nearest(pt, list) { let b = list[0], bd = Infinity; list.forEach(a => { const d = Core.hav(pt, a); if (d < bd) { bd = d; b = a; } }); return b; }
  function buildOrder(from) {
    derive();
    const fin = stops.filter(done), pend = A.filter(a => !done(a));
    if (!pend.length) { R.order = fin.map(a => a.key); return; }
    const start = from ? nearest(from, pend) : pend.reduce((b, a) => ((a.shopeeStops[0] ?? 1e9) < (b.shopeeStops[0] ?? 1e9) ? a : b));
    const r = Core.addressRoute(pend, start.key, { from: from || null });
    R.order = fin.map(a => a.key).concat(r.order.map(a => a.key));
    R.km = r.km; R.geom = null;
    derive();
  }
  // Endereços novos (planilha somada, parada manual) entram no fim, sem mexer no que já está no carro.
  function appendNew() {
    const known = new Set((R.order || []).filter(k => byKey.has(k)));
    const fresh = A.filter(a => !known.has(a.key) && !done(a));
    if (!fresh.length) return;
    const last = stops.filter(a => known.has(a.key)).slice(-1)[0];
    const s0 = last ? nearest(last, fresh) : fresh[0];
    const r = Core.addressRoute(fresh, s0.key, { from: last ? { lat: last.lat, lng: last.lng } : null });
    R.order = [...known].concat(r.order.map(a => a.key));
    R.geom = null;
    derive();
  }
  let here = null;
  function getPos(ms = 5000) {
    return new Promise(res => {
      if (!navigator.geolocation) return res(here);
      let fired = false;
      const t = setTimeout(() => { if (!fired) res(here); }, ms);
      navigator.geolocation.getCurrentPosition(p => { fired = true; clearTimeout(t); here = { lat: p.coords.latitude, lng: p.coords.longitude }; res(here); }, () => { clearTimeout(t); res(here); }, { enableHighAccuracy: true, timeout: ms, maximumAge: 60000 });
    });
  }
  function routeName(pkgs) {
    const ats = [...new Set(pkgs.map(p => p.at).filter(Boolean))];
    return ats.length ? ats.join(" + ") : "Rota " + ddmm(Date.now());
  }
  function newRoute(pkgs, file) {
    R = { id: "r" + Date.now(), name: routeName(pkgs), created: Date.now(), file: file || "", pkgs, order: null, st: {}, notes: {}, loaded: {}, zph: {} };
  }
  // Finaliza a rota: vai para o histórico (com o que foi entregue, o que não foi e as anotações).
  function archive() {
    if (!R || !R.pkgs.length) return;
    derive();
    H.unshift({
      id: R.id, name: routeTitle(), created: R.created, finished: Date.now(),
      stops: stops.map(a => ({ n: a.n, label: a.label, cep: cepOf(a), note: R.notes[a.key] || "", pkgs: a.pkgs.map(p => ({ tn: p.tn, s: p.shopeeStop ?? null, at: p.at || "", c: compl(p), st: R.st[p.tn] || null })) })),
    });
    H = H.slice(0, 80); saveH();
    CAR.pk = {}; CAR.err = []; CAR.cur = 0;
    R = null;
    if (SLOTS && SLOTS.length > 1) { const old = activeSlot; SLOTS = SLOTS.filter(x => x.id !== old); activeSlot = SLOTS[0].id; const sl = SLOTS[0]; R = sl.R || null; CAR.pk = sl.car?.pk || {}; CAR.err = sl.car?.err || []; CAR.cur = sl.car?.cur || 0; fitted = false; }
    store.set("rc3:car", CAR); save(); derive();
  }

  // ---------- folha (detalhe que sobe de baixo) ----------
  let sheetOn = null;
  function openSheet(html, kind) { $("sheet").innerHTML = `<div class="grab"></div>${html}`; $("sheetBg").hidden = false; sheetOn = kind || "x"; }
  function closeSheet() { $("sheetBg").hidden = true; sheetOn = null; sh = null; }
  $("sheetBg").addEventListener("click", e => { if (e.target.id === "sheetBg") closeSheet(); });

  // ---------- planilha ----------
  let pendingFile = null;
  $("file").addEventListener("change", async e => {
    const f = e.target.files[0]; e.target.value = "";
    if (!f) return;
    try {
      const { pkgs } = Core.parseRows(await readXlsxFile(f));
      if (!pkgs.length) throw new Error("A planilha não tem pacotes com coordenadas.");
      if (R && R.pkgs.length) {
        const same = pkgs.filter(p => R.pkgs.some(q => q.tn === p.tn)).length;
        pendingFile = { pkgs, name: f.name };
        return openSheet(`<h2>Planilha nova</h2><p class="muted">${pkgs.length} pacotes${same ? `, ${same} já estão na rota aberta` : ""}. O que fazer?</p>
          <button type="button" class="pri full" data-imp="add">Somar à rota aberta</button>
          <button type="button" class="full" data-imp="new">Começar rota nova (a atual vai para o histórico)</button>
          <button type="button" class="ghost full" data-close="1">Cancelar</button>`);
      }
      await startRoute(pkgs, f.name);
    } catch (err) { toast(err.message || "Não consegui ler a planilha."); }
  });
  async function startRoute(pkgs, file) {
    newRoute(pkgs, file);
    toast("Montando a rota pelas ruas…");
    buildOrder(await getPos());
    save(); render(); go("mapa");
    toast(`${stops.length} paradas · ${pkgs.length} pacotes`);
  }
  async function importChoice(kind) {
    const pf = pendingFile; pendingFile = null; closeSheet();
    if (!pf) return;
    if (kind === "new") { archive(); return startRoute(pf.pkgs, pf.name); }
    const have = new Set(R.pkgs.map(p => p.tn));
    const add = pf.pkgs.filter(p => !have.has(p.tn));
    R.pkgs = R.pkgs.concat(add); if (!R.customName) R.name = routeName(R.pkgs);
    derive(); appendNew(); save(); render();
    toast(add.length ? `${add.length} pacotes novos no fim da rota` : "Nenhum pacote novo");
  }

  // ---------- parada manual ----------
  let geoRes = [];
  function openManual() {
    const city = R?.pkgs?.[0]?.city || "";
    openSheet(`<h2>Adicionar parada</h2>
      <label class="f">Endereço (rua e número)<input type="search" id="mAddr" placeholder="ex.: Rua Santos Dumont, 208" autocomplete="off"></label>
      <label class="f">Cidade<input type="text" id="mCity" value="${esc(city)}" placeholder="ex.: Campinas"></label>
      <div class="row2"><label class="f">Parada Shopee (opcional)<input type="number" id="mStop" inputmode="numeric"></label><label class="f">Código BR (opcional)<input type="text" id="mCode" autocapitalize="characters"></label></div>
      <label class="f">Complemento (opcional)<input type="text" id="mCompl" placeholder="apto, bloco, referência"></label>
      <button type="button" class="pri full" id="mFind">Buscar endereço</button>
      <div id="mRes" class="list"></div>`, "manual");
    $("mFind").addEventListener("click", findManual);
    $("mAddr").addEventListener("keydown", e => { if (e.key === "Enter") findManual(); });
    setTimeout(() => $("mAddr")?.focus(), 50);
  }
  async function findManual() {
    const q = $("mAddr").value.trim(), city = $("mCity").value.trim();
    if (q.length < 4) return toast("Digite a rua e o número.");
    $("mRes").innerHTML = `<p class="muted small">Procurando…</p>`;
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=br&limit=5&addressdetails=1&q=${encodeURIComponent(q + (city ? ", " + city : ""))}`;
      geoRes = await (await fetch(url, { headers: { "Accept-Language": "pt-BR" } })).json();
    } catch { geoRes = []; }
    $("mRes").innerHTML = geoRes.length ? geoRes.map((g, i) => `<button type="button" class="stop" data-geo="${i}"><span class="num sm idle">${i + 1}</span><span><span class="addr">${esc(g.display_name.split(",").slice(0, 3).join(","))}</span><br><span class="muted small">${esc(g.display_name.split(",").slice(3, 6).join(","))}</span></span><span></span></button>`).join("")
      : `<p class="muted small">Não achei. Confira a rua e o número, ou escreva o bairro junto.</p>`;
  }
  function addManual(i) {
    const g = geoRes[i]; if (!g) return;
    const street = $("mAddr").value.trim(), compl = $("mCompl").value.trim(), code = $("mCode").value.trim().toUpperCase(), stop = $("mStop").value;
    const address = street + (compl ? ", " + compl : "");
    const p = { tn: code || "M" + Date.now().toString(36).toUpperCase(), address, bairro: g.address?.suburb || g.address?.neighbourhood || "", city: $("mCity").value.trim(), cep: g.address?.postcode || "", lat: +g.lat, lng: +g.lon, seq: null, shopeeStop: stop ? +stop : null, at: "", manual: true, ...Core.parseAddress(address) };
    if (!R) newRoute([], "manual");
    if (R.pkgs.some(x => x.tn === p.tn)) return toast("Esse código já está na rota.");
    R.pkgs.push(p);
    derive(); if (!R.order) buildOrder(here); else appendNew();
    save(); closeSheet(); render();
    toast("Parada adicionada no fim da rota");
  }

  // ---------- parada: ver, entregar, anotar ----------
  const REASONS = ["Ausente", "Endereço não encontrado", "Recusado", "Avariado", "Sem acesso", "Pacote não achado"];
  let sh = null; // { key, mode: "view" | "issue", sel: { tn: "ok" | "fail" }, reason }
  function openStop(key, mode) {
    const a = byKey.get(key); if (!a) return;
    if (!sh || sh.key !== key || mode) sh = { key, mode: mode || "view", sel: {}, reason: R.notes[key + "#r"] || "" };
    const st = stateOf(a), zt = zonesTxt(a);
    const pk = a.pkgs.map(p => {
      const s = R.st[p.tn];
      const right = sh.mode === "issue"
        ? `<div class="seg" style="grid-auto-columns:auto"><button type="button" class="${(sh.sel[p.tn] || s?.s || "ok") === "ok" ? "on" : ""}" data-psel="${esc(p.tn)}|ok">Entregue</button><button type="button" class="${(sh.sel[p.tn] || s?.s) === "fail" ? "on" : ""}" data-psel="${esc(p.tn)}|fail">Não</button></div>`
        : s ? `<span class="chip ${s.s === "ok" ? "ok" : "bad"}">${s.s === "ok" ? "Entregue " + hhmm(s.t) : esc(s.r || "Não entregue")}${esc(byTxt(s))}</span>` : pkgPlace(p) ? `<span class="chip acc">${esc(pkgPlace(p))}</span>` : `<span class="chip warn">não bipado</span>`;
      const atDot = routeAts().length > 1 ? `<span class="atdot" style="background:${atColorOf(p.at || "Manual")}" title="${esc(atLabel(p.at || "Manual"))}"></span>` : "";
      return `<div class="pkg">${atDot}<div class="sp"><small>Shopee</small><b>${p.shopeeStop ?? "–"}</b></div><div><div class="tn">${tnHtml(p.tn)}</div>${compl(p) ? `<div class="meta">${esc(compl(p))}</div>` : ""}</div>${right}</div>`;
    }).join("");
    const nav = `<div class="row3"><a class="btn sm ${navPref === "gmaps" ? "pri" : ""}" href="${Core.links.gmaps(a)}" target="_blank" rel="noopener">Google</a><a class="btn sm ${navPref === "waze" ? "pri" : ""}" href="${Core.links.waze(a)}" target="_blank" rel="noopener">Waze</a><a class="btn sm ${navPref === "apple" ? "pri" : ""}" href="${Core.links.apple(a)}" target="_blank" rel="noopener">Apple</a></div>`;
    let act;
    if (sh.mode === "issue") {
      act = `<div><p class="small muted" style="margin-bottom:6px">Motivo dos não entregues</p><div class="reasons">${REASONS.map(r => `<button type="button" class="${sh.reason === r ? "on" : ""}" data-reason="${esc(r)}">${r}</button>`).join("")}</div></div>
        <label class="f">Anotação<textarea id="sNote" placeholder="ex.: entreguei 1 de 7, porteiro só aceitou um">${esc(R.notes[key] || "")}</textarea></label>
        <button type="button" class="pri full" data-issuesave="${esc(key)}">Salvar</button>
        <button type="button" class="ghost full" data-stopmode="view">Cancelar</button>`;
    } else if (done(a)) {
      act = `${R.notes[key] ? `<div class="card flat" style="padding:12px"><b class="small">Anotação</b><p>${esc(R.notes[key])}</p></div>` : ""}
        <div class="row2"><button type="button" data-stopmode="issue">Editar</button><button type="button" class="danger" data-undo="${esc(key)}">Desfazer</button></div>`;
    } else {
      act = `<button type="button" class="pri full" data-okall="${esc(key)}">Entreguei ${a.pkgs.length > 1 ? `os ${a.pkgs.length} pacotes` : "o pacote"}</button>
        <button type="button" class="full" data-stopmode="issue">Problema ou entrega parcial</button>`;
    }
    openSheet(`<div class="sheet-h"><span class="num ${st === "idle" ? "" : st}">${a.n}</span><div><div class="addr">${esc(a.label)}</div><div class="muted small">${esc([a.bairro, cepOf(a) && "CEP " + cepOf(a)].filter(Boolean).join(" · "))}</div></div><button type="button" class="x" data-close="1" aria-label="Fechar">${ICON.x}</button></div>
      <div style="display:flex;flex-wrap:wrap;gap:6px"><span class="chip">${a.pkgs.length} pacote${a.pkgs.length > 1 ? "s" : ""}</span>${shopeeTxt(a) ? `<span class="chip">Shopee ${esc(shopeeTxt(a))}</span>` : ""}${zt ? `<span class="chip acc">No carro: ${esc(zt)}</span>` : ""}${routeAts().length > 1 ? [...new Set(a.pkgs.map(p => p.at || "Manual"))].map(at => `<span class="chip"><span class="atdot" style="background:${atColorOf(at)}"></span>…${esc(String(at).slice(-4))}</span>`).join("") : ""}</div>
      ${R.shared && window.RCApp?.user && !done(a) ? (() => { const c = claimOf(a), mine = c && c.uid === me(); return `<button type="button" class="sm ${mine ? "pri" : ""}" data-sync="claim" data-key="${esc(key)}">${!c ? "Pego esta parada" : mine ? "✓ Você pegou esta · soltar" : `${esc(c.name)} pegou esta · pegar para mim`}</button>`; })() : ""}
      ${nav}<div class="pkgs">${pk}</div>${act}`, "stop");
  }
  function markAll(key, s, reason) {
    const a = byKey.get(key); if (!a) return;
    a.pkgs.forEach(p => { if (!R.st[p.tn]) R.st[p.tn] = { s, t: Date.now(), r: reason || "" }; });
    save();
  }
  function saveIssue(key) {
    const a = byKey.get(key); if (!a) return;
    const note = $("sNote")?.value.trim() || "";
    a.pkgs.forEach(p => {
      const s = sh.sel[p.tn] || R.st[p.tn]?.s || "ok";
      R.st[p.tn] = { s, t: R.st[p.tn]?.t || Date.now(), r: s === "fail" ? sh.reason || "Não entregue" : "" };
    });
    if (note) R.notes[key] = note; else delete R.notes[key];
    if (sh.reason) R.notes[key + "#r"] = sh.reason;
    if (a.pkgs.some(p => R.st[p.tn].s === "fail") && !sh.reason && !note) toast("Dica: marque o motivo para lembrar na hora de baixar na Shopee.");
    save(); closeSheet(); render();
  }

  // Texto para conferir com o app da Shopee em casa.
  function pendText(stopsList, name) {
    const lines = [];
    let ok = 0, all = 0;
    stopsList.forEach(a => a.pkgs.forEach(p => { all++; const s = p.st || R?.st?.[p.tn]; if (s?.s === "ok") ok++; }));
    lines.push(`${name || "Rota"} – ${ok} de ${all} entregues`);
    const bad = [];
    stopsList.forEach(a => {
      const fails = a.pkgs.filter(p => (p.st || R?.st?.[p.tn])?.s === "fail");
      const left = a.pkgs.filter(p => !(p.st || R?.st?.[p.tn]));
      const note = a.note ?? R?.notes?.[a.key];
      if (!fails.length && !left.length && !note) return;
      bad.push(`\nParada ${a.n} · ${a.label}${note ? `\n  Anotação: ${note}` : ""}`);
      fails.forEach(p => bad.push(`  ✕ Shopee ${p.s ?? p.shopeeStop ?? "s/n"} · ${p.tn} · ${(p.st || R.st[p.tn]).r || "não entregue"}`));
      left.forEach(p => bad.push(`  ? Shopee ${p.s ?? p.shopeeStop ?? "s/n"} · ${p.tn} · sem registro`));
    });
    return lines.concat(bad.length ? ["\nPENDÊNCIAS:"].concat(bad) : ["\nSem pendências."]).join("\n");
  }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); toast("Copiado"); }
    catch { openSheet(`<h2>Copie o texto</h2><textarea style="min-height:50vh">${esc(text)}</textarea><button type="button" class="full" data-close="1">Fechar</button>`); }
  }

  // ---------- carro: onde cada pacote está ----------
  // No galpão você bipa cada pacote e o app sugere a parte do carro. Essa é a posição oficial do pacote: ela fica
  // guardada pelo código (mesmo sem planilha) e vale até a entrega. Quando a planilha da rota entra, o app só junta
  // o endereço e a ordem; a posição no carro não muda.
  // Antes de carregar, dois toques: o carro e como ele está hoje (banco traseiro levantado ou rebatido; com ou sem
  // o banco do passageiro). As partes ficam: Banco do passageiro (opcional), Meio Direita, Meio Esquerda (banco
  // traseiro), Fundo Direita, Fundo Esquerda (porta-malas). A ordem da lista é a ordem da entrega: as primeiras
  // entregas vão no banco do passageiro / meio, as últimas no fundo. Volumoso vai no fundo, embaixo.
  const CAR_TYPES = [{ id: "suv", name: "SUV ou Hatch", hint: "porta-malas junto do banco traseiro" }, { id: "sedan", name: "Sedan", hint: "porta-malas separado" }, { id: "util", name: "Utilitário", hint: "Fiorino, Kangoo, Partner…" }];
  const LAYOUTS = [
    { id: "up", seat: "up", pass: false, name: "Banco traseiro levantado" },
    { id: "up+p", seat: "up", pass: true, name: "Banco levantado + banco do passageiro" },
    { id: "down", seat: "down", pass: false, name: "Banco traseiro rebatido" },
    { id: "down+p", seat: "down", pass: true, name: "Banco rebatido + banco do passageiro" },
  ];
  const ZP = "Banco do passageiro", ZMD = "Meio Direita", ZME = "Meio Esquerda", ZFD = "Fundo Direita", ZFE = "Fundo Esquerda";
  const zonesFor = lay => (lay.pass ? [ZP] : []).concat([ZMD, ZME, ZFD, ZFE]);
  let CAR = store.get("rc3:car", null) || { pk: {}, zph: {}, cur: 0 };
  if (!CAR.zones) CAR.zones = [ZMD, ZME, ZFD, ZFE];
  const saveCar = () => { store.set("rc3:car", CAR); persistSlots(); try { window.RCApp?.onSaveCar?.(); } catch {} };
  // ---------- rotas em andamento ----------
  // Cada rota em andamento guarda a própria rota (planilha, entregas, anotações) e o próprio carregamento do carro.
  // Dá para pausar uma, começar outra ("+ Adicionar nova rota") e voltar quando quiser. O carro (tipo e disposição)
  // é o mesmo para todas.
  function persistSlots() {
    if (!SLOTS) return;
    const sl = SLOTS.find(x => x.id === activeSlot); if (!sl) return;
    sl.R = R; sl.car = { pk: CAR.pk || {}, err: CAR.err || [], cur: CAR.cur || 0 };
    store.set("rc3:slots", SLOTS); store.set("rc3:active", activeSlot);
  }
  function initSlots() {
    SLOTS = store.get("rc3:slots", null); activeSlot = store.get("rc3:active", null);
    if (!SLOTS || !SLOTS.length) { SLOTS = [{ id: "s" + Date.now(), created: Date.now(), R, car: { pk: CAR.pk || {}, err: CAR.err || [], cur: CAR.cur || 0 } }]; activeSlot = SLOTS[0].id; }
    if (!SLOTS.some(x => x.id === activeSlot)) activeSlot = SLOTS[0].id;
    const sl = SLOTS.find(x => x.id === activeSlot);
    R = sl.R || null; CAR.pk = sl.car?.pk || {}; CAR.err = sl.car?.err || []; CAR.cur = sl.car?.cur || 0;
    persistSlots();
  }
  // Nome da rota: o que você der (dá para renomear antes da planilha) e, quando a planilha entra, a AT ao lado.
  const slotName = sl => {
    const at = sl.R?.name || "";
    if (sl.name) return at && at !== sl.name ? `${sl.name} · ${at}` : sl.name;
    return at || (Object.keys(sl.car?.pk || {}).length || (sl.car?.err || []).length ? `Carregamento sem planilha` : "Nova rota");
  };
  const curSlot = () => (SLOTS || []).find(x => x.id === activeSlot) || null;
  const routeTitle = () => (curSlot() ? slotName(curSlot()) : R?.name || "Rota Certa");
  function openRename() {
    const sl = curSlot();
    openSheet(`<h2>Nome da rota</h2><p class="muted small">Dê um nome para não se perder (ex.: "Rota da manhã", "Cambuí"). Quando você subir a planilha, a AT aparece ao lado do nome.</p>
      <input type="text" id="rName" maxlength="40" value="${esc(sl?.name || "")}" placeholder="${esc(R?.name || "Nome da rota")}">
      <button type="button" class="pri full" data-renamesave="1">Salvar</button>`, "rename");
    setTimeout(() => $("rName")?.focus(), 50);
  }
  const slotInfo = sl => {
    const pk = sl.R?.pkgs || [], ok = pk.filter(p => sl.R.st?.[p.tn]?.s === "ok").length, car = Object.keys(sl.car?.pk || {}).length + (sl.car?.err || []).length;
    return [pk.length ? `${ok}/${pk.length} entregues` : "", car ? `${car} no carro` : "", !pk.length && !car ? "vazia" : ""].filter(Boolean).join(" · ");
  };
  function switchSlot(id) {
    if (id === activeSlot) return;
    persistSlots();
    const sl = SLOTS.find(x => x.id === id); if (!sl) return;
    activeSlot = id; R = sl.R || null; CAR.pk = sl.car?.pk || {}; CAR.err = sl.car?.err || []; CAR.cur = sl.car?.cur || 0;
    store.set("rc3:route", R); store.set("rc3:car", CAR); persistSlots();
    fitted = false; if (R) R.geom = R.geom || null;
    derive(); render(); try { window.RCApp?.onSwitch?.(); } catch {}
    toast("Rota aberta: " + slotName(sl));
  }
  function newSlot() {
    persistSlots();
    const sl = { id: "s" + Date.now(), created: Date.now(), R: null, car: { pk: {}, err: [], cur: 0 } };
    SLOTS.push(sl); switchSlot(sl.id);
    go("inicio"); toast("Nova rota criada. A outra ficou guardada com o carregamento.");
  }
  function slotsCard(extra) {
    if (!SLOTS) return "";
    return `<div class="card"><div style="display:flex;justify-content:space-between;align-items:center"><h3>Rotas em andamento (${SLOTS.length})</h3><button type="button" class="pri sm" data-slotnew="1">+ Nova rota</button></div>
      <div class="list">${SLOTS.map(sl => `<button type="button" class="stop${sl.id === activeSlot ? " isnext" : ""}" data-slot="${esc(sl.id)}"><span class="num sm ${sl.id === activeSlot ? "" : "idle"}">${SLOTS.indexOf(sl) + 1}</span><span><span class="addr">${esc(slotName(sl))}</span><br><span class="muted small">${sl.id === activeSlot ? "aberta agora · " : ""}${esc(slotInfo(sl))}</span></span>${sl.id === activeSlot ? `<span class="chip acc">aberta</span>` : ICON.chev}</button>`).join("")}</div>${extra || ""}</div>`;
  }
  const layOf = () => LAYOUTS.find(l => l.id === CAR.lay) || null;
  // Troca a disposição sem perder onde os pacotes já estão (pelo nome da parte).
  function setLayout(id) {
    const lay = LAYOUTS.find(l => l.id === id); if (!lay) return;
    const old = CAR.zones, nz = zonesFor(lay);
    Object.values(CAR.pk).forEach(x => { const i = nz.indexOf(old[x.z]); x.z = i >= 0 ? i : nz.indexOf(ZMD); });
    CAR.lay = id; CAR.zones = nz; CAR.cur = 0; saveCar();
  }
  const normTn = t => String(t || "").toUpperCase().replace(/\s+/g, "");
  // Código lido na etiqueta: o "BR…" quando houver; senão o texto inteiro.
  const codeOf = text => { const T = normTn(text); return (T.match(/BR[0-9A-Z]{10,16}/) || [T])[0]; };
  function carKey(tn) {
    const T = normTn(tn);
    if (CAR.pk[T]) return T;
    return Object.keys(CAR.pk).find(k => k.includes(T) || T.includes(k)) || null;
  }
  const carOf = p => { const k = carKey(p.tn); return k ? CAR.pk[k] : null; };
  const zoneOfPkg = p => carOf(p)?.z ?? null;
  const zName = i => CAR.zones[i] ?? "?";
  const zHint = i => {
    const n = zName(i), lay = layOf();
    if (n === ZP) return "no banco do passageiro";
    if (n.startsWith("Meio")) return lay?.seat === "down" ? "banco traseiro rebatido" : CAR.car === "util" ? "meio do baú" : "no banco traseiro";
    return CAR.car === "util" ? "fundo do baú" : "no porta-malas";
  };
  const pkgPlace = p => {
    const c = carOf(p);
    if (c) return zName(c.z) + (c.v ? " · volumoso" : "");
    const rc = window.RCApp?.remote?.car?.[normTn(p.tn)];
    return rc && rc.uid !== me() ? `carro de ${rc.name}: ${rc.z}${rc.v ? " · volumoso" : ""}` : null;
  };
  const zChip = i => `<span class="chip acc">${esc(zName(i))}</span>`;
  // Partes do carro dos pacotes que ainda faltam entregar nesta parada.
  function zonesOf(a) {
    const l = a.pkgs.filter(p => !resolved(p)), src = l.length ? l : a.pkgs;
    return [...new Set(src.map(pkgPlace).filter(Boolean))];
  }
  const zonesTxt = a => zonesOf(a).join(", ");
  const zCount = i => Object.values(CAR.pk).filter(x => x.z === i).length;
  const fundoIdx = () => [CAR.zones.indexOf(ZFD), CAR.zones.indexOf(ZFE)].filter(i => i >= 0);
  // Posição do pacote na ordem de entrega (0 = primeira entrega, 1 = última); null sem rota.
  function rankOf(code) {
    if (!R || !stops.length) return null;
    const p = R.pkgs.find(x => normTn(x.tn) === code || code.includes(normTn(x.tn)));
    const a = p && byTn.get(p.tn);
    if (!a) return null;
    const total = stops.reduce((t, s) => t + s.pkgs.length, 0);
    let acc = 0; for (const s of stops) { if (s === a) break; acc += s.pkgs.length; }
    return (acc + a.pkgs.length / 2) / Math.max(1, total);
  }
  // Sugestão: com a rota, pela ordem de entrega (primeiras entregas no começo da lista: passageiro e meio).
  // Sem rota, continua na parte atual até ela encher e passa para a próxima. Volumoso: fundo, embaixo.
  function suggestZone(code, vol) {
    const n = CAR.zones.length, r = rankOf(code);
    if (r != null) return Math.min(n - 1, Math.floor(r * n));
    const cap = R ? Math.ceil(R.pkgs.length / n) : CAR.cap || 20;
    for (let k = 0; k < n; k++) { const i = (CAR.cur + k) % n; if (zCount(i) < cap) return i; }
    return CAR.cur % n;
  }
  function putInCar(code, z, vol) {
    CAR.pk[code] = { z, t: Date.now(), v: !!vol };
    if (!vol) CAR.cur = z;
    saveCar();
  }
  // Desenho do carro visto de cima (frente para cima). Tocar numa parte escolhe/abre aquela parte.
  function carSvg(hl, opts = {}) {
    const lay = opts.lay || layOf() || { pass: true, seat: "up" };
    const zs = opts.zones || zonesFor(lay);
    const box = (name, x, y, w, h, short) => {
      const i = zs.indexOf(name), on = i >= 0, sel = on && i === hl;
      const cnt = on && opts.counts ? zCount(CAR.zones.indexOf(name)) : null;
      return `<g ${on && opts.pick ? `data-zpick="${CAR.zones.indexOf(name)}"` : ""} class="cz${on ? "" : " off"}${sel ? " sel" : ""}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10"/><text x="${x + w / 2}" y="${y + h / 2 - (cnt != null ? 4 : -4)}">${short}</text>${cnt != null ? `<text class="n" x="${x + w / 2}" y="${y + h / 2 + 14}">${cnt}</text>` : ""}</g>`;
    };
    return `<svg class="carsvg${opts.small ? " sm" : ""}" viewBox="0 0 200 300" role="img" aria-label="Carro visto de cima">
      <rect class="body" x="8" y="6" width="184" height="288" rx="46"/>
      <path class="glass" d="M40 34 Q100 18 160 34" />
      <g class="cz off"><rect x="30" y="44" width="64" height="58" rx="10"/><text x="62" y="77">Motorista</text></g>
      ${box(ZP, 106, 44, 64, 58, "Passageiro")}
      ${box(ZME, 30, 116, 66, 74, "Meio E")}${box(ZMD, 104, 116, 66, 74, "Meio D")}
      ${box(ZFE, 30, 202, 66, 80, "Fundo E")}${box(ZFD, 104, 202, 66, 80, "Fundo D")}
    </svg>`;
  }
  // Foto de uma parte do carro (opcional): uma por parte, não por pacote.
  const idb = (() => {
    let dbp;
    const open = () => dbp || (dbp = new Promise((res, rej) => { const r = indexedDB.open("rc3", 1); r.onupgradeneeded = () => r.result.createObjectStore("ph"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
    return {
      async put(k, v) { const db = await open(); return new Promise((res, rej) => { const tx = db.transaction("ph", "readwrite"); tx.objectStore("ph").put(v, k); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); },
      async get(k) { try { const db = await open(); return await new Promise(res => { const q = db.transaction("ph").objectStore("ph").get(k); q.onsuccess = () => res(q.result); q.onerror = () => res(null); }); } catch { return null; } },
    };
  })();
  let zoneCamFor = null;
  $("zoneCam").addEventListener("change", async e => {
    const f = e.target.files[0]; e.target.value = "";
    if (!f || zoneCamFor == null) return;
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(f); });
      const sc = Math.min(1, 1000 / Math.max(img.naturalWidth, img.naturalHeight));
      const cv = document.createElement("canvas"); cv.width = Math.round(img.naturalWidth * sc); cv.height = Math.round(img.naturalHeight * sc);
      cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
      const blob = await new Promise(r => cv.toBlob(r, "image/jpeg", 0.72));
      const id = "car:" + zoneCamFor + ":" + Date.now();
      await idb.put(id, blob);
      CAR.zph = CAR.zph || {}; CAR.zph[zoneCamFor] = id; saveCar(); openZone(zoneCamFor); toast("Foto guardada");
    } catch { toast("Não consegui guardar a foto."); }
  });
  // Pacotes de uma parte do carro.
  async function openZone(i) {
    const items = Object.entries(CAR.pk).filter(([, v]) => v.z === i).map(([k]) => {
      const p = R?.pkgs.find(x => normTn(x.tn) === k || k.includes(normTn(x.tn)));
      return { k, p, a: p && byTn.get(p.tn) };
    }).sort((x, y) => (x.a?.n ?? 1e9) - (y.a?.n ?? 1e9));
    openSheet(`<div class="sheet-h"><span class="num sm idle">${i + 1}</span><div><div class="addr">${esc(zName(i))}</div><div class="muted small">${items.length} pacote${items.length === 1 ? "" : "s"}</div></div><button type="button" class="x" data-close="1">${ICON.x}</button></div>
      <div id="zImg"></div>
      <button type="button" class="sm" data-zcam="${i}">${CAR.zph?.[i] ? "Trocar a foto desta parte" : "Tirar foto desta parte (opcional)"}</button>
      <div class="list">${items.map(({ k, p, a }) => `<div class="pkg"><div class="sp"><small>${a ? "Parada" : "Shopee"}</small><b>${a ? a.n : p?.shopeeStop ?? "–"}</b></div><div><div class="tn">${tnHtml(k)}</div><div class="meta">${a ? esc(a.label) + (p.shopeeStop != null ? " · Shopee " + p.shopeeStop : "") : "Ainda sem rota"}</div></div><div class="ck-act">${CAR.pk[k].v ? `<span class="chip warn">volumoso</span>` : ""}${p && resolved(p) ? `<span class="chip ok">entregue</span>` : ""}<button type="button" class="sm" data-ckedit="${esc(k)}">Editar</button><button type="button" class="sm danger" data-ckdel="${esc(k)}">Apagar</button></div></div>`).join("") || `<p class="muted">Nenhum pacote nesta parte.</p>`}</div>`, "zone");
    if (CAR.zph?.[i]) { const b = await idb.get(CAR.zph[i]); if (b && $("zImg")) $("zImg").innerHTML = `<img src="${URL.createObjectURL(b)}" style="width:100%;border-radius:12px" alt="Foto: ${esc(zName(i))}">`; }
  }



  // ---------- telas ----------
  const TABS = ["inicio", "mapa", "paradas", "carregar", "historico", "comunidade"];
  let tab = "inicio";
  function go(t) { if (location.hash !== "#" + t) location.hash = "#" + t; else route(); }
  function route() {
    tab = location.hash.slice(1);
    if (!TABS.includes(tab)) tab = "inicio";
    if (!R && (tab === "paradas" || (tab === "mapa" && !(SLOTS || []).some(x => x.R?.pkgs?.length)))) tab = "inicio";
    TABS.forEach(t => ($("v-" + t).hidden = t !== tab));
    document.querySelectorAll("nav.tabs a").forEach(a => (a.dataset.tab === tab ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
    $("top").hidden = tab === "mapa";
    render();
    if (tab === "mapa") { ensureMap(); setTimeout(() => map?.invalidateSize(), 60); }
    window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", route);

  function counts() {
    const pk = R ? R.pkgs.length : 0, ok = R ? R.pkgs.filter(p => pst(p) === "ok").length : 0, fail = R ? R.pkgs.filter(p => pst(p) === "fail").length : 0;
    return { pk, ok, fail, left: pk - ok - fail, sDone: stops.filter(done).length, sAll: stops.length, issues: stops.filter(a => a.pkgs.some(p => pst(p) === "fail") || R.notes[a.key]).length, loaded: R ? R.pkgs.filter(p => zoneOfPkg(p) != null && !resolved(p)).length : 0, toLoad: R ? R.pkgs.filter(p => !resolved(p)).length : 0 };
  }
  // Botão da conta, sempre no topo: "Entrar" ou a inicial do nome.
  function acctBtn() {
    const b = $("tAction"), u = window.RCApp?.user;
    b.hidden = false;
    b.className = u ? "sm acct" : "sm pri";
    b.textContent = u ? (u.name || "?")[0].toUpperCase() : "Entrar";
    b.setAttribute("aria-label", u ? "Minha conta" : "Entrar");
    const nt = window.RCSync?.notifCount || 0;
    $("tBell").hidden = !u; $("tBellN").textContent = nt || ""; $("tBellN").hidden = !nt;
  }
  $("tBell").addEventListener("click", () => window.RCSync?.openNotif());
  $("tAction").addEventListener("click", () => {
    const u = window.RCApp?.user;
    if (!window.RCSync) return toast("Conectando… tente de novo em alguns segundos.");
    if (!u) return window.RCSync.openLogin();
    openSheet(`<div class="sheet-h"><span class="num">${esc((u.name || "?")[0].toUpperCase())}</span><div><div class="addr">${esc(u.name)}</div><div class="muted small">${esc(u.email)}</div></div><button type="button" class="x" data-close="1">${ICON.x}</button></div>
      ${R ? `<button type="button" class="pri full" data-sync="share">Chamar alguém para esta rota</button>` : ""}
      <button type="button" class="full" data-go="comunidade">Dicas da comunidade</button>
      <button type="button" class="full" data-sync="openTeam">Amigos e equipe</button>
      <button type="button" class="full" data-sync="openProfile">Meu perfil</button>
      <button type="button" class="full" data-sync="teamRoutes">Rotas compartilhadas comigo</button>
      <button type="button" class="ghost full danger" data-sync="logout">Sair da conta</button>`, "acct");
  });
  function renderTop() {
    acctBtn();
    if (!R) { $("tTitle").textContent = curSlot()?.name || "Rota Certa"; $("tSub").textContent = "Rotas pelo endereço"; $("tProg").hidden = true; return; }
    const c = counts();
    $("tTitle").textContent = routeTitle();
    const pr = window.RCApp?.remote?.presence || {}, on = R.shared ? Object.values(pr).filter(x => Date.now() - x.t < 150000).length : 0;
    $("tSub").textContent = `${c.sDone}/${c.sAll} paradas · ${c.ok}/${c.pk} pacotes${on > 1 ? ` · ${on} online` : ""}`;
    $("tProg").hidden = false; $("tBar").style.width = (c.pk ? (c.ok + c.fail) / c.pk * 100 : 0).toFixed(1) + "%";
  }
  function render() {
    derive(); renderTop();
    if (tab === "inicio") renderHome();
    if (tab === "paradas") renderParadas();
    if (tab === "carregar") renderCarregar();
    if (tab === "historico") renderHist();
    if (tab === "comunidade" && !$("cmList")) window.RCSync?.community($("v-comunidade"));
    if (tab === "mapa") renderMap();
    if (sheetOn === "stop" && sh) openStop(sh.key);
  }

  const ICON_TEAM = `<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6 6 0 0 1 3.5 5.5"/></svg>`;
  function teamAct() {
    const u = window.RCApp?.user;
    if (!u) return act(ICON_TEAM, "Rota em equipe", "Entre para convidar alguém e ver tudo ao vivo", `data-sync="openLogin"`);
    const t = window.RCApp?.remote?.team, n = window.RCSync?.teamCount || 0, nt = window.RCSync?.notifCount || 0;
    const call = R ? act(ICON_TEAM, "Chamar alguém para esta rota", R.shared && t && (t.members || []).length > 1 ? "Nesta rota: " + (t.members || []).map(id => t.names?.[id] || "?").join(", ") : "Só você nesta rota", `data-sync="share"`) : "";
    return (nt ? `<button type="button" class="pri full" data-sync="openNotif">🔔 ${nt} convite${nt > 1 ? "s" : ""} para você</button>` : "")
      + call + act(ICON_TEAM, "Dicas da comunidade", "Dicas de condomínios, endereços e rotas", `data-go="comunidade"`)
      + act(ICON_TEAM, "Amigos e equipe", n ? `${n} pessoa${n > 1 ? "s" : ""} · convidar mais` : "Convide quem entrega com você", `data-sync="openTeam"`)
      + act(ICON_TEAM, "Rotas compartilhadas comigo", "Rotas em que você foi chamada", `data-sync="teamRoutes"`);
  }
  function accountLine() {
    const u = window.RCApp?.user;
    return u ? `<p class="muted small" style="text-align:center">Conectada como <b>${esc(u.name)}</b> (${esc(u.email)}) · <button type="button" class="ghost sm" data-sync="logout" style="min-height:0;padding:0 4px">Sair</button></p>` : "";
  }
  function act(icon, title, sub, attrs) { return `<button type="button" class="act" ${attrs}><span class="ic">${icon}</span><span><b>${title}</b><span class="muted">${sub}</span></span>${ICON.chev}</button>`; }
  function renderHome() {
    const v = $("v-inicio");
    if (!R) {
      const showSlots = SLOTS && (SLOTS.length > 1 || Object.keys(CAR.pk || {}).length || (CAR.err || []).length);
      v.innerHTML = `${showSlots ? slotsCard() : ""}<div class="hello">${curSlot()?.name || (SLOTS && SLOTS.length > 1) ? `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><h1 style="font-size:1.4rem">${esc(slotName(curSlot()))}</h1><button type="button" class="ghost sm" data-rename="1">Renomear</button></div>` : `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><h1>Olá! 👋</h1><button type="button" class="ghost sm" data-rename="1">Dar nome à rota</button></div>`}<p class="muted">O que você quer fazer${SLOTS && SLOTS.length > 1 ? " nesta rota" : ""}?</p></div>
        <div class="actions">
          ${act(ICON.file, "Importar planilha da Shopee", "Excel (.xlsx) exportado do app", `data-pick="file"`)}
          ${act(ICON.box, "Carregar o veículo", Object.keys(CAR.pk).length ? `${Object.keys(CAR.pk).length} pacotes no carro` : "Bipe no galpão: o app diz onde colocar", `data-go="carregar"`)}
          ${act(ICON.pin, "Adicionar parada manual", "Digite o endereço", `data-manual="1"`)}
          ${act(ICON.clock, "Histórico de rotas", `${H.length} rota${H.length === 1 ? "" : "s"} finalizada${H.length === 1 ? "" : "s"}`, `data-go="historico"`)}
          ${teamAct()}
        </div>${accountLine()}`;
      return;
    }
    const c = counts(), nx = nextStop();
    v.innerHTML = `${SLOTS && SLOTS.length > 1 ? slotsCard() : ""}<div class="card">
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px"><h2 style="word-break:break-word">${esc(routeTitle())}</h2><button type="button" class="ghost sm" data-rename="1">Renomear</button></div><span class="muted small" style="margin-top:-8px">${ddmm(R.created)}</span>
        <div class="bar"><i style="width:${(c.pk ? (c.ok + c.fail) / c.pk * 100 : 0).toFixed(1)}%"></i></div>
        <div class="stats"><div class="stat"><b>${c.sDone}/${c.sAll}</b><span>paradas</span></div><div class="stat"><b>${c.ok}/${c.pk}</b><span>entregues</span></div><div class="stat"><b>${c.fail}</b><span>não entregues</span></div></div>
        ${nx ? `<button type="button" class="pri full" data-go="mapa">Continuar · parada ${nx.n}</button>` : `<p class="muted">Todas as paradas resolvidas. Finalize a rota quando terminar.</p>`}
      </div>
      <div class="actions">
        ${act(ICON.box, "Carregar o veículo", c.loaded ? `${c.loaded} de ${c.toLoad} já têm lugar no carro` : "Bipe cada pacote: o app diz onde colocar", `data-go="carregar"`)}
        ${act(ICON.note, "Anotações e pendências", c.issues ? `${c.issues} parada${c.issues > 1 ? "s" : ""} com anotação` : "Para conferir com a Shopee depois", `data-go="paradas" data-filter="notas"`)}
        ${act(ICON.file, "Somar outra planilha", "Pacotes novos entram no fim da rota", `data-pick="file"`)}
        ${act(ICON.pin, "Adicionar parada manual", "Digite o endereço", `data-manual="1"`)}
        ${act(ICON.clock, "Histórico de rotas", `${H.length} finalizada${H.length === 1 ? "" : "s"}`, `data-go="historico"`)}
        ${teamAct()}
      </div>${accountLine()}
      ${SLOTS && SLOTS.length === 1 ? `<button type="button" class="full" data-slotnew="1">+ Adicionar nova rota (pausar esta)</button>` : ""}
      <button type="button" class="ghost full danger" data-finish="1">Finalizar rota e guardar no histórico</button>`;
  }

  let listFilter = "pend", listQ = "";
  function renderParadas() {
    const v = $("v-paradas");
    const c = counts(), nx = nextStop();
    const nrm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
    const q = nrm(listQ.trim());
    let rows = listFilter === "pend" ? stops.filter(a => !done(a)) : listFilter === "feitas" ? stops.filter(done) : stops.filter(a => a.pkgs.some(p => pst(p) === "fail") || R.notes[a.key]);
    if (q) rows = stops.filter(a => (/^\d{1,3}$/.test(q) ? a.shopeeStops.includes(+q) || a.n === +q : nrm(a.label).includes(q) || a.pkgs.some(p => p.tn.toUpperCase().includes(q))));
    v.innerHTML = `<div class="seg"><button type="button" class="${listFilter === "pend" ? "on" : ""}" data-filter="pend">Pendentes ${stops.filter(a => !done(a)).length}</button><button type="button" class="${listFilter === "feitas" ? "on" : ""}" data-filter="feitas">Feitas ${c.sDone}</button><button type="button" class="${listFilter === "notas" ? "on" : ""}" data-filter="notas">Anotações ${c.issues}</button></div>
      <input type="search" id="lq" value="${esc(listQ)}" placeholder="Buscar: parada, rua ou final do BR" autocomplete="off">
      ${listFilter === "notas" && !q ? `<button type="button" class="full" data-copy="pend">Copiar pendências para conferir na Shopee</button>` : ""}
      <div class="list">${rows.map(a => {
        const st = stateOf(a), fails = a.pkgs.filter(p => pst(p) === "fail").length, oks = a.pkgs.filter(p => pst(p) === "ok").length;
        return `<button type="button" class="stop${a === nx ? " isnext" : ""}" data-stop="${esc(a.key)}"><span class="num ${st === "idle" ? (a === nx ? "" : "idle") : st}">${a.n}</span>
          <span><span class="addr">${esc(a.label)}</span><br><span class="muted small">${a.pkgs.length} pacote${a.pkgs.length > 1 ? "s" : ""}${shopeeTxt(a) ? " · Shopee " + esc(shopeeTxt(a)) : ""}${zonesTxt(a) ? " · " + esc(zonesTxt(a)) : ""}${claimOf(a) ? ` · <b>${claimOf(a).uid === me() ? "sua" : "com " + esc(claimOf(a).name)}</b>` : ""}</span>
          ${R.notes[a.key] ? `<br><span class="small">📝 ${esc(R.notes[a.key])}</span>` : ""}</span>
          <span class="r">${st === "ok" ? `<span class="chip ok">${ICON.check}</span>` : fails ? `<span class="chip bad">${oks}/${a.pkgs.length}</span>` : ""}</span></button>`;
      }).join("") || `<div class="empty">${listFilter === "notas" ? "Nenhuma anotação ainda.<br>Use “Problema ou entrega parcial” na parada." : listFilter === "feitas" ? "Nenhuma parada feita ainda." : "Tudo feito ✓"}</div>`}</div>
      ${listFilter === "pend" && !q ? `<button type="button" class="ghost full" data-reopt="1">Refazer a ordem a partir de onde estou</button>` : ""}`;
    const lq = $("lq");
    lq.addEventListener("input", () => { listQ = lq.value; const pos = lq.selectionStart; renderParadas(); const n = $("lq"); n.focus(); try { n.setSelectionRange(pos, pos); } catch {} });
  }

  // Pacotes com erro (o QR não leu): ficam contados no banco da frente. Depois de carregar, a pessoa confere um a um:
  // digita o final do código ou escolhe na lista do que falta bipar, e escolhe a parte do carro.
  let errCur = { code: "", v: false, unknown: false };
  function openErr(hits) {
    const n = (CAR.err || []).length;
    const missing = R ? R.pkgs.filter(p => !resolved(p) && zoneOfPkg(p) == null) : [];
    const list = hits || missing;
    openSheet(`<div class="sheet-h"><span class="num part">${n}</span><div><div class="addr">Pacotes com erro</div><div class="muted small">No banco da frente, esperando conferir</div></div><button type="button" class="x" data-close="1">${ICON.x}</button></div>
      ${n ? `<p class="muted small">Pegue um desses pacotes, digite o final do código da etiqueta ou toque nele na lista abaixo.</p>
      <div style="display:grid;grid-template-columns:1fr auto;gap:8px"><input type="search" id="errQ" placeholder="Final do código (ex.: 1640T)" autocapitalize="characters" autocomplete="off"><button type="button" class="pri" data-errfind="1">Buscar</button></div>
      ${R ? `<h3>${hits ? "Achei estes" : `Da rota, ainda sem lugar no carro (${missing.length})`}</h3><div class="list">${list.slice(0, 60).map(p => { const a = byTn.get(p.tn); return `<button type="button" class="stop" data-errpick="${esc(normTn(p.tn))}"><span class="num sm idle">${a?.n ?? "?"}</span><span><span class="addr">Shopee ${p.shopeeStop ?? "s/n"} · ${tnHtml(p.tn)}</span><br><span class="muted small">${esc(a?.label || "")}</span></span><span></span></button>`; }).join("") || `<p class="muted small">Nenhum.</p>`}</div>` : `<p class="muted small">Sem planilha ainda: digite o código completo.</p>`}
      <button type="button" class="ghost full sm" data-errdrop="1">Não era pacote: tirar 1 da contagem</button>` : `<p class="muted">Nenhum pacote com erro. ✓</p>`}`, "err");
    setTimeout(() => $("errQ")?.addEventListener("keydown", e => { if (e.key === "Enter") document.querySelector("[data-errfind]")?.click(); }), 0);
  }
  function openErrZone(code, unknown) {
    if (errCur.code !== code) errCur = { code, v: false, unknown: !!unknown };
    const p = R?.pkgs.find(x => normTn(x.tn) === code), a = p && byTn.get(p.tn);
    const sug = suggestZone(code);
    openSheet(`<h2>Onde vai este pacote?</h2>
      ${a ? `<div style="display:flex;align-items:center;gap:10px"><span class="num sm">${a.n}</span><span><b>${esc(a.label)}</b><br><span class="muted small">Shopee ${p.shopeeStop ?? "s/n"} · ${tnHtml(p.tn)}</span></span></div>` : `<p class="muted small">${tnHtml(code)}${unknown ? " · não achei na rota (guardo assim mesmo)" : ""}</p>`}
      <p class="muted small">Sugestão: <b>${esc(zName(sug))}</b>. Toque na parte onde você colocou.</p>
      <div style="display:grid;justify-items:center">${carSvg(sug, { pick: true }).replace(/data-zpick=/g, "data-errsave=")}</div>
      <button type="button" class="full ${errCur.v ? "pri" : ""}" data-errvol="1">${errCur.v ? "✓ Volumoso" : "Marcar como volumoso"}</button>
      <button type="button" class="ghost full" data-errfix="1">Voltar</button>`, "errz");
  }
  function renderCarregar() {
    const v = $("v-carregar");
    // Passo 1 e 2: o carro e como ele está hoje (dois toques).
    if (!CAR.car || !CAR.lay) {
      if (!CAR.car) {
        v.innerHTML = `<div class="hello"><h1>Seu carro</h1><p class="muted">Antes de carregar: qual é o tipo do carro?</p></div>
          <div class="actions">${CAR_TYPES.map(c => `<button type="button" class="act" data-cartype="${c.id}"><span class="ic">${ICON.box}</span><span><b>${c.name}</b><span class="muted">${c.hint}</span></span>${ICON.chev}</button>`).join("")}</div>`;
        return;
      }
      const opts = CAR.car === "util" ? LAYOUTS.filter(l => l.seat === "up") : LAYOUTS;
      v.innerHTML = `<div class="hello"><h1>Como está o carro hoje?</h1><p class="muted">${esc(CAR_TYPES.find(c => c.id === CAR.car)?.name || "")} · <button type="button" class="ghost sm" data-cartype="">trocar</button></p></div>
        <div class="laygrid">${opts.map(l => `<button type="button" class="layopt" data-lay="${l.id}">${carSvg(-1, { lay: l, small: true })}<b>${CAR.car === "util" ? (l.pass ? "Baú + banco do passageiro" : "Só o baú") : l.name}</b><span class="muted small">${zonesFor(l).length} partes</span></button>`).join("")}</div>`;
      return;
    }
    const lay = layOf();
    const n = Object.keys(CAR.pk).length + (CAR.err || []).length;
    const inRoute = R ? R.pkgs.filter(p => !resolved(p)) : [];
    const missing = inRoute.filter(p => zoneOfPkg(p) == null);
    const outside = R ? Object.keys(CAR.pk).filter(k => !R.pkgs.some(p => normTn(p.tn) === k || k.includes(normTn(p.tn)))) : [];
    const vol = Object.values(CAR.pk).filter(x => x.v).length;
    v.innerHTML = `<div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><div><h2>Carregar o veículo</h2><span class="muted small">${esc(CAR_TYPES.find(c => c.id === CAR.car)?.name || "")} · ${esc(lay.name)}</span></div><button type="button" class="ghost sm" data-carreset="1">Trocar</button></div>
        <p class="muted small">Bipe cada pacote: o app mostra a parte do carro. Essa posição vale até a entrega. Caixa grande? Marque <b>Volumoso</b> (fica onde você colocar). QR não leu? Toque em <b>Pacote com erro</b>: ele fica contado no banco da frente para você conferir depois.</p>
        <button type="button" class="pri full" data-bip="carregar">${ICON.scan} Bipar para carregar</button>
        <div class="muted small">${n} pacote${n === 1 ? "" : "s"} no carro${vol ? ` · ${vol} volumoso${vol > 1 ? "s" : ""}` : ""}${R ? ` · ${inRoute.length - missing.length} de ${inRoute.length} da rota` : ""}</div></div>
      ${(CAR.err || []).length ? `<button type="button" class="full errbar" data-errfix="1">⚠️ ${CAR.err.length} pacote${CAR.err.length > 1 ? "s" : ""} com erro no banco da frente · conferir agora</button>` : ""}
      <div class="card" style="justify-items:center"><p class="muted small" style="justify-self:start">Toque numa parte para ver os pacotes dela.</p>${carSvg(-1, { counts: true, pick: true })}</div>
      ${R && missing.length ? `<details class="card"><summary><b>Faltam bipar ${missing.length} pacote${missing.length > 1 ? "s" : ""} da rota</b></summary><div class="list" style="margin-top:8px">${missing.map(p => { const a = byTn.get(p.tn); return `<div class="small">Parada ${a?.n ?? "?"} · Shopee ${p.shopeeStop ?? "s/n"} · ${tnHtml(p.tn)}</div>`; }).join("")}</div></details>` : ""}
      ${R && outside.length ? `<details class="card"><summary><b>${outside.length} bipado${outside.length > 1 ? "s" : ""} que não estão na rota</b></summary><p class="muted small">Pode ser de outra planilha que você ainda vai somar.</p><div class="list" style="margin-top:8px">${outside.map(k => `<div class="small ck-row">${tnHtml(k)} · ${esc(zName(CAR.pk[k].z))} <button type="button" class="sm" data-ckedit="${esc(k)}">Editar</button><button type="button" class="sm danger" data-ckdel="${esc(k)}">Apagar</button></div>`).join("")}</div></details>` : ""}
      <button type="button" class="ghost full danger" data-carclear="1">Esvaziar o carro</button>`;
  }

  function renderHist() {
    const v = $("v-historico");
    v.innerHTML = slotsCard() + `<h2>Histórico de rotas</h2>` + (H.length ? `<div class="list">${H.map((h, i) => {
      const pk = h.stops.flatMap(s => s.pkgs), ok = pk.filter(p => p.st?.s === "ok").length, fail = pk.filter(p => p.st?.s === "fail").length, notes = h.stops.filter(s => s.note || s.pkgs.some(p => p.st?.s === "fail")).length;
      return `<button type="button" class="stop" data-hist="${i}"><span class="num sm idle">${ddmm(h.created).slice(0, 2)}</span><span><span class="addr">${esc(h.name)}</span><br><span class="muted small">${ddmm(h.created)} · ${h.stops.length} paradas · ${ok}/${pk.length} entregues${fail ? ` · ${fail} não entregues` : ""}${notes ? ` · ${notes} com anotação` : ""}</span></span>${ICON.chev}</button>`;
    }).join("")}</div>` : `<div class="empty">Nenhuma rota finalizada ainda.<br>Quando terminar o dia, toque em “Finalizar rota” no Início.</div>`);
  }
  function openHist(i) {
    const h = H[i]; if (!h) return;
    const pk = h.stops.flatMap(s => s.pkgs), ok = pk.filter(p => p.st?.s === "ok").length;
    const bad = h.stops.filter(s => s.note || s.pkgs.some(p => p.st?.s !== "ok"));
    openSheet(`<div class="sheet-h"><span class="num sm idle">${ddmm(h.created).slice(0, 2)}</span><div><div class="addr">${esc(h.name)}</div><div class="muted small">${ddmm(h.created)} ${hhmm(h.created)} – ${hhmm(h.finished)}</div></div><button type="button" class="x" data-close="1">${ICON.x}</button></div>
      <div class="stats"><div class="stat"><b>${h.stops.length}</b><span>paradas</span></div><div class="stat"><b>${ok}/${pk.length}</b><span>entregues</span></div><div class="stat"><b>${bad.length}</b><span>pendências</span></div></div>
      <button type="button" class="pri full" data-copyhist="${i}">Copiar resumo para conferir na Shopee</button>
      ${bad.length ? `<h3>Pendências e anotações</h3><div class="list">${bad.map(s => `<div class="card flat" style="padding:12px;gap:6px"><b>Parada ${s.n} · ${esc(s.label)}</b>${s.note ? `<span class="small">📝 ${esc(s.note)}</span>` : ""}${s.pkgs.filter(p => p.st?.s !== "ok").map(p => `<span class="small">${p.st?.s === "fail" ? "✕" : "?"} Shopee ${p.s ?? "s/n"} · ${tnHtml(p.tn)} · ${esc(p.st?.r || "sem registro")}</span>`).join("")}</div>`).join("")}</div>` : `<p class="muted">Sem pendências.</p>`}
      <details><summary class="small muted">Todas as paradas</summary><div class="list" style="margin-top:8px">${h.stops.map(s => `<div class="small">${s.n}. ${esc(s.label)} – ${s.pkgs.filter(p => p.st?.s === "ok").length}/${s.pkgs.length}</div>`).join("")}</div></details>
      <button type="button" class="ghost full danger" data-histdel="${i}">Apagar do histórico</button>`, "hist");
  }

  // ---------- mapa ----------
  // Leaflet + OpenStreetMap (sem chave). Cada parada é um número; tocar abre todos os pacotes dela.
  // A linha segue as ruas (OSRM) das próximas paradas; sem resposta do servidor, liga as paradas em linha reta.
  let map = null, layer = null, lineL = null, meM = null, watch = null, fitted = false, geomBusy = false;
  // Navegação: o GPS do app fica sempre ativo no mapa (você e o caminho até a próxima parada). Para a navegação com
  // voz, o app sugere o Google Maps; dá para trocar por Waze ou Apple Maps.
  const NAVS = { gmaps: { name: "Google Maps", link: a => Core.links.gmaps(a) }, waze: { name: "Waze", link: a => Core.links.waze(a) }, apple: { name: "Apple Maps", link: a => Core.links.apple(a) } };
  let navPref = store.get("rc3:nav", "gmaps");
  const navOf = () => NAVS[navPref] || NAVS.gmaps;
  let toNextL = null, toNextAt = 0, toNextFrom = null, toNextKey = null;
  // Caminho pelas ruas de onde você está até a próxima parada (atualiza quando você anda 60 m ou a parada muda).
  async function drawToNext() {
    const nx = nextStop();
    if (!map || !here || !nx) { toNextL?.remove(); toNextL = null; return; }
    const moved = !toNextFrom || Core.hav(toNextFrom, here) > 60;
    if (!moved && toNextKey === nx.key && toNextL) return;
    if (Date.now() - toNextAt < 8000 && toNextKey === nx.key) return;
    toNextAt = Date.now(); toNextFrom = { ...here }; toNextKey = nx.key;
    let pts = [[here.lat, here.lng], [nx.lat, nx.lng]];
    try {
      const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 8000);
      const j = await (await fetch(`https://router.project-osrm.org/route/v1/driving/${here.lng.toFixed(6)},${here.lat.toFixed(6)};${nx.lng.toFixed(6)},${nx.lat.toFixed(6)}?overview=full&geometries=geojson`, { signal: ctl.signal })).json();
      clearTimeout(tm);
      if (j.code === "Ok") pts = j.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]);
    } catch {}
    toNextL?.remove();
    toNextL = L.polyline(pts, { color: "#16a34a", weight: 6, opacity: 0.85 }).addTo(map);
  }
  function openNavPick() {
    openSheet(`<h2>Navegar com</h2><p class="muted small">O GPS do app fica sempre ligado no mapa. Para a navegação com voz, abrimos o app que você escolher.</p>
      ${Object.entries(NAVS).map(([k, v]) => `<button type="button" class="full ${navPref === k ? "pri" : ""}" data-navpick="${k}">${v.name}${k === "gmaps" ? " (sugerido)" : ""}</button>`).join("")}`, "nav");
  }
  function ensureMap() {
    if (map || !R) return;
    if (!window.L) { $("map").innerHTML = `<div class="empty" style="padding-top:40vh">O mapa não carregou. Confira a internet.<br><a class="btn sm" href="#paradas" style="margin-top:12px">Ver a lista de paradas</a></div>`; return; }
    map = L.map("map", { zoomControl: false, attributionControl: true });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
    layer = L.layerGroup().addTo(map);
    map.on("dragstart", () => (follow = false));
    // Afastado, as bolinhas de quantidade poluem: só aparecem com o mapa mais perto.
    const zf = () => $("map").classList.toggle("far", map.getZoom() < 16);
    map.on("zoomend", zf); setTimeout(zf, 0);
    if (window.ResizeObserver) new ResizeObserver(() => map.invalidateSize()).observe($("map"));
    startGps();
    renderMap();
  }
  let follow = false;
  function pinIcon(a, isNext) {
    const st = stateOf(a), left = a.pkgs.filter(p => !resolved(p)).length;
    const cls = isNext ? "next" : st === "idle" ? (otherClaim(a) ? "other" : "") : st;
    const multi = SLOTS && SLOTS.filter(x => x.R?.pkgs?.length).length > 1;
    const s = isNext ? 40 : 30;
    const vol = a.pkgs.some(p => !resolved(p) && (carOf(p)?.v || window.RCApp?.remote?.car?.[normTn(p.tn)]?.v));
    const multiAt = routeAts().length > 1;
    const sty = multiAt && !isNext && st === "idle" ? `;background:${atColorOf(stopAt(a))};border-color:#fff;color:#fff` : multi && !isNext && st === "idle" ? `;border-color:${slotColor(activeSlot)}` : "";
    return L.divIcon({ className: "", html: `<div class="pin ${cls}" style="position:relative${sty}">${st === "ok" ? "✓" : a.n}${left > 1 ? `<span class="n2">${left}</span>` : ""}${vol ? `<span class="vdot" title="volumoso"></span>` : ""}${multiAt && new Set(a.pkgs.map(p => p.at || "Manual")).size > 1 ? `<span class="atmix">${[...new Set(a.pkgs.map(p => p.at || "Manual"))].map(at => `<i style="background:${atColorOf(at)}"></i>`).join("")}</span>` : ""}</div>`, iconSize: [s, s], iconAnchor: [s / 2, s / 2] });
  }
  // Outras rotas em andamento no mapa: todas, ou só as escolhidas. Cada uma com uma cor; tocar abre aquela rota.
  const SLOT_COLORS = ["#2563eb", "#ea580c", "#7c3aed", "#0d9488", "#db2777", "#65a30d"];
  let mapSel = store.get("rc3:mapsel", null), otherLayer = null;
  const slotColor = id => SLOT_COLORS[Math.max(0, (SLOTS || []).findIndex(x => x.id === id)) % SLOT_COLORS.length];
  const slotShown = id => !mapSel || mapSel.includes(id);
  // ATs dentro da rota aberta (planilhas somadas): cada AT com uma cor e filtro próprio.
  const AT_COLORS = ["#2563eb", "#ea580c", "#7c3aed", "#0d9488", "#db2777", "#65a30d", "#ca8a04"];
  const routeAts = () => (R ? [...new Set(R.pkgs.map(p => p.at || "Manual"))] : []);
  const atColorOf = at => AT_COLORS[Math.max(0, routeAts().indexOf(at)) % AT_COLORS.length];
  const stopAt = a => { const c = {}; a.pkgs.forEach(p => { const k = p.at || "Manual"; c[k] = (c[k] || 0) + 1; }); return Object.keys(c).sort((x, y) => c[y] - c[x])[0]; };
  const atShown = at => !R?.atSel || R.atSel.includes(at);
  const atLabel = at => (at === "Manual" ? "Paradas manuais" : at);
  function openMapSel() {
    const ats = routeAts();
    const atBlock = ats.length > 1 ? `<h3>ATs desta rota</h3>
      <button type="button" class="full ${!R.atSel ? "pri" : ""}" data-atsel="all">Todas as ATs</button>
      <div class="list">${ats.map(at => { const n = R.pkgs.filter(p => (p.at || "Manual") === at), ok = n.filter(p => resolved(p)).length; return `<button type="button" class="stop" data-atsel="${esc(at)}"><span class="num sm" style="background:${atColorOf(at)}">${atShown(at) ? "✓" : ""}</span><span><span class="addr">${esc(atLabel(at))}</span><br><span class="muted small">${ok}/${n.length} resolvidos</span></span><span></span></button>`; }).join("")}</div>` : "";
    const slotBlock = SLOTS && SLOTS.filter(x => x.R?.pkgs?.length).length > 1 ? `<h3>Rotas em andamento</h3>
      <button type="button" class="full ${!mapSel ? "pri" : ""}" data-mapsel="all">Todas as rotas</button>
      <div class="list">${SLOTS.filter(x => x.R?.pkgs?.length).map(sl => `<button type="button" class="stop" data-mapsel="${esc(sl.id)}"><span class="num sm" style="background:${slotColor(sl.id)}">${slotShown(sl.id) ? "✓" : ""}</span><span><span class="addr">${esc(slotName(sl))}</span><br><span class="muted small">${sl.id === activeSlot ? "aberta agora · " : ""}${esc(slotInfo(sl))}</span></span><span></span></button>`).join("")}</div>` : "";
    openSheet(`<h2>O que ver no mapa</h2><p class="muted small">Toque para mostrar ou esconder.</p>${atBlock}${slotBlock}`, "mapsel");
  }
  function openMapSelOld() {
    openSheet(`<h2>Rotas no mapa</h2><p class="muted small">Escolha quais rotas aparecem. A rota aberta é a que você entrega agora.</p>
      <button type="button" class="full ${!mapSel ? "pri" : ""}" data-mapsel="all">Todas as rotas</button>
      <div class="list">${SLOTS.filter(x => x.R?.pkgs?.length).map(sl => `<button type="button" class="stop" data-mapsel="${esc(sl.id)}"><span class="num sm" style="background:${slotColor(sl.id)}">${slotShown(sl.id) ? "✓" : ""}</span><span><span class="addr">${esc(slotName(sl))}</span><br><span class="muted small">${sl.id === activeSlot ? "aberta agora · " : ""}${esc(slotInfo(sl))}</span></span><span></span></button>`).join("")}</div>`, "mapsel");
  }
  function drawOtherRoutes() {
    otherLayer?.remove(); otherLayer = null;
    if (!map || !SLOTS || SLOTS.length < 2) return;
    otherLayer = L.layerGroup().addTo(map);
    SLOTS.filter(sl => sl.id !== activeSlot && sl.R?.pkgs?.length && slotShown(sl.id)).forEach(sl => {
      const As = Core.buildAddresses(sl.R.pkgs), byK = new Map(As.map(a => [a.key, a]));
      const ord = (sl.R.order || []).map(k => byK.get(k)).filter(Boolean);
      As.forEach(a => { if (!ord.includes(a)) ord.push(a); });
      const col = slotColor(sl.id);
      ord.forEach((a, i) => {
        const left = a.pkgs.filter(p => !sl.R.st?.[p.tn]).length; if (!left) return;
        const m = L.marker([a.lat, a.lng], { icon: L.divIcon({ className: "", html: `<div class="pin" style="position:relative;background:${col};border-color:#fff;color:#fff">${i + 1}${left > 1 ? `<span class="n2">${left}</span>` : ""}</div>`, iconSize: [30, 30], iconAnchor: [15, 15] }), zIndexOffset: 200 }).addTo(otherLayer);
        m.on("click", () => { switchSlot(sl.id); setTimeout(() => openStop(a.key, "view"), 50); });
      });
    });
  }
  function renderMap() {
    const nx = nextStop(), c = counts();
    $("mapTop").innerHTML = R ? `<b>${esc(routeTitle())}</b> · ${c.sDone}/${c.sAll} paradas · ${c.ok}/${c.pk} pacotes` : "";
    $("mNext").innerHTML = nx ? `<button type="button" class="next-h" data-stop="${esc(nx.key)}"><span class="num">${nx.n}</span><span><span class="muted">Próxima parada</span><br><span class="addr">${esc(nx.label)}</span><br><span class="muted">${nx.pkgs.length} pacote${nx.pkgs.length > 1 ? "s" : ""}${shopeeTxt(nx) ? " · Shopee " + esc(shopeeTxt(nx)) : ""}</span>${zonesTxt(nx) ? `<br><span class="incar">Localização no carro: <b>${esc(zonesTxt(nx))}</b></span>` : ""}</span></button>
      <div class="row2"><a class="btn pri" href="${navOf().link(nx)}" target="_blank" rel="noopener">${navOf().name}</a><button type="button" data-okall="${esc(nx.key)}">Entreguei</button></div>
      <button type="button" class="ghost sm" data-navset="1" style="min-height:28px;justify-self:center">${here ? "🟢 GPS ligado" : "GPS: procurando…"} · navegar com ${navOf().name} · trocar</button>`
      : `<b>Todas as paradas resolvidas ✓</b><a class="btn" href="#inicio">Finalizar no Início</a>`;
    const nAt = routeAts().length, nSl = SLOTS ? SLOTS.filter(x => x.R?.pkgs?.length).length : 0;
    if (nAt > 1 || nSl > 1) $("mapTop").innerHTML += ` · <button type="button" class="ghost sm" data-mapselopen="1" style="min-height:0;padding:0 4px">${[nAt > 1 ? (R.atSel ? R.atSel.length + " de " + nAt + " ATs" : nAt + " ATs") : "", nSl > 1 ? (mapSel ? mapSel.length + " rotas" : "todas as rotas") : ""].filter(Boolean).join(" · ")} ▾</button>`;
    if (!map) return;
    layer.clearLayers();
    drawOtherRoutes();
    if (R && !slotShown(activeSlot)) { lineL?.remove(); return; }
    stops.filter(a => a === nx || atShown(stopAt(a))).forEach(a => {
      const m = L.marker([a.lat, a.lng], { icon: pinIcon(a, a === nx), zIndexOffset: a === nx ? 1000 : done(a) ? 0 : 500 }).addTo(layer);
      m.on("click", () => openStop(a.key));
    });
    drawLine();
    drawToNext();
    if (!fitted && stops.length) { fitted = true; fitAll(); }
  }
  function fitAll() {
    if (!map || !stops.length) return;
    const pend = stops.filter(a => !done(a));
    const pts = (pend.length ? pend : stops).map(a => [a.lat, a.lng]);
    map.fitBounds(L.latLngBounds(pts), { paddingTopLeft: [30, 70], paddingBottomRight: [30, 230], maxZoom: 16 });
  }
  function drawLine() {
    lineL?.remove(); lineL = null;
    const pend = stops.filter(a => !done(a));
    if (pend.length < 2) return;
    const sig = pend.map(a => a.key).join(";");
    if (R.geom && R.geom.sig === sig) { lineL = L.polyline(R.geom.pts, { color: "#2563eb", weight: 5, opacity: 0.75 }).addTo(map); return; }
    lineL = L.polyline(pend.map(a => [a.lat, a.lng]), { color: "#2563eb", weight: 3, opacity: 0.5, dashArray: "4 8" }).addTo(map);
    if (!geomBusy) fetchGeom(pend, sig);
  }
  async function fetchGeom(pend, sig) {
    geomBusy = true;
    try {
      const pts = [];
      for (let i = 0; i < pend.length - 1; i += 49) {
        const blk = pend.slice(i, i + 50);
        const url = `https://router.project-osrm.org/route/v1/driving/${blk.map(a => `${a.lng.toFixed(6)},${a.lat.toFixed(6)}`).join(";")}?overview=full&geometries=geojson`;
        const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 12000);
        const j = await (await fetch(url, { signal: ctl.signal })).json(); clearTimeout(tm);
        if (j.code !== "Ok") throw new Error(j.code);
        j.routes[0].geometry.coordinates.forEach(([lng, lat]) => pts.push([lat, lng]));
      }
      if (R) { R.geom = { sig, pts }; save(); if (map && tab === "mapa") drawLine(); }
    } catch {} finally { geomBusy = false; }
  }
  function startGps() {
    if (watch != null || !navigator.geolocation) return;
    watch = navigator.geolocation.watchPosition(p => {
      here = { lat: p.coords.latitude, lng: p.coords.longitude };
      if (!map) return;
      if (!meM) meM = L.marker([here.lat, here.lng], { icon: L.divIcon({ className: "", html: `<div class="me"></div>`, iconSize: [18, 18], iconAnchor: [9, 9] }), zIndexOffset: 2000, interactive: false }).addTo(map);
      else meM.setLatLng([here.lat, here.lng]);
      if (follow) map.setView([here.lat, here.lng], Math.max(map.getZoom(), 16));
      drawToNext();
    }, err => { if (err.code === 1) { watch = null; toast("Sem permissão de localização. Libere nos ajustes do iPhone para ver onde você está."); } }, { enableHighAccuracy: true, maximumAge: 5000 });
  }
  $("mLocate").addEventListener("click", () => { startGps(); follow = true; if (here && map) map.setView([here.lat, here.lng], 17); else toast("Procurando sua localização…"); });
  $("mFit").addEventListener("click", () => { follow = false; fitAll(); });

  // ---------- Bipar ----------
  // Câmera aberta: aponte para a etiqueta (código de barras ou QR). "consulta" mostra onde o pacote está e deixa
  // marcar entregue; "carregar" marca o pacote como colocado no carro e diz em que parte ele vai.
  let bip = null;
  function tone(kind) {
    try {
      const ac = bip?.ac; if (!ac) return;
      const seq = kind === "ok" ? [[1046, 0.09]] : kind === "warn" ? [[523, 0.15]] : [[220, 0.18], [180, 0.22]];
      let t = ac.currentTime;
      seq.forEach(([f, d]) => {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = kind === "err" ? "square" : "sine"; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        o.connect(g).connect(ac.destination); o.start(t); o.stop(t + d + 0.02); t += d + 0.04;
      });
    } catch {}
  }
  function hints() {
    const F = ZXing.BarcodeFormat, h = new Map();
    h.set(ZXing.DecodeHintType.TRY_HARDER, true);
    h.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [F.CODE_128, F.CODE_39, F.CODE_93, F.ITF, F.EAN_13, F.QR_CODE, F.DATA_MATRIX]);
    return h;
  }
  async function openBip(mode) {
    if (mode !== "carregar" && !R?.pkgs?.length) return toast("Importe a planilha ou adicione paradas antes de bipar.");
    if (mode === "carregar" && !CAR.lay) { go("carregar"); return toast("Primeiro escolha o carro e como ele está (dois toques)."); }
    if (!window.ZXing) return toast("O leitor não carregou. Confira a internet.");
    closeSheet();
    let ac = null;
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); ac.resume?.(); } catch {}
    bip = { ac, mode, last: {}, stream: null, stop: false, rot: 0, cur: null, zone: Math.min(CAR.cur || 0, Math.max(0, (CAR.zones || []).length - 1)) };
    $("bip").hidden = false;
    $("bipErr").hidden = mode !== "carregar";
    $("bipMode").textContent = mode === "carregar" ? "Carregar o veículo: bipe e coloque onde o app indicar" : "Consultar pacote";
    $("bipRes").innerHTML = `<div class="bip-hint">Aponte a câmera para a etiqueta</div>`;
    if (mode === "carregar") bipZonePanel();
    bipCount();
    try {
      bip.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    } catch (err) {
      $("bipRes").innerHTML = `<div class="bip-card err"><b>${err?.name === "NotAllowedError" ? "Sem permissão para a câmera. Libere a câmera para este site nos ajustes do iPhone." : "Não consegui abrir a câmera."}</b></div>`;
      return;
    }
    if (!bip || bip.stop) { bip?.stream?.getTracks().forEach(t => t.stop()); return; }
    const v = $("bipVideo");
    v.srcObject = bip.stream; v.setAttribute("playsinline", ""); v.muted = true;
    try { await v.play(); } catch {}
    loop();
  }
  function closeBip() {
    if (bip) { bip.stop = true; bip.stream?.getTracks().forEach(t => t.stop()); try { bip.ac?.close(); } catch {} }
    bip = null; $("bipVideo").srcObject = null; $("bip").hidden = true;
    render();
  }
  document.addEventListener("visibilitychange", () => { if (document.hidden && bip) closeBip(); });
  function loop() {
    if (!bip || bip.stop) return;
    const v = $("bipVideo");
    if (v.readyState >= 2 && v.videoWidth) {
      const vw = v.videoWidth, vh = v.videoHeight;
      const full = (bip.f = !bip.f);
      const sx = full ? 0 : vw * 0.15, sy = full ? 0 : vh * 0.2, sw = full ? vw : vw * 0.7, sh2 = full ? vh : vh * 0.6;
      const sc = Math.min(1, 1000 / Math.max(sw, sh2)), dw = Math.round(sw * sc), dh = Math.round(sh2 * sc);
      const cv = bip.cv || (bip.cv = document.createElement("canvas")), ctx = cv.getContext("2d", { willReadFrequently: true });
      const rot = (bip.rot = (bip.rot + (full ? 1 : 0)) % 2);
      cv.width = rot ? dh : dw; cv.height = rot ? dw : dh;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (rot) { ctx.translate(dh, 0); ctx.rotate(Math.PI / 2); }
      ctx.drawImage(v, sx, sy, sw, sh2, 0, 0, dw, dh);
      try {
        const r = (bip.reader || (bip.reader = new ZXing.MultiFormatReader())).decode(new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(new ZXing.HTMLCanvasElementLuminanceSource(cv))), bip.h || (bip.h = hints()));
        onCode(r.getText());
      } catch {}
    }
    setTimeout(() => requestAnimationFrame(loop), 60);
  }
  // Carregamento: a parte do carro é escolhida ANTES de bipar, em botões grandes; cada pacote bipado vai para ela.
  function bipZonePanel() {
    $("bipRes").innerHTML = `${bip.lastHtml || `<div class="bip-hint">Escolha a parte do carro e bipe os pacotes</div>`}
      <div class="bzones">${CAR.zones.map((n, i) => `<button type="button" class="${i === bip.zone ? "on" : ""}" data-bzone="${i}"><b>${esc(n)}</b><span>${zCount(i)} pacote${zCount(i) === 1 ? "" : "s"}</span></button>`).join("")}</div>`;
  }
  function bipCount() {
    if (!bip) return;
    if (bip.mode === "carregar") {
      const ne = (CAR.err || []).length;
      $("bipErr").hidden = false; $("bipErr").textContent = `Pacote com erro (não leu)${ne ? " · " + ne : ""}`;
      const n = Object.keys(CAR.pk).length, inR = R ? R.pkgs.filter(p => !resolved(p)) : [];
      $("bipCount").textContent = (R ? `${inR.filter(p => zoneOfPkg(p) != null).length} de ${inR.length} no carro` : `${n} no carro`) + (ne ? ` · ${ne} com erro` : "");
    } else if (R) $("bipCount").textContent = `${R.pkgs.filter(p => pst(p) === "ok").length} de ${R.pkgs.length} entregues`;
  }
  function flash(k) { $("bip").classList.remove("f-ok", "f-err"); void $("bip").offsetWidth; $("bip").classList.add(k === "err" ? "f-err" : "f-ok"); }
  const findPkg = code => R?.pkgs.find(x => { const t = normTn(x.tn); return t === code || code.includes(t) || t.includes(code); }) || null;
  function onCode(text) {
    const now = Date.now(), seenAt = bip.last[text];
    bip.last[text] = now;
    if (seenAt && now - seenAt < 4000) return;
    const code = codeOf(text), p = findPkg(code);
    if (bip.mode === "carregar") {
      // Já tem lugar no carro: mostra onde está (dá para trocar). Senão, o app sugere e já guarda.
      // Vai direto para a parte escolhida antes de bipar (se já tinha lugar, muda para a escolhida).
      const k = carKey(p ? p.tn : code);
      bip.again = !!k && CAR.pk[k].z === bip.zone;
      putInCar(k || (p ? normTn(p.tn) : code), bip.zone, k ? CAR.pk[k].v : false);
      bip.cur = p ? normTn(p.tn) : code;
      tone(k ? "warn" : "ok"); buzz(60); flash("ok");
      return bipShow();
    }
    if (!p) { tone("err"); buzz([200, 80, 200]); flash("err"); $("bipRes").innerHTML = `<div class="bip-card err"><b>Este pacote não está na rota</b><span class="mono small">${esc(text)}</span>${carKey(code) ? `<span>No carro: <b>${esc(zName(CAR.pk[carKey(code)].z))}${CAR.pk[carKey(code)].v ? " · volumoso" : ""}</b></span>` : ""}</div>`; return; }
    bip.cur = normTn(p.tn);
    tone(resolved(p) ? "warn" : "ok"); buzz(60); flash("ok");
    bipShow();
  }
  function bipShow() {
    if (!bip?.cur) return;
    derive();
    const code = bip.cur, p = findPkg(code), a = p && byTn.get(p.tn), s = p ? R.st[p.tn] : null;
    const k = carKey(code), z = k ? CAR.pk[k].z : null;
    const ofN = a ? `Parada ${a.n} · Shopee ${p.shopeeStop ?? "s/n"} · pacote ${a.pkgs.indexOf(p) + 1} de ${a.pkgs.length}` : "";
    if (bip.mode === "carregar") {
      const c = CAR.pk[k];
      bip.lastHtml = `<div class="bip-last ${bip.again ? "warn" : ""}"><b>${bip.again ? "Já estava em" : "✓ Guardado em"} ${esc(zName(z))}</b>${c?.v ? " · volumoso" : ""}<br><span class="small">${a ? `Parada ${a.n} · Shopee ${p.shopeeStop ?? "s/n"} · ` : ""}${tnHtml(code)}</span>
        <button type="button" class="sm ${c?.v ? "pri" : ""}" data-vol="1">${c?.v ? "✓ Volumoso" : "Volumoso?"}</button></div>`;
      bipZonePanel();
      return bipCount();
    }
    $("bipRes").innerHTML = `<div class="bip-card ${s ? "warn" : ""}">
      <div style="display:flex;align-items:center;gap:12px"><span class="num">${a.n}</span><div><div class="big">${p.shopeeStop ?? "s/n"}</div><div class="muted small">Parada Shopee</div></div></div>
      <b>${esc(a.label)}</b>
      <div class="muted small">${ofN}</div>
      <div>Localização no carro: <b>${pkgPlace(p) ? esc(pkgPlace(p)) : "não bipado no carregamento"}</b></div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">${s ? `<span class="chip ${s.s === "ok" ? "ok" : "bad"}">${s.s === "ok" ? "entregue às " + hhmm(s.t) : esc(s.r || "não entregue")}</span>` : ""}${a.pkgs.length > 1 ? `<span class="chip">${a.pkgs.length} pacotes nesta parada</span>` : ""}</div>
      ${s ? `<button type="button" data-pundo="${esc(p.tn)}">Desfazer</button>` : `<div class="row2"><button type="button" class="pri" data-pok="${esc(p.tn)}">Entreguei este</button><button type="button" data-bipstop="${esc(a.key)}">Ver a parada</button></div>`}
    </div>`;
    bipCount();
  }

  // ---------- toques ----------
  document.addEventListener("click", async e => {
    const t = e.target.closest("button, a[data-go], [data-pick], [data-zpick], [data-errsave]");
    if (!t) return;
    const d = t.dataset;
    if (d.sync) { if (!window.RCSync) return toast("Conectando… tente de novo em alguns segundos."); return window.RCSync[d.sync]?.(t); }
    if (d.go) { if (d.filter) listFilter = d.filter; e.preventDefault(); closeSheet(); return go(d.go); }
    if (d.pick === "file") return $("file").click();
    if (d.close) return closeSheet();
    if (d.bip) return openBip(d.bip);
    if (t.id === "bipClose") return closeBip();
    if (d.manual) return openManual();
    if (d.geo != null) return addManual(+d.geo);
    if (d.imp) return importChoice(d.imp);
    if (d.stop) return openStop(d.stop, "view");
    if (d.bipstop) { const k = d.bipstop; closeBip(); return openStop(k, "view"); }
    if (d.stopmode) { sh.mode = d.stopmode; sh.sel = {}; return openStop(sh.key); }
    if (d.psel) { const [tn, s] = d.psel.split("|"); sh.sel[tn] = s; return openStop(sh.key); }
    if (d.reason) { sh.reason = sh.reason === d.reason ? "" : d.reason; return openStop(sh.key); }
    if (d.issuesave) return saveIssue(d.issuesave);
    if (d.okall) { markAll(d.okall, "ok"); buzz(50); closeSheet(); render(); const nx = nextStop(); return toast(nx ? `Feito ✓ Próxima: parada ${nx.n}` : "Rota completa ✓"); }
    if (d.undo) { const a = byKey.get(d.undo); a.pkgs.forEach(p => delete R.st[p.tn]); delete R.notes[d.undo]; save(); render(); return toast("Desfeito"); }
    if (d.pok) { R.st[d.pok] = { s: "ok", t: Date.now(), r: "" }; save(); tone("ok"); return bipShow(); }
    if (d.pundo) { delete R.st[d.pundo]; save(); return bipShow(); }
    if (d.zpick != null) {
      if (bip && bip.mode === "carregar" && bip.cur) { const k = carKey(bip.cur) || bip.cur; putInCar(k, +d.zpick, false); bip.again = false; tone("ok"); return bipShow(); }
      return openZone(+d.zpick);
    }
    if (d.slot) return switchSlot(d.slot);
    if (d.slotnew) return newSlot();
    if (d.atsel) { const ats = routeAts(); if (d.atsel === "all") R.atSel = null; else { let sel = R.atSel || ats.slice(); sel = sel.includes(d.atsel) ? sel.filter(x => x !== d.atsel) : sel.concat(d.atsel); R.atSel = !sel.length || sel.length === ats.length ? null : sel; } save(); renderMap(); return openMapSel(); }
    if (d.mapsel) { const id = d.mapsel; mapSel = id === "all" ? null : (mapSel || SLOTS.map(x => x.id)); if (id !== "all") { mapSel = mapSel.includes(id) ? mapSel.filter(x => x !== id) : mapSel.concat(id); if (!mapSel.length || mapSel.length === SLOTS.length) mapSel = null; } store.set("rc3:mapsel", mapSel); renderMap(); return openMapSel(); }
    if (d.mapselopen) return openMapSel();
    if (d.navpick) { navPref = d.navpick; store.set("rc3:nav", navPref); closeSheet(); render(); return toast("Navegação: " + navOf().name); }
    if (d.navset) return openNavPick();
    // Código bipado errado: editar ou apagar do carro.
    if (d.ckdel) return twoTap(t, () => { const z = CAR.pk[d.ckdel]?.z; delete CAR.pk[d.ckdel]; saveCar(); toast("Apagado do carro"); if (sheetOn === "zone" && z != null) openZone(z); else { closeSheet(); render(); } });
    if (d.ckedit) { const k = d.ckedit; openSheet(`<h2>Editar código</h2><p class="muted small">Corrija o código do pacote (ex.: BR264026571640T).</p><input type="text" id="ckNew" value="${esc(k)}" autocapitalize="characters" autocomplete="off"><button type="button" class="pri full" data-cksave="${esc(k)}">Salvar</button><button type="button" class="ghost full" data-close="1">Cancelar</button>`, "ckedit"); return; }
    if (d.cksave) { const old = d.cksave, nw = codeOf($("ckNew")?.value || ""); if (nw.length < 6) return toast("Código muito curto."); const v = CAR.pk[old]; if (!v) return closeSheet(); delete CAR.pk[old]; CAR.pk[nw] = v; saveCar(); toast("Código corrigido"); return openZone(v.z); }
    if (d.bzone != null) { bip.zone = +d.bzone; CAR.cur = bip.zone; saveCar(); return bipZonePanel(); }
    if (d.vol) { const k = carKey(bip.cur) || bip.cur, c0 = CAR.pk[k]; if (!c0) return; c0.v = !c0.v; saveCar(); tone("ok"); return bipShow(); }
    if (d.errpkg) { CAR.err = (CAR.err || []).concat({ id: "E" + Date.now(), t: Date.now() }); saveCar(); tone("warn"); buzz(80); flash("ok"); $("bipRes").innerHTML = `<div class="bip-card warn"><b>Pacote com erro contado</b><span class="muted small">Coloque no <b>banco da frente</b>. Depois de carregar, confira em Carregar → "Pacotes com erro".</span></div>`; return bipCount(); }
    if (d.errfix) return openErr();
    if (d.errpick) return openErrZone(d.errpick);
    if (d.errfind) { const q = normTn($("errQ")?.value || ""); if (q.length < 4) return toast("Digite pelo menos 4 letras ou números do código."); const hits = (R?.pkgs || []).filter(p => normTn(p.tn).endsWith(q) || normTn(p.tn).includes(q)); if (hits.length === 1) return openErrZone(normTn(hits[0].tn)); if (!hits.length) return openErrZone(q.startsWith("BR") ? q : q, true); return openErr(hits); }
    if (d.errsave != null) { const code = errCur.code; putInCar(code, +d.errsave, errCur.v); CAR.err = (CAR.err || []).slice(1); saveCar(); toast("Pacote conferido ✓"); return (CAR.err.length ? openErr() : (closeSheet(), render())); }
    if (d.errvol) { errCur.v = !errCur.v; return openErrZone(errCur.code, errCur.unknown); }
    if (d.errdrop) { CAR.err = (CAR.err || []).slice(1); saveCar(); closeSheet(); render(); return toast("Um pacote com erro foi tirado da contagem"); }
    if (d.zopen != null) return openZone(+d.zopen);
    if (d.cartype != null) { CAR.car = d.cartype || null; if (!d.cartype) CAR.lay = null; saveCar(); return renderCarregar(); }
    if (d.lay) { setLayout(d.lay); render(); return toast("Pronto. Pode bipar."); }
    if (d.carreset) { CAR.lay = null; CAR.car = null; saveCar(); return renderCarregar(); }
    if (d.carclear) return twoTap(t, () => { CAR.pk = {}; CAR.cur = 0; saveCar(); render(); toast("Carro vazio"); });
    if (d.rename) return openRename();
    if (d.renamesave) { const v = $("rName").value.trim(), sl = curSlot(); if (sl) sl.name = v || null; persistSlots(); closeSheet(); render(); return toast(v ? "Nome salvo" : "Nome removido"); }
    if (d.zcam != null) { zoneCamFor = +d.zcam; return $("zoneCam").click(); }
    if (d.filter) { listFilter = d.filter; listQ = ""; return renderParadas(); }
    if (d.copy === "pend") return copy(pendText(stops, R.name));
    if (d.copyhist != null) { const h = H[+d.copyhist]; return copy(pendText(h.stops, h.name + " (" + ddmm(h.created) + ")")); }
    if (d.hist != null) return openHist(+d.hist);
    if (d.histdel != null) return twoTap(t, () => { H.splice(+d.histdel, 1); saveH(); closeSheet(); render(); toast("Apagado"); });
    if (d.finish) return twoTap(t, () => { const c = counts(); archive(); render(); go("historico"); toast(`Rota guardada: ${c.ok} entregues${c.fail ? `, ${c.fail} pendências` : ""}`); });
    if (d.reopt) return twoTap(t, async () => {
      if (R.pkgs.some(p => zoneOfPkg(p) != null)) toast("A posição de cada pacote no carro continua a mesma.");
      const pt = await getPos(); if (!pt) return toast("Sem localização. Libere a localização para este site.");
      buildOrder(pt); save(); render(); toast("Ordem refeita a partir de onde você está");
    });
  });
  function twoTap(t, fn) {
    if (t.dataset.armed) { delete t.dataset.armed; return fn(); }
    t.dataset.armed = "1"; const old = t.innerHTML; t.textContent = "Toque de novo para confirmar";
    setTimeout(() => { if (t.dataset.armed) { delete t.dataset.armed; t.innerHTML = old; } }, 3000);
  }

  initSlots();

  // ---------- ponte com sync.js (rota em equipe) ----------
  window.RCApp = {
    get R() { return R; }, get CAR() { return CAR; },
    setRoute(r) { R = r; store.set("rc3:route", R); persistSlots(); derive(); render(); },
    newSlot() { newSlot(); },
    saveLocal() { store.set("rc3:route", R); },
    archiveCurrent() { archive(); },
    render() { render(); }, renderTop() { derive(); renderTop(); },
    toast, openSheet, closeSheet, go, zName, normTn,
    user: null, remote: { claims: {}, car: {}, presence: {}, team: null }, onSave: null, onSaveCar: null, onSwitch: null,
  };

  // Login obrigatório (sync.js libera a tela). Se a conexão com o login não vier em 10 s (sem internet), quem já
  // entrou antes neste celular segue usando o app; os dados ficam no celular e sobem quando a internet voltar.
  setTimeout(() => {
    if (!document.body.classList.contains("locked")) return;
    if (window.RCSync) return;
    let last = null; try { last = JSON.parse(localStorage.getItem("rc3:lastUser")); } catch {}
    if (last) { document.body.classList.remove("locked"); window.RCApp.user = last; render(); toast("Sem internet: usando o app offline."); }
    else if ($("gateMsg")) $("gateMsg").innerHTML = `Sem conexão para entrar. Confira a internet e <a href="" onclick="location.reload()">tente de novo</a>.`;
  }, 10000);

  // ---------- início ----------
  if ("serviceWorker" in navigator) navigator.serviceWorker.getRegistrations?.().then(rs => rs.forEach(r => r.unregister())).catch(() => {});
  route();
})();
