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
  const save = () => store.set("rc3:route", R);
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
  const nextStop = () => stops.find(a => !done(a));
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
    return ats.length ? "Rota " + ats.map(a => "…" + String(a).slice(-4)).join(" + ") : "Rota " + ddmm(Date.now());
  }
  function newRoute(pkgs, file) {
    R = { id: "r" + Date.now(), name: routeName(pkgs), created: Date.now(), file: file || "", pkgs, order: null, st: {}, notes: {}, loaded: {}, zph: {} };
  }
  // Finaliza a rota: vai para o histórico (com o que foi entregue, o que não foi e as anotações).
  function archive() {
    if (!R || !R.pkgs.length) return;
    derive();
    H.unshift({
      id: R.id, name: R.name, created: R.created, finished: Date.now(),
      stops: stops.map(a => ({ n: a.n, label: a.label, cep: cepOf(a), note: R.notes[a.key] || "", pkgs: a.pkgs.map(p => ({ tn: p.tn, s: p.shopeeStop ?? null, at: p.at || "", c: compl(p), st: R.st[p.tn] || null })) })),
    });
    H = H.slice(0, 80); saveH();
    R = null; save(); derive();
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
    R.pkgs = R.pkgs.concat(add); R.name = routeName(R.pkgs);
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
    const st = stateOf(a), z = zoneOf(a);
    const pk = a.pkgs.map(p => {
      const s = R.st[p.tn];
      const right = sh.mode === "issue"
        ? `<div class="seg" style="grid-auto-columns:auto"><button type="button" class="${(sh.sel[p.tn] || s?.s || "ok") === "ok" ? "on" : ""}" data-psel="${esc(p.tn)}|ok">Entregue</button><button type="button" class="${(sh.sel[p.tn] || s?.s) === "fail" ? "on" : ""}" data-psel="${esc(p.tn)}|fail">Não</button></div>`
        : s ? `<span class="chip ${s.s === "ok" ? "ok" : "bad"}">${s.s === "ok" ? "Entregue " + hhmm(s.t) : esc(s.r || "Não entregue")}</span>` : R.loaded[p.tn] ? `<span class="chip acc">no carro</span>` : "";
      return `<div class="pkg"><div class="sp"><small>Shopee</small><b>${p.shopeeStop ?? "–"}</b></div><div><div class="tn">${tnHtml(p.tn)}</div>${compl(p) ? `<div class="meta">${esc(compl(p))}</div>` : ""}</div>${right}</div>`;
    }).join("");
    const nav = `<div class="row3"><a class="btn sm" href="${Core.links.waze(a)}" target="_blank" rel="noopener">Waze</a><a class="btn sm" href="${Core.links.gmaps(a)}" target="_blank" rel="noopener">Google</a><a class="btn sm" href="${Core.links.apple(a)}" target="_blank" rel="noopener">Apple</a></div>`;
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
      <div style="display:flex;flex-wrap:wrap;gap:6px"><span class="chip">${a.pkgs.length} pacote${a.pkgs.length > 1 ? "s" : ""}</span>${shopeeTxt(a) ? `<span class="chip">Shopee ${esc(shopeeTxt(a))}</span>` : ""}${z ? `<span class="zone ${z.c}" style="font-size:.78rem;padding:3px 9px">No carro: ${z.name}</span>` : ""}</div>
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

  // ---------- carregar o veículo ----------
  // Como no Spoke: carrega de trás para frente. A última parada entra primeiro, no fundo; a primeira parada sai por
  // último, perto da porta. O carro é dividido em 3 partes pela quantidade de pacotes: Fundo, Meio e Frente.
  const ZONES = [{ id: "z1", c: "z1", name: "Fundo" }, { id: "z2", c: "z2", name: "Meio" }, { id: "z3", c: "z3", name: "Frente" }];
  let zoneMap = new Map();
  function computeZones() {
    zoneMap = new Map();
    const total = stops.reduce((t, a) => t + a.pkgs.length, 0);
    let acc = 0;
    stops.forEach(a => {
      const mid = (acc + a.pkgs.length / 2) / Math.max(1, total); // posição na ordem de entrega (0 = primeira)
      zoneMap.set(a.key, mid < 1 / 3 ? ZONES[2] : mid < 2 / 3 ? ZONES[1] : ZONES[0]);
      acc += a.pkgs.length;
    });
  }
  const zoneOf = a => zoneMap.get(a.key) || null;
  // Ordem de carregar: das últimas paradas para as primeiras.
  const loadSeq = () => stops.slice().reverse().flatMap(a => a.pkgs.filter(p => !resolved(p)).map(p => ({ p, a })));

  // Fotos das 3 partes do carro (opcional): uma foto por parte, não por pacote.
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
    if (!f || !R || !zoneCamFor) return;
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(f); });
      const sc = Math.min(1, 1000 / Math.max(img.naturalWidth, img.naturalHeight));
      const cv = document.createElement("canvas"); cv.width = Math.round(img.naturalWidth * sc); cv.height = Math.round(img.naturalHeight * sc);
      cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
      const blob = await new Promise(r => cv.toBlob(r, "image/jpeg", 0.72));
      const id = R.id + ":" + zoneCamFor;
      await idb.put(id, blob);
      R.zph[zoneCamFor] = id; save(); render(); toast("Foto guardada");
    } catch { toast("Não consegui guardar a foto."); }
  });
  async function fillZonePhotos() {
    for (const z of ZONES) {
      const el = document.querySelector(`[data-zimg="${z.id}"]`);
      if (!el || !R?.zph?.[z.id]) continue;
      const b = await idb.get(R.zph[z.id]);
      if (b) el.outerHTML = `<img src="${URL.createObjectURL(b)}" alt="Foto: ${z.name}" data-zview="${z.id}">`;
    }
  }

  // ---------- telas ----------
  const TABS = ["inicio", "mapa", "paradas", "carregar", "historico"];
  let tab = "inicio";
  function go(t) { if (location.hash !== "#" + t) location.hash = "#" + t; else route(); }
  function route() {
    tab = location.hash.slice(1);
    if (!TABS.includes(tab)) tab = "inicio";
    if (!R && (tab === "mapa" || tab === "paradas" || tab === "carregar")) tab = "inicio";
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
    return { pk, ok, fail, left: pk - ok - fail, sDone: stops.filter(done).length, sAll: stops.length, issues: stops.filter(a => a.pkgs.some(p => pst(p) === "fail") || R.notes[a.key]).length, loaded: R ? R.pkgs.filter(p => R.loaded[p.tn] && !resolved(p)).length : 0, toLoad: R ? R.pkgs.filter(p => !resolved(p)).length : 0 };
  }
  function renderTop() {
    if (!R) { $("tTitle").textContent = "Rota Certa"; $("tSub").textContent = "Rotas pelo endereço"; $("tProg").hidden = true; $("tAction").hidden = true; return; }
    const c = counts();
    $("tTitle").textContent = R.name;
    $("tSub").textContent = `${c.sDone}/${c.sAll} paradas · ${c.ok}/${c.pk} pacotes`;
    $("tProg").hidden = false; $("tBar").style.width = (c.pk ? (c.ok + c.fail) / c.pk * 100 : 0).toFixed(1) + "%";
    $("tAction").hidden = true;
  }
  function render() {
    derive(); computeZones(); renderTop();
    if (tab === "inicio") renderHome();
    if (tab === "paradas") renderParadas();
    if (tab === "carregar") renderCarregar();
    if (tab === "historico") renderHist();
    if (tab === "mapa") renderMap();
    if (sheetOn === "stop" && sh) openStop(sh.key);
  }

  function act(icon, title, sub, attrs) { return `<button type="button" class="act" ${attrs}><span class="ic">${icon}</span><span><b>${title}</b><span class="muted">${sub}</span></span>${ICON.chev}</button>`; }
  function renderHome() {
    const v = $("v-inicio");
    if (!R) {
      v.innerHTML = `<div class="hello"><h1>Olá! 👋</h1><p class="muted">O que você quer fazer?</p></div>
        <div class="actions">
          ${act(ICON.file, "Importar planilha da Shopee", "Excel (.xlsx) exportado do app", `data-pick="file"`)}
          ${act(ICON.pin, "Adicionar parada manual", "Digite o endereço", `data-manual="1"`)}
          ${act(ICON.scan, "Bipar pacote", "Aponte a câmera para a etiqueta", `data-bip="consulta"`)}
          ${act(ICON.clock, "Histórico de rotas", `${H.length} rota${H.length === 1 ? "" : "s"} finalizada${H.length === 1 ? "" : "s"}`, `data-go="historico"`)}
        </div>`;
      return;
    }
    const c = counts(), nx = nextStop();
    v.innerHTML = `<div class="card">
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px"><h2>${esc(R.name)}</h2><span class="muted small">${ddmm(R.created)}</span></div>
        <div class="bar"><i style="width:${(c.pk ? (c.ok + c.fail) / c.pk * 100 : 0).toFixed(1)}%"></i></div>
        <div class="stats"><div class="stat"><b>${c.sDone}/${c.sAll}</b><span>paradas</span></div><div class="stat"><b>${c.ok}/${c.pk}</b><span>entregues</span></div><div class="stat"><b>${c.fail}</b><span>não entregues</span></div></div>
        ${nx ? `<button type="button" class="pri full" data-go="mapa">Continuar · parada ${nx.n}</button>` : `<p class="muted">Todas as paradas resolvidas. Finalize a rota quando terminar.</p>`}
      </div>
      <div class="actions">
        ${act(ICON.box, "Carregar o veículo", c.loaded ? `${c.loaded} de ${c.toLoad} no carro` : "Na ordem certa, do fundo para a frente", `data-go="carregar"`)}
        ${act(ICON.note, "Anotações e pendências", c.issues ? `${c.issues} parada${c.issues > 1 ? "s" : ""} com anotação` : "Para conferir com a Shopee depois", `data-go="paradas" data-filter="notas"`)}
        ${act(ICON.file, "Somar outra planilha", "Pacotes novos entram no fim da rota", `data-pick="file"`)}
        ${act(ICON.pin, "Adicionar parada manual", "Digite o endereço", `data-manual="1"`)}
        ${act(ICON.clock, "Histórico de rotas", `${H.length} finalizada${H.length === 1 ? "" : "s"}`, `data-go="historico"`)}
      </div>
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
          <span><span class="addr">${esc(a.label)}</span><br><span class="muted small">${a.pkgs.length} pacote${a.pkgs.length > 1 ? "s" : ""}${shopeeTxt(a) ? " · Shopee " + esc(shopeeTxt(a)) : ""}${zoneOf(a) ? " · " + zoneOf(a).name : ""}</span>
          ${R.notes[a.key] ? `<br><span class="small">📝 ${esc(R.notes[a.key])}</span>` : ""}</span>
          <span class="r">${st === "ok" ? `<span class="chip ok">${ICON.check}</span>` : fails ? `<span class="chip bad">${oks}/${a.pkgs.length}</span>` : ""}</span></button>`;
      }).join("") || `<div class="empty">${listFilter === "notas" ? "Nenhuma anotação ainda.<br>Use “Problema ou entrega parcial” na parada." : listFilter === "feitas" ? "Nenhuma parada feita ainda." : "Tudo feito ✓"}</div>`}</div>
      ${listFilter === "pend" && !q ? `<button type="button" class="ghost full" data-reopt="1">Refazer a ordem a partir de onde estou</button>` : ""}`;
    const lq = $("lq");
    lq.addEventListener("input", () => { listQ = lq.value; const pos = lq.selectionStart; renderParadas(); const n = $("lq"); n.focus(); try { n.setSelectionRange(pos, pos); } catch {} });
  }

  function renderCarregar() {
    const v = $("v-carregar");
    const seq = loadSeq(), total = seq.length, inCar = seq.filter(x => R.loaded[x.p.tn]).length;
    const cur = seq.find(x => !R.loaded[x.p.tn]);
    const pos = x => seq.indexOf(x) + 1;
    const byZone = ZONES.map(z => ({ z, items: seq.filter(x => zoneOf(x.a) === z) }));
    v.innerHTML = `<div class="card"><h2>Carregar o veículo</h2>
        <p class="muted small">Carregue de trás para frente: a <b>última parada</b> vai primeiro, no <b>fundo</b>. A <b>primeira parada</b> fica por último, perto da porta. Pegue o pacote indicado, coloque na parte do carro mostrada e bipe ou toque em Carregado.</p>
        <div class="bar"><i style="width:${total ? (inCar / total * 100).toFixed(1) : 0}%"></i></div>
        <div class="muted small">${inCar} de ${total} pacotes no carro</div>
        <button type="button" class="pri full" data-bip="carregar">${ICON.scan} Bipar para carregar</button></div>
      ${cur ? `<div class="card now"><div class="muted small">Agora · ${pos(cur)}º de ${total}</div>
        <div style="display:flex;align-items:center;gap:12px"><span class="num">${cur.a.n}</span><div><div class="big">${cur.p.shopeeStop ?? "s/n"}</div><div class="muted small">Parada Shopee</div></div><span class="zone ${zoneOf(cur.a).c}" style="margin-left:auto">${zoneOf(cur.a).name}</span></div>
        <div>${tnHtml(cur.p.tn)}</div><div class="muted small">${esc(cur.a.label)}</div>
        <button type="button" class="full" data-load="${esc(cur.p.tn)}">${ICON.check} Carregado</button></div>` : total ? `<div class="card"><b>Tudo carregado ✓</b><p class="muted small">Agora é só seguir o mapa.</p></div>` : ""}
      <div class="card"><h3>Fotos do carro (opcional)</h3><p class="muted small">Uma foto de cada parte depois de carregada ajuda a achar um pacote rápido.</p>
        ${ZONES.map(z => `<div class="zphoto">${R.zph?.[z.id] ? `<span class="ph" data-zimg="${z.id}">…</span>` : `<span class="ph">sem foto</span>`}<div><span class="zone ${z.c}">${z.name}</span><div class="muted small">${byZone.find(b => b.z === z).items.length} pacotes</div></div><button type="button" class="sm" data-zcam="${z.id}">${R.zph?.[z.id] ? "Trocar" : "Tirar foto"}</button></div>`).join("")}</div>
      ${byZone.map(({ z, items }) => items.length ? `<div class="sec-h"><h3>${z.name}</h3><span class="muted small">${items.filter(x => R.loaded[x.p.tn]).length}/${items.length}</span></div>
        <div class="card" style="padding:0;gap:0">${items.map(x => `<button type="button" class="lrow${R.loaded[x.p.tn] ? " done" : ""}" data-load="${esc(x.p.tn)}"><span class="ck">${R.loaded[x.p.tn] ? ICON.check : ""}</span><span><b>Shopee ${x.p.shopeeStop ?? "s/n"}</b> · ${tnHtml(x.p.tn)}<br><span class="muted small">Parada ${x.a.n} · ${esc(x.a.label)}</span></span><span class="muted small">${pos(x)}º</span></button>`).join("")}</div>` : "").join("")}`;
    fillZonePhotos();
  }

  function renderHist() {
    const v = $("v-historico");
    v.innerHTML = `<h2>Histórico de rotas</h2>` + (H.length ? `<div class="list">${H.map((h, i) => {
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
    const cls = isNext ? "next" : st === "idle" ? "" : st;
    const s = isNext ? 40 : 30;
    return L.divIcon({ className: "", html: `<div class="pin ${cls}" style="position:relative">${st === "ok" ? "✓" : a.n}${left > 1 && !isNext ? `<span class="n2">${left}</span>` : ""}</div>`, iconSize: [s, s], iconAnchor: [s / 2, s / 2] });
  }
  function renderMap() {
    const nx = nextStop(), c = counts();
    $("mapTop").innerHTML = R ? `<b>${esc(R.name)}</b> · ${c.sDone}/${c.sAll} paradas · ${c.ok}/${c.pk} pacotes` : "";
    $("mNext").innerHTML = nx ? `<button type="button" class="next-h" data-stop="${esc(nx.key)}"><span class="num">${nx.n}</span><span><span class="muted">Próxima parada</span><br><span class="addr">${esc(nx.label)}</span><br><span class="muted">${nx.pkgs.length} pacote${nx.pkgs.length > 1 ? "s" : ""}${shopeeTxt(nx) ? " · Shopee " + esc(shopeeTxt(nx)) : ""}${zoneOf(nx) ? " · " + zoneOf(nx).name : ""}</span></span></button>
      <div class="row2"><a class="btn pri" href="${Core.links.waze(nx)}" target="_blank" rel="noopener">Navegar (Waze)</a><button type="button" data-okall="${esc(nx.key)}">Entreguei</button></div>`
      : `<b>Todas as paradas resolvidas ✓</b><a class="btn" href="#inicio">Finalizar no Início</a>`;
    if (!map) return;
    layer.clearLayers();
    stops.forEach(a => {
      const m = L.marker([a.lat, a.lng], { icon: pinIcon(a, a === nx), zIndexOffset: a === nx ? 1000 : done(a) ? 0 : 500 }).addTo(layer);
      m.on("click", () => openStop(a.key));
    });
    drawLine();
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
    if (!R?.pkgs?.length) return toast("Importe a planilha ou adicione paradas antes de bipar.");
    if (!window.ZXing) return toast("O leitor não carregou. Confira a internet.");
    closeSheet();
    let ac = null;
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); ac.resume?.(); } catch {}
    bip = { ac, mode, last: {}, stream: null, stop: false, rot: 0, cur: null };
    $("bip").hidden = false;
    $("bipMode").textContent = mode === "carregar" ? "Carregar o veículo" : "Consultar pacote";
    $("bipRes").innerHTML = `<div class="bip-hint">Aponte a câmera para a etiqueta</div>`;
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
  function bipCount() {
    if (!bip || !R) return;
    const seq = R.pkgs.filter(p => !resolved(p));
    $("bipCount").textContent = bip.mode === "carregar" ? `${seq.filter(p => R.loaded[p.tn]).length} de ${seq.length} no carro` : `${R.pkgs.filter(p => pst(p) === "ok").length} de ${R.pkgs.length} entregues`;
  }
  function flash(k) { $("bip").classList.remove("f-ok", "f-err"); void $("bip").offsetWidth; $("bip").classList.add(k === "err" ? "f-err" : "f-ok"); }
  function onCode(text) {
    const now = Date.now(), seenAt = bip.last[text];
    bip.last[text] = now;
    if (seenAt && now - seenAt < 4000) return;
    const T = String(text).toUpperCase().replace(/\s+/g, "");
    const p = R.pkgs.find(x => T.includes(String(x.tn).toUpperCase()));
    if (!p) { tone("err"); buzz([200, 80, 200]); flash("err"); $("bipRes").innerHTML = `<div class="bip-card err"><b>Este pacote não está na rota</b><span class="mono small">${esc(text)}</span></div>`; return; }
    bip.cur = p.tn;
    if (bip.mode === "carregar" && !R.loaded[p.tn]) { R.loaded[p.tn] = now; save(); }
    tone(resolved(p) ? "warn" : "ok"); buzz(60); flash("ok");
    bipShow();
  }
  function bipShow() {
    if (!bip?.cur) return;
    derive(); computeZones();
    const p = R.pkgs.find(x => x.tn === bip.cur), a = byTn.get(p.tn), z = zoneOf(a), s = R.st[p.tn];
    const seq = loadSeq(), i = seq.findIndex(x => x.p.tn === p.tn);
    $("bipRes").innerHTML = `<div class="bip-card ${s ? "warn" : ""}">
      <div style="display:flex;align-items:center;gap:12px"><span class="num">${a.n}</span><div><div class="big">${p.shopeeStop ?? "s/n"}</div><div class="muted small">Parada Shopee</div></div>${z ? `<span class="zone ${z.c}" style="margin-left:auto">${bip.mode === "carregar" ? "Coloque no " : ""}${z.name}</span>` : ""}</div>
      <b>${esc(a.label)}</b>
      <div style="display:flex;flex-wrap:wrap;gap:6px">${s ? `<span class="chip ${s.s === "ok" ? "ok" : "bad"}">${s.s === "ok" ? "entregue às " + hhmm(s.t) : esc(s.r || "não entregue")}</span>` : ""}${R.loaded[p.tn] ? `<span class="chip acc">no carro${i >= 0 ? " · " + (i + 1) + "º a carregar" : ""}</span>` : ""}${a.pkgs.length > 1 ? `<span class="chip">${a.pkgs.length} pacotes nesta parada</span>` : ""}</div>
      ${bip.mode === "consulta" ? (s ? `<button type="button" data-pundo="${esc(p.tn)}">Desfazer</button>` : `<div class="row2"><button type="button" class="pri" data-pok="${esc(p.tn)}">Entreguei este</button><button type="button" data-bipstop="${esc(a.key)}">Ver a parada</button></div>`) : ""}
    </div>`;
    bipCount();
  }

  // ---------- toques ----------
  document.addEventListener("click", async e => {
    const t = e.target.closest("button, a[data-go], [data-pick]");
    if (!t) return;
    const d = t.dataset;
    if (d.go) { if (d.filter) listFilter = d.filter; e.preventDefault(); return go(d.go); }
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
    if (d.load) { R.loaded[d.load] ? delete R.loaded[d.load] : (R.loaded[d.load] = Date.now()); save(); return renderCarregar(); }
    if (d.zcam) { zoneCamFor = d.zcam; return $("zoneCam").click(); }
    if (d.zview) { const b = await idb.get(R.zph[d.zview]); if (b) openSheet(`<img src="${URL.createObjectURL(b)}" style="width:100%;border-radius:12px" alt=""><button type="button" class="full" data-close="1">Fechar</button>`); return; }
    if (d.filter) { listFilter = d.filter; listQ = ""; return renderParadas(); }
    if (d.copy === "pend") return copy(pendText(stops, R.name));
    if (d.copyhist != null) { const h = H[+d.copyhist]; return copy(pendText(h.stops, h.name + " (" + ddmm(h.created) + ")")); }
    if (d.hist != null) return openHist(+d.hist);
    if (d.histdel != null) return twoTap(t, () => { H.splice(+d.histdel, 1); saveH(); closeSheet(); render(); toast("Apagado"); });
    if (d.finish) return twoTap(t, () => { const c = counts(); archive(); render(); go("historico"); toast(`Rota guardada: ${c.ok} entregues${c.fail ? `, ${c.fail} pendências` : ""}`); });
    if (d.reopt) return twoTap(t, async () => {
      if (R.pkgs.some(p => R.loaded[p.tn])) toast("Atenção: o carro já foi carregado pela ordem antiga.");
      const pt = await getPos(); if (!pt) return toast("Sem localização. Libere a localização para este site.");
      buildOrder(pt); save(); render(); toast("Ordem refeita a partir de onde você está");
    });
  });
  function twoTap(t, fn) {
    if (t.dataset.armed) { delete t.dataset.armed; return fn(); }
    t.dataset.armed = "1"; const old = t.innerHTML; t.textContent = "Toque de novo para confirmar";
    setTimeout(() => { if (t.dataset.armed) { delete t.dataset.armed; t.innerHTML = old; } }, 3000);
  }

  // ---------- início ----------
  if ("serviceWorker" in navigator) navigator.serviceWorker.getRegistrations?.().then(rs => rs.forEach(r => r.unregister())).catch(() => {});
  route();
})();
