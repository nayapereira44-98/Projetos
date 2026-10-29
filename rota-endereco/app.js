// Rota por Endereço — interface. Cada parada é um endereço; a parada da Shopee é só referência (de-para).
// Depende de ../rota-certa/core.js (global Core) e do ZXing (leitura de código de barras).
(() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const tail = tn => tn.slice(-5);
  const km = m => (m / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " km";
  const store = {
    get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  const toast = msg => { const t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => (t.hidden = true), 2400); };
  const buzz = ms => { try { navigator.vibrate?.(ms); } catch {} };

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
  // D: o dia (pacotes, ordem dos endereços). ok: entregas por código SPX, guardadas à parte para sobreviver a uma planilha nova.
  let D = store.get("re:day", null), ok = {}, A = [], byKey = new Map(), byTn = new Map(), order = [];
  const okKey = () => "re:ok:" + D.at;
  const save = () => { store.set("re:day", D); store.set(okKey(), ok); };
  const pkgDone = p => !!ok[p.tn];
  const addrDone = a => a.pkgs.every(pkgDone);
  const shp = a => (a.shopeeStops.length ? `<span>Shopee ${a.shopeeStops.join(" · ")}</span>` : "") + (a.unseq ? `<span>sem nº</span>` : "");
  const extra = p => p.address.split(",").slice(2).join(",").trim();

  function derive() {
    A = Core.buildAddresses(D.pkgs);
    byKey = new Map(A.map(a => [a.key, a]));
    byTn = new Map();
    A.forEach(a => a.pkgs.forEach(p => byTn.set(p.tn, a)));
  }
  const orderOk = () => D.order && D.order.length === A.length && D.order.every(k => byKey.has(k));

  // Refaz a ordem só dos endereços pendentes, começando por `startKey`; os já entregues ficam na frente.
  function plan(startKey) {
    const doneA = (orderOk() ? D.order.map(k => byKey.get(k)) : A).filter(addrDone);
    const pend = A.filter(a => !addrDone(a));
    if (!pend.length) { D.order = doneA.map(a => a.key); return; }
    const start = pend.some(a => a.key === startKey) ? startKey : pend.reduce((b, a) => ((a.shopeeStops[0] ?? 1e9) < (b.shopeeStops[0] ?? 1e9) ? a : b)).key;
    const r = Core.addressRoute(pend, start);
    D.order = doneA.concat(r.order).map(a => a.key);
    D.km = r.km;
    if (!D.shopeeKm) {
      const sh = A.slice().sort((a, b) => (a.shopeeStops[0] ?? 1e9) - (b.shopeeStops[0] ?? 1e9));
      D.shopeeKm = sh.slice(1).reduce((t, a, i) => t + Core.hav(sh[i], a) * Core.STREET_FACTOR, 0);
    }
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
        $("resume").hidden = true;
        // Mesma rota exportada de novo: mantém as entregas e encaixa os pacotes novos.
        const before = new Set(D.pkgs.map(p => p.tn));
        const fresh = pkgs.filter(p => !before.has(p.tn)).length;
        D.pkgs = pkgs; derive();
        const next = order.find(a => !addrDone(a));
        plan(next && byKey.has(next.key) ? next.key : null);
        save(); show();
        toast(fresh ? `${fresh} pacote(s) novo(s) encaixados na rota` : "Planilha atualizada");
      } else {
        D = { at, file: f.name, pkgs, createdAt: Date.now(), order: null };
        ok = {};
        derive(); plan(null); save();
        $("resume").hidden = true;
        show();
        toast(`${A.length} endereços, ${pkgs.length} pacotes`);
      }
    } catch (err) {
      toast(err.message || "Não consegui ler a planilha.");
    } finally { e.target.value = ""; }
  });

  function show() {
    $("empty").hidden = true; $("app").hidden = false;
    $("fileBtn").textContent = "Atualizar planilha";
    $("subtitle").textContent = `${D.at} · ${D.file.replace(/\.xlsx$/i, "")}`;
    const sorted = A.slice().sort((a, b) => (a.shopeeStops[0] ?? 1e9) - (b.shopeeStops[0] ?? 1e9));
    $("start").innerHTML = sorted.map(a => `<option value="${esc(a.key)}">${esc(a.label)}${a.shopeeStops.length ? " (Shopee " + a.shopeeStops.join(", ") + ")" : ""}</option>`).join("");
    render();
  }

  // ---------- tela ----------
  function render() {
    if (!orderOk()) plan(null);
    order = D.order.map(k => byKey.get(k));
    order.forEach((a, i) => (a.n = i + 1));
    const doneA = order.filter(addrDone).length, donePk = D.pkgs.filter(pkgDone).length;
    const saved = (D.shopeeKm || 0) - (D.km || 0);
    $("stats").innerHTML = [
      [`${doneA}/${order.length}`, "endereços feitos"],
      [`${donePk}/${D.pkgs.length}`, "pacotes entregues"],
      [km(D.km || 0), "percurso estimado"],
      [saved > 50 ? "−" + km(saved) : "≈", "contra a ordem da Shopee"],
    ].map(([b, s]) => `<div class="stat"><b>${b}</b><span>${s}</span></div>`).join("");

    const ni = order.findIndex(a => !addrDone(a)), n = order[ni];
    if (n) {
      const sameStreet = [];
      for (let i = ni + 1; i < order.length && order[i].street === n.street; i++) if (!addrDone(order[i])) sameStreet.push(order[i]);
      $("next").innerHTML = `
        <div class="eyebrow">Próximo endereço · ${n.n} de ${order.length}</div>
        <div class="addr">${esc(n.label)}</div>
        <div class="sub" style="color:inherit;opacity:.9">${esc(n.bairro)} · ${n.pkgs.length} pacote${n.pkgs.length > 1 ? "s" : ""} · <span class="shp">${shp(n) || "–"}</span></div>
        ${sameStreet.length ? `<div class="street-left">Depois, nesta mesma rua: nº ${sameStreet.map(a => a.num || "?").join(", ")}</div>` : `<div class="street-left">Último endereço desta rua.</div>`}
        <ul>${n.pkgs.map(p => `<li class="${pkgDone(p) ? "done" : ""}"><span><b class="mono">${esc(tail(p.tn))}</b> · ${p.shopeeStop != null ? "Shopee " + p.shopeeStop : "sem nº"}${extra(p) ? " · " + esc(extra(p)) : ""}</span>${n.pkgs.length > 1 ? `<button type="button" data-p="${esc(p.tn)}">${pkgDone(p) ? "Desfazer" : "Entregue"}</button>` : ""}</li>`).join("")}</ul>
        <div class="row">
          <a class="btn primary" href="${Core.links.waze(n)}" target="_blank" rel="noopener">Waze</a>
          <a class="btn" href="${Core.links.gmaps(n)}" target="_blank" rel="noopener">Google</a>
          <a class="btn" href="${Core.links.apple(n)}" target="_blank" rel="noopener">Apple</a>
          <button type="button" class="okb" data-a="${esc(n.key)}">Entreguei ${n.pkgs.length > 1 ? "tudo " : ""}aqui</button>
        </div>`;
    } else {
      $("next").innerHTML = `<div class="addr">Rota concluída</div><div>${D.pkgs.length} pacotes em ${order.length} endereços.</div>`;
    }

    // Lista agrupada por rua (trechos seguidos da mesma rua).
    let html = "";
    for (let i = 0; i < order.length;) {
      let j = i; while (j < order.length && order[j].street === order[i].street && !order[i].key.startsWith("geo|")) j++;
      if (j === i) j = i + 1;
      const g = order.slice(i, j), pk = g.reduce((t, a) => t + a.pkgs.length, 0);
      const streetName = g[0].label.split(",")[0];
      html += `<section class="street${g.every(addrDone) ? " done" : ""}">
        <div class="street-head"><b>${esc(streetName)}</b><span>${esc(g[0].bairro)} · ${g.length} endereço${g.length > 1 ? "s" : ""} · ${pk} pct${g.length > 1 ? ` · nº ${g[0].num} → ${g[g.length - 1].num}` : ""}</span></div>
        ${g.map(a => `<div class="addr-row${addrDone(a) ? " done" : ""}${a === n ? " current" : ""}">
          <div class="n">${a.n}</div>
          <div><span class="num">${a.num ? "nº " + a.num : esc(a.label)}</span> <span class="shp">${shp(a)}</span>
            <div class="sub mono">${a.pkgs.map(p => esc(tail(p.tn)) + (extra(p) ? " · " + esc(extra(p)) : "")).join("<br>")}</div></div>
          <button type="button" data-a="${esc(a.key)}">${addrDone(a) ? "Feito ✓" : "Entregue"}</button>
        </div>`).join("")}
      </section>`;
      i = j;
    }
    $("list").innerHTML = html;

    // De-para.
    const rows = [];
    order.forEach(a => a.pkgs.forEach(p => rows.push({ s: p.shopeeStop, a, p })));
    rows.sort((x, y) => (x.s ?? 1e9) - (y.s ?? 1e9) || x.a.n - y.a.n);
    $("dp").innerHTML = `<thead><tr><th>Shopee</th><th>Nosso nº</th><th>Endereço</th><th>Pacote</th></tr></thead><tbody>${rows.map(r => `<tr style="${pkgDone(r.p) ? "opacity:.5" : ""}"><td>${r.s ?? "sem nº"}</td><td>${r.a.n}</td><td>${esc(r.a.label)}</td><td class="mono">${esc(tail(r.p.tn))}</td></tr>`).join("")}</tbody>`;
    $("streetList").innerHTML = [...new Set(A.map(streetName))].sort().map(n => `<option value="${esc(n)}"></option>`).join("");
    renderHere();
    $("foot").textContent = "Ordem por endereço: cada rua é feita inteira antes da próxima, em ordem de número. A distância é estimada em linha reta com fator de ruas.";
  }

  // ---------- ações ----------
  function toggleAddr(a) {
    const done = addrDone(a);
    a.pkgs.forEach(p => (done ? delete ok[p.tn] : (ok[p.tn] = ok[p.tn] || Date.now())));
    save(); render();
    if (!done) toast(`Endereço ${a.n} entregue`);
  }
  document.addEventListener("click", e => {
    const t = e.target.closest("button");
    if (!t || !D) return;
    if (t.dataset.a) { toggleAddr(byKey.get(t.dataset.a)); if (t.closest("#found")) $("found").innerHTML = ""; }
    else if (t.dataset.p) { const tn = t.dataset.p; ok[tn] ? delete ok[tn] : (ok[tn] = Date.now()); save(); render(); if (t.closest("#found")) showFound(byTn.get(tn), tn); }
    else if (t.dataset.resume === "go") { $("resume").hidden = true; derive(); show(); }
    else if (t.dataset.resume === "clear" || t.id === "clear") {
      if (!t.dataset.armed) { const l = t.textContent; t.dataset.armed = "1"; t.textContent = "Toque de novo para apagar"; setTimeout(() => { delete t.dataset.armed; t.textContent = l; }, 4000); return; }
      store.set("re:day", null); if (D) store.set(okKey(), null);
      D = null; ok = {};
      $("app").hidden = true; $("resume").hidden = true; $("empty").hidden = false;
      $("fileBtn").textContent = "Abrir planilha"; $("subtitle").textContent = "Cada rua de uma vez, com o de-para da Shopee";
      toast("Pronto. Abra a planilha para começar.");
    }
  });
  $("recalc").addEventListener("click", () => { plan($("start").value); save(); render(); toast("Ordem refeita"); });
  $("copy").addEventListener("click", async () => {
    const txt = order.map(a => `${a.n}. ${a.label} — Shopee ${a.shopeeStops.join(", ") || "sem nº"} — ${a.pkgs.map(p => tail(p.tn)).join(" ")}`).join("\n");
    try { await navigator.clipboard.writeText(txt); toast("Lista copiada"); } catch { toast("Não foi possível copiar neste navegador"); }
  });

  // ---------- onde estou ----------
  // GPS quando o navegador deixa; senão, a rua digitada vira o ponto de referência.
  let here = null, hereSrc = "", hereStreet = null, watchId = null, wake = null;
  const streetName = a => a.label.split(",")[0].trim();
  function renderHere() {
    if (!here || !D) { $("locOut").innerHTML = ""; return; }
    const pend = order.filter(a => !addrDone(a));
    if (!pend.length) { $("locOut").innerHTML = `<p class="sub">Todos os endereços foram entregues.</p>`; return; }
    const dist = a => Core.hav(here, a);
    const nearest = pend.map(a => ({ a, d: dist(a) })).sort((x, y) => x.d - y.d);
    // Rua digitada com pendência manda; senão, a rua do endereço pendente mais perto.
    const st = hereSrc === "rua" && pend.some(a => a.street === hereStreet) ? hereStreet : nearest[0].a.street;
    const onStreet = pend.filter(a => a.street === st).sort((x, y) => x.num - y.num);
    const head = nearest.find(x => x.a.street === st);
    const closestAny = order.map(a => ({ a, d: dist(a) })).sort((x, y) => x.d - y.d)[0];
    const atDoneStreet = hereSrc === "gps" && closestAny.d < 60 && closestAny.a.street !== st && order.filter(a => a.street === closestAny.a.street).every(addrDone);
    const row = ({ a, d }) => `<div class="near-row"><div class="m">${d < 1000 ? Math.round(d) + " m" : (d / 1000).toFixed(1) + " km"}</div>
      <div><b>${esc(a.label)}</b><div class="sub">nosso nº ${a.n} · <span class="shp">${shp(a) || "–"}</span> · ${a.pkgs.length} pct · <span class="mono">${a.pkgs.map(p => esc(tail(p.tn))).join(" ")}</span></div></div>
      <div class="acts"><a class="btn" href="${Core.links.waze(a)}" target="_blank" rel="noopener">Waze</a><button type="button" data-a="${esc(a.key)}">Entregue</button></div></div>`;
    $("locOut").innerHTML = `<div class="here">
      ${atDoneStreet ? `<p class="sub">Você está na ${esc(streetName(closestAny.a))}, que já foi concluída.</p>` : ""}
      <div class="sub">Rua com entrega pendente mais perto de você</div>
      <div class="street-now">${esc(streetName(head.a))}</div>
      <div class="dist">${hereSrc === "gps" ? Math.round(head.d) + " m · " : ""}${esc(head.a.bairro)} · faltam ${onStreet.length} endereço${onStreet.length > 1 ? "s" : ""}: nº ${onStreet.map(a => a.num || "?").join(", ")}</div>
      <div class="sub" style="margin-top:4px">Mais perto de você</div>
      ${(hereSrc === "rua" ? onStreet.map(a => ({ a, d: Core.hav(here, a) })).concat(nearest.filter(x => x.a.street !== st)) : nearest).slice(0, 6).map(row).join("")}
    </div>`;
  }
  $("locBtn").addEventListener("click", async () => {
    if (watchId != null) {
      navigator.geolocation.clearWatch(watchId); watchId = null;
      try { await wake?.release(); } catch {} wake = null;
      $("locBtn").textContent = "Ativar localizador"; $("locInfo").textContent = "Localizador desligado.";
      return;
    }
    if (!navigator.geolocation) return void ($("locInfo").textContent = "Este navegador não tem localização. Digite a rua abaixo.");
    $("locInfo").textContent = "Procurando sua localização…";
    watchId = navigator.geolocation.watchPosition(pos => {
      here = { lat: pos.coords.latitude, lng: pos.coords.longitude }; hereSrc = "gps";
      $("locInfo").textContent = `Localização ao vivo (precisão de ${Math.round(pos.coords.accuracy)} m), atualizada às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.`;
      $("locStreet").value = "";
      renderHere();
    }, () => {
      navigator.geolocation.clearWatch(watchId); watchId = null;
      $("locBtn").textContent = "Ativar localizador";
      $("locInfo").textContent = "A localização foi bloqueada aqui. Neste link do claude.ai o navegador não libera o GPS. Digite a rua em que você está, logo abaixo.";
    }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
    $("locBtn").textContent = "Desligar localizador";
    try { wake = await navigator.wakeLock?.request("screen"); } catch {}
  });
  const norm = s => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/^(r|rua|av|avenida)\.?\s+/, "").trim();
  $("locStreet").addEventListener("input", e => {
    const q = norm(e.target.value);
    if (q.length < 3 || !D) return;
    const hit = A.filter(a => norm(streetName(a)).includes(q));
    if (!hit.length) { $("locOut").innerHTML = `<p class="sub">Nenhuma rua da rota tem esse nome.</p>`; return; }
    // Ponto de referência: meio dos endereços dessa rua.
    here = { lat: hit.reduce((t, a) => t + a.lat, 0) / hit.length, lng: hit.reduce((t, a) => t + a.lng, 0) / hit.length }; hereSrc = "rua"; hereStreet = hit[0].street;
    $("locInfo").textContent = `Usando a ${streetName(hit[0])} como referência.`;
    renderHere();
  });

  // ---------- achar pacote ----------
  function showFound(a, tn) {
    if (!a) return;
    $("found").innerHTML = `<div class="hit">
      <div class="big">${a.n}</div>
      <b>${esc(a.label)}</b>
      <div class="sub">${esc(a.bairro)} · <span class="shp">${shp(a) || "–"}</span>${addrDone(a) ? " · já entregue" : ""}</div>
      <div>${a.pkgs.map(p => `<div class="${p.tn === tn ? "" : "sub"}"><b class="mono">${esc(tail(p.tn))}</b> · ${p.shopeeStop != null ? "Shopee " + p.shopeeStop : "sem nº"}${extra(p) ? " · " + esc(extra(p)) : ""}${pkgDone(p) ? " ✓" : ""} <button type="button" data-p="${esc(p.tn)}">${pkgDone(p) ? "Desfazer" : "Entregue"}</button></div>`).join("")}</div>
      <div class="actions"><a class="btn" href="${Core.links.waze(a)}" target="_blank" rel="noopener">Waze</a>${!addrDone(a) && a.pkgs.length > 1 ? `<button type="button" class="primary" data-a="${esc(a.key)}">Entreguei tudo aqui</button>` : ""}</div>
    </div>`;
    buzz(60);
  }
  $("q").addEventListener("input", e => {
    const q = e.target.value.trim();
    if (!D || !q) { $("found").innerHTML = ""; return; }
    if (/^\d{1,3}$/.test(q)) {
      const n = +q, hits = order.filter(a => a.shopeeStops.includes(n));
      $("found").innerHTML = hits.length ? "" : `<p class="sub">A parada ${n} da Shopee não está nesta planilha.</p>`;
      if (hits.length === 1) showFound(hits[0], hits[0].pkgs.find(p => p.shopeeStop === n).tn);
      else if (hits.length > 1) $("found").innerHTML = `<p><b>A parada Shopee ${n} está em ${hits.length} endereços:</b> ${hits.map(a => `nº ${a.n} (${esc(a.label)})`).join(" · ")}</p>`;
      return;
    }
    const m = Core.matchTN(D.pkgs, q);
    if (m.length === 1 && q.replace(/[^A-Za-z0-9]/g, "").length >= 4) showFound(byTn.get(m[0].tn), m[0].tn);
    else $("found").innerHTML = m.length > 1 ? `<p class="sub">${m.length} pacotes terminam assim. Digite mais um caractere.</p>` : q.length >= 4 ? `<p class="sub">Nenhum pacote desta rota termina assim.</p>` : "";
  });

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

  const onCode = (p, read) => {
    if (p) { $("q").value = ""; return showFound(byTn.get(p.tn), p.tn); }
    $("found").innerHTML = `<div class="hit miss"><b>${read.length ? "Este pacote não está nesta rota" : "Não consegui ler o código"}</b><div class="sub">${read.length ? "Código lido: " + esc(read.join(", ")) : "Fotografe só a etiqueta, de perto e com luz, ou digite o final do código."}</div></div>`;
    buzz([200, 80, 200]);
  };
  $("photo").addEventListener("change", async e => {
    const f = e.target.files[0];
    e.target.value = "";
    if (!f || !D) return;
    if (!window.ZXing) return toast("O leitor de código não carregou. Confira a internet.");
    $("found").innerHTML = `<p class="sub">Lendo a etiqueta…</p>`;
    try { const { p, read } = await decodePhoto(f); onCode(p, read); } catch { onCode(null, []); }
  });
  let live = null;
  if (window.ZXing && navigator.mediaDevices?.getUserMedia) $("live").hidden = false;
  $("live").addEventListener("click", async () => {
    if (live) { live.reset(); live = null; $("video").hidden = true; $("live").textContent = "Câmera contínua"; return; }
    live = new ZXing.BrowserMultiFormatReader(zxHints(), 250);
    let last = "", lastAt = 0;
    $("video").hidden = false; $("live").textContent = "Fechar câmera";
    try {
      await live.decodeFromVideoDevice(undefined, $("video"), res => {
        if (!res) return;
        const txt = res.getText();
        if (txt === last && Date.now() - lastAt < 3000) return;
        last = txt; lastAt = Date.now();
        onCode(findPkgByCode(txt), [txt]);
      });
    } catch {
      live?.reset(); live = null; $("video").hidden = true; $("live").textContent = "Câmera contínua";
      toast("A câmera ao vivo não abriu aqui. Use Escanear etiqueta.");
    }
  });

  // ---------- início: o dia salvo só volta se você pedir ----------
  if (D) {
    ok = store.get(okKey(), {});
    derive();
    const pend = D.pkgs.filter(p => !ok[p.tn]).length;
    $("resume").hidden = false;
    $("resume").innerHTML = `<h2>Rota salva</h2><p>${esc(D.at)} · ${D.pkgs.length} pacotes · <b>${pend} pendentes</b></p>
      <div class="actions"><button type="button" class="primary" data-resume="go">Continuar</button><button type="button" class="ghost" data-resume="clear">Começar do zero</button></div>
      <p class="sub">Abrir a planilha desta mesma rota mantém as entregas; a de outra rota começa do zero.</p>`;
  }
})();
