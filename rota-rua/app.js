// Rota Rua: app simples para a rua. Planilha da Shopee → rota rua por rua, Comércio / Apto / Casa e Bipar.
// Depende de ../rota-certa/core.js (Core) e ZXing.
(() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const store = {
    get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  const toast = msg => { const t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => (t.hidden = true), 2600); };
  const buzz = ms => { try { navigator.vibrate?.(ms); } catch {} };

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

  // ---------- tipo do endereço: Comércio, Apartamento ou Casa ----------
  // Referências ("ao lado da clínica", "próximo ao Pão de Açúcar") não contam.
  const LAND = /\b(ao\s+lado|lado|perto|pr[oó]ximo|em\s+frente|frente|atr[aá]s|esquina|vizinh[oa]|depois|antes|ref\.?|refer[eê]ncia)\b[^,;]*/gi;
  const COMM = /\b(loja|lj|comercial|com[eé]rcio|empresa|escrit[oó]rio|sala\s*\d+|conjunto\s*\d+|cj\s*\d+|ltda|eireli|mercado|supermercado|mercearia|oficina|cl[ií]nica|consult[oó]rio|farm[aá]cia|drogaria|restaurante|lanchonete|padaria|confeitaria|academia|sal[aã]o|barbearia|pet\s?shop|galp[aã]o|ind[uú]stria|f[aá]brica|dep[oó]sito|shopping|hor[aá]rio\s+comercial|recep[cç][aã]o|cnpj|hospital|laborat[oó]rio|escola|col[eé]gio|hotel|distribuidora|transportadora|imobili[aá]ria|corretora|ag[eê]ncia|ateli[eê]|studio|est[uú]dio|papelaria|autope[cç]as|borracharia|lavanderia|a[cç]ougue|sorveteria|pizzaria|loteria|cart[oó]rio|cooperativa|despachante|hair|beauty|beleza|est[eé]tica|odonto\w*|advocacia|advogad\w*|contabilidade|cont[aá]bil|veterin[aá]ri\w*|[oó]tica|store|shop|china\s+in\s+box)\b/i;
  const APT = /(\bap(to|t|art)?\.?\s*\d|\baoto\s*\d|\bapartamento\b|\bbloco\b|\bbl\.?\s*\w\b|\btorre\b|\bcond(om[ií]nio)?\b|\bedif[ií]cio\b|\bed\.|\bedi\.|\bporteir[oa]\b|\bportaria\b|\bandar\b|\bresidence\b|\bresidencial\b|\bcomp\s*\d)/i;
  function typeOfPkg(p) {
    const parts = String(p.address || "").split(",");
    const rest = parts.slice(2).join(",").replace(LAND, " ");
    const t = (parts.slice(0, 2).join(",") + "," + rest);
    if (COMM.test(rest)) return "com";
    if (APT.test(rest)) return "apt";
    if (/^\s*\d{1,4}\s*[a-z]?\s*$/i.test(rest)) return "apt"; // "Rua X, 311, 62": o 62 é o apartamento
    return "casa";
  }
  const TYPES = { com: { name: "Comércio", cls: "com" }, apt: { name: "Apto", cls: "apt" }, casa: { name: "Casa", cls: "casa" } };
  const typeOf = a => D.type?.[a.key] || (a.pkgs.some(p => typeOfPkg(p) === "com") ? "com" : a.pkgs.some(p => typeOfPkg(p) === "apt") ? "apt" : "casa");

  // ---------- estado ----------
  let D = store.get("rr:day", null), A = [], byKey = new Map(), byTn = new Map(), order = [];
  let filter = store.get("rr:filter", "all"), showDone = false;
  const done = a => a.pkgs.every(p => D.ok[p.tn]);
  const save = () => store.set("rr:day", D);
  function derive() {
    A = Core.buildAddresses(D.pkgs);
    byKey = new Map(A.map(a => [a.key, a]));
    byTn = new Map(); A.forEach(a => a.pkgs.forEach(p => byTn.set(p.tn, a)));
  }
  // Rota pelo endereço: rua inteira de uma vez (o Core junta os números da mesma rua e escolhe o sentido),
  // começando pela rua mais perto de você. Depois de montada, a ordem fica fixa.
  function plan(from) {
    const pend = A.filter(a => !done(a)), fin = A.filter(done);
    if (!pend.length) { D.order = fin.map(a => a.key); return; }
    const start = from ? nearest(from, pend) : pend.reduce((b, a) => ((a.shopeeStops[0] ?? 1e9) < (b.shopeeStops[0] ?? 1e9) ? a : b));
    const r = Core.addressRoute(pend, start.key, { from: from || null });
    D.order = fin.map(a => a.key).concat(r.order.map(a => a.key));
    D.km = r.km;
  }
  function nearest(pt, list) { let b = list[0], bd = Infinity; list.forEach(a => { const d = Core.hav(pt, a); if (d < bd) { bd = d; b = a; } }); return b; }
  function numberOrder() {
    const known = new Set((D.order || []).filter(k => byKey.has(k)));
    const fresh = A.filter(a => !known.has(a.key));
    order = [...known].map(k => byKey.get(k)).concat(fresh);
    order.forEach((a, i) => (a.n = i + 1));
  }
  const here = { pt: null };
  function getPos(ms = 5000) {
    return new Promise(res => {
      if (!navigator.geolocation) return res(null);
      let ok = false;
      const t = setTimeout(() => { if (!ok) res(here.pt); }, ms);
      navigator.geolocation.getCurrentPosition(p => { ok = true; clearTimeout(t); here.pt = { lat: p.coords.latitude, lng: p.coords.longitude }; res(here.pt); }, () => { clearTimeout(t); res(here.pt); }, { enableHighAccuracy: true, timeout: ms, maximumAge: 60000 });
    });
  }

  // ---------- planilha ----------
  $("file").addEventListener("change", async e => {
    const f = e.target.files[0]; e.target.value = "";
    if (!f) return;
    try {
      const { pkgs } = Core.parseRows(await readXlsxFile(f));
      if (!pkgs.length) throw new Error("A planilha não tem pacotes com coordenadas.");
      const same = D && D.pkgs.some(p => pkgs.some(q => q.tn === p.tn));
      toast("Montando a rota pelas ruas…");
      if (same) {
        // Mesma rota (planilha baixada de novo): mantém a ordem e o que já foi entregue; novos entram no fim.
        D.pkgs = pkgs.concat(D.pkgs.filter(p => D.ok[p.tn] && !pkgs.some(q => q.tn === p.tn)));
        derive(); numberOrder(); D.order = order.map(a => a.key);
      } else {
        D = { pkgs, ok: {}, chk: {}, type: {}, file: f.name, at: Date.now(), order: null };
        derive();
        plan(await getPos());
      }
      save(); render();
      toast(`${A.length} endereços · ${pkgs.length} pacotes`);
    } catch (err) { toast(err.message || "Não consegui ler a planilha."); }
  });

  // ---------- tela ----------
  const typeBadge = a => `<button type="button" class="tb ${TYPES[typeOf(a)].cls}" data-type="${esc(a.key)}" aria-label="Trocar tipo">${TYPES[typeOf(a)].name}</button>`;
  const stopsOf = a => (a.shopeeStops.length ? "Parada " + a.shopeeStops.join(" · ") : "sem nº");
  const waze = a => `https://waze.com/ul?ll=${a.lat},${a.lng}&navigate=yes`;
  const gmaps = a => `https://www.google.com/maps/dir/?api=1&destination=${a.lat},${a.lng}&travelmode=driving`;
  function render() {
    const has = !!(D && D.pkgs?.length);
    $("empty").hidden = has; $("main").hidden = !has;
    if (!has) return;
    derive(); numberOrder();
    const nOk = D.pkgs.filter(p => D.ok[p.tn]).length;
    $("meta").textContent = `${order.filter(done).length}/${order.length} endereços · ${nOk}/${D.pkgs.length} pacotes`;
    $("bar").style.width = (nOk / D.pkgs.length * 100).toFixed(1) + "%";
    const cnt = k => order.filter(a => !done(a) && (k === "all" || typeOf(a) === k)).length;
    document.querySelectorAll("[data-filter]").forEach(b => { b.classList.toggle("on", b.dataset.filter === filter); b.querySelector("b").textContent = cnt(b.dataset.filter); });
    const vis = order.filter(a => (showDone || !done(a)) && (filter === "all" || typeOf(a) === filter));
    // Blocos de rua: endereços seguidos na mesma rua.
    const blocks = [];
    vis.forEach(a => { const last = blocks[blocks.length - 1]; if (last && last.street === a.street) last.list.push(a); else blocks.push({ street: a.street, list: [a] }); });
    const next = order.find(a => !done(a) && (filter === "all" || typeOf(a) === filter));
    $("next").innerHTML = next ? (() => {
      const st = order.filter(a => !done(a) && a.street === next.street);
      const pk = st.reduce((t, a) => t + a.pkgs.filter(p => !D.ok[p.tn]).length, 0);
      return `<div class="nx-k">Agora</div><div class="nx-st">${esc(streetName(next))}</div>
        <div class="nx-s">${st.length} endereço${st.length > 1 ? "s" : ""} nesta rua · ${pk} pacote${pk > 1 ? "s" : ""} · faça a rua inteira</div>
        <div class="nx-nums">${st.map(a => `<span class="${typeOf(a)}">nº ${esc(a.nums?.join("/") || "?")} <em>${a.shopeeStops.length ? "P" + a.shopeeStops.join(" · P") : "s/n"}</em></span>`).join("")}</div>
        <div class="row2"><a class="btn" href="${waze(next)}" target="_blank" rel="noopener">Waze</a><a class="btn" href="${gmaps(next)}" target="_blank" rel="noopener">Google Maps</a></div>`;
    })() : `<div class="nx-st">${filter === "all" ? "Tudo entregue ✓" : "Nada pendente neste filtro"}</div>`;
    $("list").innerHTML = blocks.map(b => {
      const pend = b.list.filter(a => !done(a));
      return `<section class="st"><div class="st-h"><b>${esc(streetName(b.list[0]))}</b><span>${b.list.length} endereço${b.list.length > 1 ? "s" : ""}${pend.length < b.list.length ? ` · ${b.list.length - pend.length} feito${b.list.length - pend.length > 1 ? "s" : ""}` : ""}${b.list[0].bairro ? " · " + esc(b.list[0].bairro) : ""}</span></div>
        ${b.list.map(a => `<div class="ad${done(a) ? " done" : ""}${a === next ? " next" : ""}" id="a-${esc(a.key)}">
          <div class="ad-top"><span class="ad-num">nº ${esc(a.nums?.join(" / ") || "?")}</span>${typeBadge(a)}<span class="ad-stop">${esc(stopsOf(a))}</span></div>
          ${a.pkgs.map(p => { const x = String(p.address).split(",").slice(2).join(",").trim(); return `<div class="pk"><span class="pk-p">${p.shopeeStop != null ? p.shopeeStop : "s/n"}</span><span class="mono">${esc(p.tn.slice(0, -5))}<b>${esc(p.tn.slice(-5))}</b></span>${D.chk[p.tn] ? `<span class="pk-c">✓ bipado</span>` : ""}${x ? `<small>${esc(x)}</small>` : ""}</div>`; }).join("")}
          <div class="row3"><a class="btn sm" href="${waze(a)}" target="_blank" rel="noopener">Waze</a><a class="btn sm" href="${gmaps(a)}" target="_blank" rel="noopener">Google</a>
          <button type="button" class="${done(a) ? "line" : "primary"} sm" data-ok="${esc(a.key)}">${done(a) ? "Desfazer" : `Entreguei${a.pkgs.length > 1 ? " os " + a.pkgs.length : ""}`}</button></div></div>`).join("")}</section>`;
    }).join("") || `<p class="sub center">Nada para mostrar.</p>`;
    $("toggleDone").textContent = showDone ? "Esconder entregues" : `Mostrar entregues (${order.filter(done).length})`;
  }
  const streetName = a => String(a.label || "").split(",")[0].trim();

  // ---------- toques ----------
  document.addEventListener("click", e => {
    const t = e.target.closest("button, [data-filter]");
    if (!t) return;
    const d = t.dataset;
    if (d.filter) { filter = d.filter; store.set("rr:filter", filter); render(); window.scrollTo({ top: 0 }); }
    else if (d.ok) { const a = byKey.get(d.ok); if (!a) return; const was = done(a); a.pkgs.forEach(p => (was ? delete D.ok[p.tn] : (D.ok[p.tn] = D.ok[p.tn] || Date.now()))); save(); render(); if (!was) { buzz(50); toast("Entregue ✓"); } if (t.closest("#bip")) bipRefresh(); }
    else if (d.type) { const a = byKey.get(d.type); const cur = typeOf(a); const nx = cur === "com" ? "apt" : cur === "apt" ? "casa" : "com"; D.type = D.type || {}; D.type[a.key] = nx; save(); render(); toast("Agora: " + TYPES[nx].name); }
    else if (t.id === "toggleDone") { showDone = !showDone; render(); }
    else if (t.id === "replan") { (async () => { toast("Refazendo a partir de onde você está…"); const pt = await getPos(); if (!pt) return toast("Sem localização. Libere a localização para este site."); plan(pt); save(); render(); toast("Rota refeita a partir daqui"); })(); }
    else if (t.id === "newDay") { if (t.dataset.arm) { D = null; store.set("rr:day", null); render(); toast("Dia apagado"); } else { t.dataset.arm = "1"; t.textContent = "Toque de novo para apagar"; setTimeout(() => { delete t.dataset.arm; t.textContent = "Começar dia novo"; }, 3000); } }
    else if (t.id === "bipBtn") openBip();
    else if (t.id === "bipClose") closeBip();
  });

  // ---------- Bipar: câmera aberta, aponte para a etiqueta ----------
  let bip = null;
  function tone(kind) {
    try {
      const ac = bip?.ac; if (!ac) return;
      const seq = kind === "ok" ? [[1046, 0.09]] : kind === "done" ? [[523, 0.15]] : [[220, 0.18], [180, 0.22]];
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
  async function openBip() {
    if (!D?.pkgs?.length) return toast("Abra a planilha antes.");
    if (!window.ZXing) return toast("O leitor não carregou. Confira a internet.");
    let ac = null;
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); ac.resume?.(); } catch {}
    bip = { ac, last: {}, n: 0, stream: null, stop: false, rot: 0, cur: null };
    $("bip").hidden = false;
    $("bipRes").innerHTML = `<div class="bip-hint">Aponte a câmera para a etiqueta</div>`;
    $("bipCount").textContent = "";
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
      const sx = full ? 0 : vw * 0.15, sy = full ? 0 : vh * 0.2, sw = full ? vw : vw * 0.7, sh = full ? vh : vh * 0.6;
      const sc = Math.min(1, 1000 / Math.max(sw, sh)), dw = Math.round(sw * sc), dh = Math.round(sh * sc);
      const cv = bip.cv || (bip.cv = document.createElement("canvas")), ctx = cv.getContext("2d", { willReadFrequently: true });
      const rot = (bip.rot = (bip.rot + (full ? 1 : 0)) % 2);
      cv.width = rot ? dh : dw; cv.height = rot ? dw : dh;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (rot) { ctx.translate(dh, 0); ctx.rotate(Math.PI / 2); }
      ctx.drawImage(v, sx, sy, sw, sh, 0, 0, dw, dh);
      try {
        const r = (bip.reader || (bip.reader = new ZXing.MultiFormatReader())).decode(new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(new ZXing.HTMLCanvasElementLuminanceSource(cv))), bip.h || (bip.h = hints()));
        onCode(r.getText());
      } catch {}
    }
    setTimeout(() => requestAnimationFrame(loop), 60);
  }
  function onCode(text) {
    const now = Date.now(), seenAt = bip.last[text];
    bip.last[text] = now;
    if (seenAt && now - seenAt < 4000) return;
    const T = String(text).toUpperCase().replace(/\s+/g, "");
    const p = D.pkgs.find(x => T.includes(x.tn.toUpperCase()));
    if (!p) {
      tone("err"); buzz([200, 80, 200]);
      $("bipRes").innerHTML = `<div class="bip-card err"><b>Este pacote não está na planilha</b><span class="mono">${esc(text)}</span></div>`;
      flash("err"); return;
    }
    if (!D.chk[p.tn]) bip.n++;
    D.chk[p.tn] = D.chk[p.tn] || now; save();
    bip.cur = p.tn;
    bipRefresh();
    tone(D.ok[p.tn] ? "done" : "ok"); buzz(60); flash("ok");
  }
  function bipRefresh() {
    if (!bip?.cur) return;
    derive(); numberOrder();
    const p = D.pkgs.find(x => x.tn === bip.cur), a = byTn.get(p.tn);
    const pend = order.filter(x => !done(x));
    const pos = pend.indexOf(a);
    const sameSt = order.filter(x => x.street === a.street && !done(x) && x !== a);
    $("bipRes").innerHTML = `<div class="bip-card ${D.ok[p.tn] ? "done" : "ok"}">
      <span class="bip-big">${p.shopeeStop != null ? "Parada " + p.shopeeStop : "Sem nº"}</span>
      <div class="bip-row"><span class="tb ${TYPES[typeOf(a)].cls}">${TYPES[typeOf(a)].name}</span>${D.ok[p.tn] ? `<span class="pk-c">entregue</span>` : pos >= 0 ? `<span class="pk-s">${pos + 1}º endereço da rota</span>` : ""}</div>
      <b class="bip-addr">${esc(a.label)}</b>
      ${sameSt.length ? `<span class="sub">Mais ${sameSt.length} endereço${sameSt.length > 1 ? "s" : ""} nesta rua: nº ${sameSt.map(x => esc(x.nums?.[0] || "?")).join(", ")}</span>` : ""}
      ${a.pkgs.length > 1 ? `<span class="sub">${a.pkgs.length} pacotes neste endereço</span>` : ""}
      <button type="button" class="${D.ok[p.tn] ? "line" : "primary"}" data-ok="${esc(a.key)}">${D.ok[p.tn] ? "Desfazer entrega" : "Entreguei este endereço"}</button></div>`;
    const nb = D.pkgs.filter(x => D.chk[x.tn]).length;
    $("bipCount").textContent = `${nb} de ${D.pkgs.length} bipados`;
  }
  function flash(k) { $("bip").classList.remove("flash-ok", "flash-err"); void $("bip").offsetWidth; $("bip").classList.add(k === "err" ? "flash-err" : "flash-ok"); }

  render();
  if ("serviceWorker" in navigator) navigator.serviceWorker.getRegistrations?.().then(rs => rs.forEach(r => { if (r.scope.includes("/rota-rua/")) r.unregister(); })).catch(() => {});
})();
