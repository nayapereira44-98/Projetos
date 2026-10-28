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
  const newProg = () => ({ status: {}, reason: {}, loaded: {}, loadLog: [], picked: {}, later: [], startedAt: null, finishedAt: null, odoStart: null, odoEnd: null, gpsKm: 0, cdKm: 0 });
  const progKey = () => "rc:prog:" + S.route.id;
  const saveProg = () => store.set(progKey(), S.prog);
  const saveRoute = () => store.set("rc:route", S.route);

  const toast = msg => { const t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => (t.hidden = true), 2400); };
  const buzz = ms => { try { navigator.vibrate?.(ms); } catch {} };

  // ---------- planilha ----------
  $("file").addEventListener("change", async e => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const { pkgs, bad } = Core.parseRows(await readXlsxFile(f));
      if (!pkgs.length) throw new Error("A planilha não tem pacotes com coordenadas.");
      const id = (pkgs[0].at || f.name) + "";
      const same = S.route && S.route.id === id;
      S.route = { id, file: f.name, pkgs, bad, settings: same ? S.route.settings : { radius: 20, start: "shopee", vehicle: S.route?.settings.vehicle || "carro", blockSize: 10, maxPkgs: 25 }, plan: same ? S.route.plan : null };
      S.prog = { ...newProg(), ...store.get(progKey(), {}) };
      saveRoute();
      await boot(!same);
      location.hash = Object.keys(S.prog.loaded).length || Object.keys(S.prog.status).length ? "#rota" : "#carregar";
      toast(`${pkgs.length} pacotes carregados da planilha`);
    } catch (err) {
      toast(err.message || "Não consegui ler a planilha.");
    } finally { e.target.value = ""; }
  });

  async function boot(forcePlan) {
    $("empty").hidden = true; $("app").hidden = false;
    $("subtitle").textContent = S.route.file.replace(/\.xlsx$/i, "");
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

  async function plan() {
    const st = S.route.settings;
    const stops = Core.groupStops(S.route.pkgs, st.radius);
    const points = stops.slice();
    let startIdx = -1;
    if (st.start === "gps" && S.gpsStart) { points.push({ ...S.gpsStart, street: "" }); startIdx = points.length - 1; }
    else if (st.start.startsWith("s")) startIdx = stops.findIndex(s => s.key === st.start.slice(1));
    if (startIdx < 0) startIdx = stops.reduce((b, s, i) => (s.minSeq < stops[b].minSeq ? i : b), 0);
    $("foot").textContent = "Calculando distâncias pelas ruas…";
    const road = await roadTable(points);
    const C = Core.buildCost(points, road, road ? 40 : 60);
    const order = Core.solve(C, startIdx);
    const shopee = [...stops.keys()].sort((a, b) => stops[a].minSeq - stops[b].minSeq);
    const stopOrder = order.filter(i => i < stops.length);
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
    S.stops = Core.groupStops(S.route.pkgs, st.radius);
    S.byKey = new Map(S.stops.map(s => [s.key, s]));
    S.byTn = new Map();
    S.stops.forEach(s => s.pkgs.forEach(p => S.byTn.set(p.tn, s)));
    if (!planMatches()) { S.display = []; return; }
    const planStops = S.route.plan.orderKeys.map(k => S.byKey.get(k));
    // Bloco fecha ao atingir N paradas ou o limite de pacotes, para nenhuma zona lotar.
    let b = 0, cnt = 0, pk = 0;
    planStops.forEach((s, i) => {
      if (cnt >= st.blockSize || (cnt > 0 && pk + s.pkgs.length > (st.maxPkgs || 25))) { b++; cnt = 0; pk = 0; }
      s.pi = i; s.block = b; cnt++; pk += s.pkgs.length;
      Object.assign(s, Core.zoneFor(s.block, st.vehicle));
    });
    S.planStops = planStops;
    const later = S.prog.later.filter(k => S.byKey.has(k));
    S.display = planStops.filter(s => !later.includes(s.key)).concat(later.map(k => S.byKey.get(k)));
    S.display.forEach((s, i) => (s.n = i + 1));
  }

  const dist = (a, b) => S.route.plan.matrix ? S.route.plan.matrix[a.pi][b.pi] : Core.hav(a, b) * Core.STREET_FACTOR;
  const pkgDone = p => !!S.prog.status[p.tn];
  const stopDone = s => s.pkgs.every(pkgDone);
  const stopFailed = s => s.pkgs.some(p => S.prog.status[p.tn] === "fail");
  const anyLoaded = () => Object.keys(S.prog.loaded).length > 0;

  function etas() {
    const a = S.assume, search = anyLoaded() ? a.searchOrg : a.searchMessy;
    let t = Date.now(), prev = null;
    const firstOpen = S.display.findIndex(s => !stopDone(s));
    if (firstOpen > 0) prev = S.display[firstOpen - 1];
    S.display.forEach(s => {
      if (stopDone(s)) { s.eta = null; return; }
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

    const nextIdx = d.findIndex(s => !stopDone(s));
    const n = d[nextIdx];
    S.lastNextBlock = n ? n.block : null;
    renderPick(n);

    if (n) {
      const reasons = S.failOpen === n.key ? `
        <div class="eyebrow">Por que não entregou?</div>
        <div class="reasons">${["Ausente", "Endereço não encontrado", "Recusado", "Outro motivo"].map(r => `<button type="button" data-fail="${esc(n.key)}" data-reason="${r}">${r}</button>`).join("")}</div>
        <button type="button" data-failcancel="1">Cancelar</button>` : "";
      $("next").innerHTML = `
        <div class="eyebrow">Próxima parada · ${n.n} de ${d.length} · chegada ~${hhmm(n.eta)}</div>
        <div class="addr">${esc(n.label)}</div>
        <div class="meta"><span>${n.pkgs.length} pacote${n.pkgs.length > 1 ? "s" : ""}</span>${zoneTag(n)}${n.shopeeStops.length ? `<span>Shopee ${n.shopeeStops.join(", ")}</span>` : ""}${n.unseq ? "<span>sem nº</span>" : ""}${n.until ? `<span>até ${n.until}</span>` : ""}</div>
        <div class="meta mono">${n.pkgs.map(p => esc(tail(p.tn))).join(" · ")}</div>
        <div class="row">
          <a class="btn primary" href="${Core.links.waze(n)}" target="_blank" rel="noopener">Waze</a>
          <a class="btn" href="${Core.links.gmaps(n)}" target="_blank" rel="noopener">Google</a>
          <a class="btn" href="${Core.links.apple(n)}" target="_blank" rel="noopener">Apple</a>
        </div>
        <div class="row">
          <button type="button" class="okb" data-ok="${esc(n.key)}">Entregue</button>
          <button type="button" data-failopen="${esc(n.key)}">Não entregue</button>
          <button type="button" data-later="${esc(n.key)}">Depois</button>
        </div>${reasons}`;
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
        html += `<div class="block-head"><h3>Bloco ${s.block + 1}</h3>${zoneTag(s)}<span class="sub">${members.reduce((a, x) => a + x.pkgs.length, 0)} pct${s.layer ? " · por baixo" : ""}</span></div>`;
        prevBlock = s.block;
      }
      const done = stopDone(s), failed = stopFailed(s);
      const multi = s.shopeeStops.length > 1;
      const rows = s.pkgs.map(p => {
        const st = S.prog.status[p.tn];
        const extra = p.address.split(",").slice(2).join(",").trim();
        return `<li><span class="t">${esc(p.tn)}${p.shopeeStop != null ? " · Shopee " + p.shopeeStop : " · sem nº"}${extra ? `<br><span class="sub">${esc(extra)}</span>` : ""}${st === "fail" ? `<br><span class="sub">Não entregue: ${esc(S.prog.reason[p.tn] || "")}</span>` : ""}</span>
          <span class="st"><button type="button" class="${st === "ok" ? "on-ok" : ""}" data-pok="${esc(p.tn)}" aria-label="Entregue">✓</button><button type="button" class="${st === "fail" ? "on-bad" : ""}" data-pfail="${esc(p.tn)}" aria-label="Não entregue">✗</button><button type="button" data-copy="${esc(p.tn)}">Copiar</button></span></li>`;
      }).join("");
      html += `<article class="stop${done ? " done" : ""}${failed ? " failed" : ""}${i === nextIdx ? " current" : ""}" style="${zc(s.zoneIdx)}">
        <div class="plate">${s.n}</div>
        <div class="body">
          <div class="street">${esc(s.label)}${s.numbers.length > 1 ? ` <span class="sub">(nº ${esc(s.numbers.join(", "))})</span>` : ""}</div>
          <div class="sub">${esc(s.bairro)}${i > 0 && d[i - 1].street === s.street ? " · mesma rua da anterior" : ""}${s.eta ? " · ~" + hhmm(s.eta) : ""}</div>
          <div class="chips">
            <span class="chip count">${s.pkgs.length} pct</span>
            ${s.shopeeStops.map(x => `<span class="chip${multi ? " hot" : ""}">Shopee ${x}</span>`).join("")}
            ${s.unseq ? `<span class="chip hot">${s.unseq} sem nº</span>` : ""}
            ${s.until ? `<span class="chip time">até ${s.until}</span>` : ""}
            ${s.after ? `<span class="chip time">após ${s.after}</span>` : ""}
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
        <div><h3>Separe o bloco ${z.block + 1}: ${items.length} pacotes</h3>
        <p class="sub">${esc(z.zone.name)}${z.layer ? " (por baixo)" : ""} · paradas ${blockStops[0].n}–${blockStops[blockStops.length - 1].n}. Deixe à mão para as próximas ${blockStops.length} paradas.</p></div></div>
      <ul>${items.map(({ p, s }) => `<li><button type="button" class="${S.prog.picked[p.tn] ? "picked" : ""}" data-pick="${esc(p.tn)}"><span class="tn-end">${esc(tail(p.tn))}</span><span class="sub">parada ${s.n} · ${esc(s.label.split(",")[0])}</span></button></li>`).join("")}</ul>
      <button type="button" class="primary" data-pickall="${z.block}">Separei todos</button>
    </section>`;
  }

  document.addEventListener("click", e => {
    const t = e.target.closest("button, a");
    if (!t || !S.route) return;
    const ds = t.dataset;
    const stop = k => S.byKey.get(k);
    if (ds.ok) {
      const s = stop(ds.ok), done = stopDone(s) && !stopFailed(s);
      s.pkgs.forEach(p => { if (done) delete S.prog.status[p.tn]; else if (S.prog.status[p.tn] !== "ok") { S.prog.status[p.tn] = "ok"; delete S.prog.reason[p.tn]; } });
      afterStatus(done ? null : `Parada ${s.n} entregue`);
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
      if (S.prog.status[tn] === want) { delete S.prog.status[tn]; delete S.prog.reason[tn]; }
      else { S.prog.status[tn] = want; if (want === "fail") S.prog.reason[tn] = "Não entregue"; else delete S.prog.reason[tn]; }
      afterStatus();
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
    const next = S.display.find(s => !stopDone(s));
    if (next && prevBlock != null && next.block !== prevBlock && $("pickCard").innerHTML) {
      buzz([80, 60, 80]);
      toast(`Bloco ${next.block + 1}: separe os pacotes da zona ${next.zone.code}`);
      $("pickCard").scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (msg) toast(msg);
  }

  $("findInput").addEventListener("input", e => {
    const m = Core.matchTN(S.route?.pkgs || [], e.target.value);
    $("findResult").innerHTML = m.slice(0, 8).map(p => {
      const s = S.byTn.get(p.tn), st = S.prog.status[p.tn];
      return `<p><b class="mono">${esc(p.tn)}</b> → parada ${s.n} · zona ${s.zone.code} (${esc(s.zone.name)}) · ${esc(s.label)}${st ? (st === "ok" ? " · entregue" : " · não entregue") : ""}</p>`;
    }).join("") || (e.target.value.length >= 3 ? "Nenhum pacote desta rota termina assim." : "");
  });

  $("copy").addEventListener("click", async () => {
    const txt = S.display.map(s => `${s.n}. [${s.zone.code}] ${s.label} (${s.pkgs.length} pct; Shopee ${s.shopeeStops.join(", ") || "sem nº"})\n   ${s.pkgs.map(p => p.tn).join(" ")}`).join("\n");
    try { await navigator.clipboard.writeText(txt); toast("Lista copiada"); } catch { toast("Não foi possível copiar neste navegador"); }
  });

  // ---------- ajustes ----------
  function fillSettings() {
    const st = S.route.settings;
    $("vehicle").innerHTML = Object.entries(Core.VEHICLES).map(([k, v]) => `<option value="${k}">${esc(v.name)}</option>`).join("");
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
    if (!again) { S.prog.loaded[p.tn] = Date.now(); S.prog.loadLog.push(p.tn); saveProg(); }
    $("scanInput").value = "";
    $("scanResult").innerHTML = `<div class="hit${again ? " again" : ""}" style="${zc(s.zoneIdx)}">
      <div class="big">${s.zone.code}</div>
      <div class="nm">${esc(s.zone.name)}${s.layer ? " · por baixo" : ""}</div>
      <div>${again ? "Já carregado antes · " : ""}Bloco ${s.block + 1} · parada ${s.n} · ${esc(s.label)}</div>
      <div class="mono">${esc(p.tn)}</div></div>`;
    buzz(again ? [60, 60, 60] : 60);
    $("scanUndo").disabled = !S.prog.loadLog.length;
    renderAll();
  }
  $("scanUndo").addEventListener("click", () => {
    const tn = S.prog.loadLog.pop();
    if (!tn) return;
    delete S.prog.loaded[tn]; saveProg();
    $("scanResult").innerHTML = `<p class="sub">Desfeito: ${esc(tn)}</p>`;
    $("scanUndo").disabled = !S.prog.loadLog.length;
    renderAll();
  });

  // Leitura por câmera (Android/Chrome com BarcodeDetector).
  if ("BarcodeDetector" in window && navigator.mediaDevices?.getUserMedia) $("scanCam").hidden = false;
  let camStream = null, lastCode = "", lastAt = 0;
  $("scanCam").addEventListener("click", async () => {
    const v = $("camVideo");
    if (camStream) { camStream.getTracks().forEach(t => t.stop()); camStream = null; v.hidden = true; $("scanCam").textContent = "Ler código com a câmera"; return; }
    try {
      camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      v.srcObject = camStream; v.hidden = false; await v.play();
      $("scanCam").textContent = "Fechar câmera";
      const det = new BarcodeDetector();
      const loop = async () => {
        if (!camStream) return;
        try {
          for (const c of await det.detect(v)) {
            const raw = String(c.rawValue).toUpperCase();
            const p = S.route.pkgs.find(x => raw.includes(x.tn.toUpperCase()));
            if (p && (p.tn !== lastCode || Date.now() - lastAt > 3000)) { lastCode = p.tn; lastAt = Date.now(); registerLoad(p); }
          }
        } catch {}
        setTimeout(loop, 250);
      };
      loop();
    } catch { camStream = null; toast("Câmera indisponível. Digite o final do código."); }
  });

  function renderLoad() {
    const st = S.route.settings, veh = Core.VEHICLES[st.vehicle];
    const total = S.route.pkgs.length, loaded = Object.keys(S.prog.loaded).length;
    $("loadCount").textContent = `${loaded} de ${total} pacotes`;
    const zones = veh.zones.map((z, i) => ({ z, i, blocks: new Set(), total: 0, loaded: 0, missing: [] }));
    S.planStops.forEach(s => {
      const Z = zones[s.zoneIdx];
      Z.blocks.add(s.block + 1);
      s.pkgs.forEach(p => { Z.total++; if (S.prog.loaded[p.tn]) Z.loaded++; else Z.missing.push(p.tn); });
    });
    const used = zones.filter(Z => Z.total);
    $("zoneProgress").innerHTML = used.map(Z => `<div class="zrow" style="${zc(Z.i)}"><div class="zl">${Z.z.code}</div>
      <div><b>${esc(Z.z.name)}</b> <span class="sub">· bloco ${[...Z.blocks].join(" e ")}</span><div class="bar"><i style="width:${(Z.loaded / Z.total * 100).toFixed(0)}%"></i></div></div>
      <span class="num">${Z.loaded}/${Z.total}</span></div>`).join("");
    const miss = used.flatMap(Z => Z.missing.map(tn => `${Z.z.code}: ${tn}`));
    $("missingBox").hidden = !miss.length || !loaded;
    $("missingSum").textContent = `Faltam carregar ${miss.length} pacote(s)`;
    $("missingList").textContent = miss.join(" · ");
    $("scanUndo").disabled = !S.prog.loadLog.length;

    $("vehicleSvg").innerHTML = vehicleSvg(st.vehicle, zones);
    const blocks = S.planStops[S.planStops.length - 1].block + 1;
    $("vehicleNote").textContent = blocks > veh.zones.length
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
        <text x="${x + w / 2}" y="${y + h / 2 + 28}" text-anchor="middle" font-size="14" fill="var(--z-ink)">${blocks.length ? "bloco " + blocks.join(", ") : "livre"}</text></g>`;
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
    return { ...Core.finance({ ...S.fin, km: k, delivered, stopsDone, hours: hoursWorked() || 0 }), delivered, k };
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
    if (!hist.length) { $("hist").innerHTML = `<tbody><tr><td class="sub" style="text-align:left">Toque em "Fechar o dia" ao terminar para guardar o resultado aqui.</td></tr></tbody>`; $("clearHist").hidden = true; return; }
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
    const nextIdx = o.findIndex(s => !stopDone(s));
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    o.forEach((s, i) => {
      const [x, y] = P(s), r = i === nextIdx ? 40 : 30;
      ctx.globalAlpha = stopDone(s) ? 0.35 : 1;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = tok(`--z${s.zoneIdx + 1}`); ctx.fill();
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
    S.prog = { ...newProg(), ...store.get(progKey(), {}) };
    boot(false).catch(() => {});
  }
})();
