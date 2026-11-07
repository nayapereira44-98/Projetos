// Rota Certa (v2) — app de entrega por endereço com mapa, escaneamento, cronômetro e painel.
// Depende de ../rota-certa/core.js (global Core), Leaflet (global L, mapa) e ZXing (código de barras).
(() => {
  const $ = id => document.getElementById(id);
  // Página antiga guardada no cache do celular com o código novo: os botões travariam. Recarrega uma vez sem cache;
  // se ainda não bater, mostra um aviso para atualizar.
  const NEED = ["nextBar", "proofPhoto", "endMode", "reverse", "autoNav", "saveHome", "setup", "lastRoute", "dataStat", "vehPick", "restoreFile", "trend", "fWear", "hmode", "issueBox", "issueAj", "ind", "opps", "histSum", "histChart", "hist", "fBase", "fOther", "recalcHere", "routeCmp", "finBox"];
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
  let fin = { pay: null, mode: "rota", price: 6.29, kml: 11, km: null, endTime: "18:00", wear: 0.25, fixed: 0, ...store.get("re:fin", {}) };
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
  // Catálogo: todo pacote de toda planilha aberta nos últimos 10 dias, com endereço e parada. Serve para pôr de volta
  // na rota um pacote que já foi baixado no app da Shopee e sumiu da planilha nova.
  let cat = store.get("re:cat", {});
  function catAdd(pkgs) {
    const t = Date.now();
    pkgs.forEach(p => { if (p && p.tn) { const { olat, olng, ...q } = p; cat[p.tn] = { ...q, _t: t }; } });
    const cut = t - 10 * 864e5;
    Object.keys(cat).forEach(k => { if (!(cat[k]._t > cut)) delete cat[k]; });
    try { store.set("re:cat", cat); } catch {}
  }
  const catFind = text => {
    const t = String(text || "").toUpperCase().replace(/\s+/g, "");
    if (!t) return null;
    if (cat[t]) return cat[t];
    const k = Object.keys(cat).find(k => t.includes(k.toUpperCase()) || (t.length >= 4 && k.toUpperCase().endsWith(t)));
    return k ? cat[k] : null;
  };
  // Coloca o pacote de volta na rota (pendente), com o endereço e a parada que ele tinha.
  function putBack(c) {
    const inRoute = all().find(p => p.tn === c.tn);
    if (inRoute) {
      const was = pkgDone(inRoute);
      delete ok[inRoute.tn]; if (D.fail) delete D.fail[inRoute.tn];
      save(); renderAll();
      return { a: byTn.get(inRoute.tn), msg: was ? "Estava como entregue: voltou para a rota" : "Já estava na rota" };
    }
    const { _t, ...q } = c;
    const p = { ...q, back: Date.now() };
    D.extra = (D.extra || []).concat(p);
    delete ok[p.tn]; if (D.fail) delete D.fail[p.tn];
    derive(); plan(nextAddr()?.key); save();
    numberOrder(); fillAjustes(); drawMarkers(false); renderAll();
    return { a: byTn.get(p.tn), msg: "Voltou para a rota" };
  }
  const attempt = p => (seen[p.tn] || []).filter(x => x <= dayOf(D?.createdAt || Date.now())).length || 1;
  const okKey = () => "re:ok:" + D.at, sessKey = () => "re:sess:" + D.at;
  // ---------- Calendário ----------
  // Cada entrega fica guardada com a hora e a ordem (AT) dela, mesmo depois de trocar de planilha. Uma ordem pode
  // começar num dia e terminar no outro: no calendário ela aparece nos dois dias, com "continua" / "continuação".
  let deliv = store.get("re:deliv", {});
  let pay = store.get("re:pay", {});
  const dayKey = t => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const orderName = at => (!at ? "Sem ordem" : /^AT/i.test(at) ? "Ordem …" + String(at).slice(-4) : String(at));
  function syncDeliv() {
    if (!D) return;
    let ch = false;
    const since = D.createdAt || 0;
    all().forEach(p => {
      const t = ok[p.tn], cur = deliv[p.tn];
      if (t && (!cur || cur.t !== t)) {
        deliv[p.tn] = { t, at: p.at || D.at || "", s: p.shopeeStop ?? null, l: byTn.get(p.tn)?.label || p.address || "", src: p.src || null };
        ch = true;
      } else if (!t && cur && !cur.n && cur.t >= since) { delete deliv[p.tn]; ch = true; }
    });
    if (ch) { pruneDeliv(); store.set("re:deliv", deliv); }
  }
  function syncDelivR2() {
    if (!R2) return;
    let ch = false;
    R2.pkgs.forEach(p => {
      const t = R2.ok[p.tn], cur = deliv[p.tn];
      if (t && (!cur || cur.t !== t)) { deliv[p.tn] = { t, at: p.at || "", s: p.shopeeStop ?? null, l: p.address || "", src: p.src || null, n: 1 }; ch = true; }
      else if (!t && cur && cur.n) { delete deliv[p.tn]; ch = true; }
    });
    if (ch) { pruneDeliv(); store.set("re:deliv", deliv); }
  }
  function pruneDeliv() {
    const cut = Date.now() - 400 * 864e5;
    Object.keys(deliv).forEach(k => { if (!(deliv[k].t > cut)) delete deliv[k]; });
  }
  let calMonth = null, calDay = null;
  const MES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const SEM = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  const brl2 = v => "R$ " + (Math.round(v * 100) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // Cor de cada ordem: pela ordem em que ela apareceu (duas ordens do mesmo dia nunca ficam com a mesma cor).
  let calIdx = new Map();
  const calColor = at => ["#0b7285", "#c2255c", "#5f3dc4", "#e67700", "#2b8a3e", "#1864ab", "#862e9c", "#a61e4d"][(calIdx.get(at) ?? 0) % 8];
  function renderCal() {
    const box = $("calBox");
    if (!box) return;
    if (D) syncDeliv();
    const now = new Date();
    if (!calMonth) calMonth = { y: now.getFullYear(), m: now.getMonth() };
    if (!calDay) calDay = dayKey(Date.now());
    const items = Object.entries(deliv).map(([tn, v]) => ({ tn, ...v, d: dayKey(v.t) }));
    calIdx = new Map();
    items.slice().sort((x, y) => x.t - y.t).forEach(it => { if (!calIdx.has(it.at)) calIdx.set(it.at, calIdx.size); });
    const byDay = new Map();
    items.forEach(it => { if (!byDay.has(it.d)) byDay.set(it.d, []); byDay.get(it.d).push(it); });
    // Total da ordem: todos os pacotes dela que o app conhece (entregues em qualquer dia + os da rota aberta).
    const tnsOf = new Map(), daysOf = new Map();
    const addTn = (at, tn) => { if (!tnsOf.has(at)) tnsOf.set(at, new Set()); tnsOf.get(at).add(tn); };
    items.forEach(it => { addTn(it.at, it.tn); if (!daysOf.has(it.at)) daysOf.set(it.at, new Set()); daysOf.get(it.at).add(it.d); });
    if (D) all().forEach(p => addTn(p.at || D.at || "", p.tn));
    const totalOf = new Map([...tnsOf].map(([at, set]) => [at, set.size]));
    // Grade do mês
    const { y, m } = calMonth;
    const first = new Date(y, m, 1), nDays = new Date(y, m + 1, 0).getDate();
    let cells = "";
    for (let i = 0; i < first.getDay(); i++) cells += `<span class="cal-c empty"></span>`;
    for (let d = 1; d <= nDays; d++) {
      const k = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const l = byDay.get(k) || [];
      const ats = [...new Set(l.map(x => x.at))];
      cells += `<button type="button" class="cal-c${l.length ? " has" : ""}${k === dayKey(Date.now()) ? " today" : ""}${k === calDay ? " sel" : ""}" data-calday="${k}"><span class="cal-d">${d}</span>${l.length ? `<b>${l.length}</b><span class="cal-bars">${ats.slice(0, 4).map(at => `<i style="background:${calColor(at)}"></i>`).join("")}</span>` : ""}</button>`;
    }
    const monthItems = items.filter(it => it.d.startsWith(`${y}-${String(m + 1).padStart(2, "0")}`));
    const monthVal = [...new Set(monthItems.map(x => x.at))].reduce((t, at) => t + (pay[at] ? pay[at] * monthItems.filter(x => x.at === at).length / (totalOf.get(at) || 1) : 0), 0);
    // Dia escolhido
    const l = (byDay.get(calDay) || []).sort((a, b) => a.t - b.t);
    const dd = new Date(calDay + "T12:00:00");
    const ats = [...new Set(l.map(x => x.at))];
    let dayVal = 0;
    const blocks = ats.map(at => {
      const li = l.filter(x => x.at === at), tot = totalOf.get(at) || li.length;
      const days = [...(daysOf.get(at) || [])].sort();
      const pos = days.indexOf(calDay);
      const val = pay[at] ? pay[at] * li.length / tot : null;
      if (val) dayVal += val;
      const h = (li[li.length - 1].t - li[0].t) / 3.6e6;
      const tags = [pos > 0 ? `continuação de ${days[pos - 1].slice(8, 10)}/${days[pos - 1].slice(5, 7)}` : "", pos < days.length - 1 ? `continua em ${days[pos + 1].slice(8, 10)}/${days[pos + 1].slice(5, 7)}` : ""].filter(Boolean);
      return `<div class="cal-at" style="border-left-color:${calColor(at)}">
        <div class="cal-at-top"><b>${esc(orderName(at))}</b>${li.some(x => x.n) ? `<span class="chip">Nova rota</span>` : ""}${tags.map(t => `<span class="chip">${t}</span>`).join("")}</div>
        <span class="sub">${esc(at)}</span>
        <div class="cal-nums"><span><b>${li.length}</b> entregues neste dia</span><span><b>${tot}</b> na ordem${items.filter(x => x.at === at).length < tot ? ` (${items.filter(x => x.at === at).length} entregues até agora)` : ""}</span><span><b>${hhmm(li[0].t)}–${hhmm(li[li.length - 1].t)}</b></span></div>
        <label class="cal-pay">Valor pago pela ordem (R$)<input type="number" inputmode="decimal" step="0.01" min="0" data-payat="${esc(at)}" value="${pay[at] ?? ""}" placeholder="ex.: 180"></label>
        ${val != null ? `<div class="cal-val">Neste dia: <b>${brl2(val)}</b>${days.length > 1 ? ` (${li.length} de ${tot} pacotes)` : ""}${h >= 0.25 ? ` · ${brl2(val / h)} por hora` : ""}</div>` : ""}
        <details><summary>Ver os ${li.length} pacotes</summary><div class="cal-list">${li.map(x => `<div><span class="mono">${hhmm(x.t)}</span> <b>${x.src ? esc(PLATFORMS[x.src]?.short || "ML") : "Parada " + esc(x.s ?? "s/n")}</b> · ${esc(x.l || "")} <span class="mono sub">${esc(tail(x.tn))}</span></div>`).join("")}</div></details>
      </div>`;
    }).join("");
    box.innerHTML = `<div class="card cal-card">
        <div class="cal-nav"><button type="button" class="line" data-calm="-1" aria-label="Mês anterior">‹</button><b>${MES[m]} ${y}</b><button type="button" class="line" data-calm="1" aria-label="Próximo mês">›</button></div>
        <div class="cal-sum">${monthItems.length} pacotes entregues no mês${monthVal ? ` · ${brl2(monthVal)}` : ""}</div>
        <div class="cal-grid">${["D", "S", "T", "Q", "Q", "S", "S"].map(s => `<span class="cal-h">${s}</span>`).join("")}${cells}</div>
      </div>
      <div class="card cal-day"><h2>${SEM[dd.getDay()][0].toUpperCase() + SEM[dd.getDay()].slice(1)}, ${dd.getDate()} de ${MES[dd.getMonth()]}</h2>
        ${l.length ? `<div class="cal-tot"><span><b>${l.length}</b> pacotes</span><span><b>${ats.length}</b> ${ats.length > 1 ? "ordens" : "ordem"}</span><span><b>${hhmm(l[0].t)}–${hhmm(l[l.length - 1].t)}</b></span>${dayVal ? `<span><b>${brl2(dayVal)}</b></span>` : ""}</div>${blocks}` : `<p class="sub">Nenhuma entrega neste dia.</p>`}
      </div>`;
  }
  document.addEventListener("change", e => {
    const at = e.target?.dataset?.payat;
    if (at == null) return;
    const v = parseFloat(String(e.target.value).replace(",", "."));
    if (v > 0) pay[at] = v; else delete pay[at];
    store.set("re:pay", pay); renderCal();
  });
  const save = () => { store.set("re:day", D); store.set(okKey(), ok); store.set(sessKey(), sess); try { syncDeliv(); } catch {} };
  const all = () => D.pkgs.concat(D.extra || []);
  // Resolvido = entregue ou com ocorrência (não entregue, com motivo). Só "entregue" conta no faturamento.
  const pkgOk = p => !!ok[p.tn];
  const failOf = p => D?.fail?.[p.tn] || null;
  const pkgDone = p => !!ok[p.tn] || !!failOf(p);
  const addrDone = a => a.pkgs.every(pkgDone);
  const extra = p => p.address.split(",").slice(2).join(",").trim();
  const streetName = a => a.label.split(",")[0].trim();
  const PLATFORMS = {
    shopee: { name: "Shopee", cls: "shp" },
    ml: { name: "Mercado Livre", cls: "ml" },
    outro: { name: "Outro", cls: "other" },
  };
  // Várias rotas (AT) no mesmo dia: cada pacote guarda o AT da planilha; mostramos os 2 últimos caracteres (ex.: "4W").
  const RT_COLORS = ["#0b7285", "#c2255c", "#5f3dc4", "#e67700"];
  const atList = () => (D ? [...new Set(all().filter(p => !p.src).map(p => p.at).filter(Boolean))].sort() : []);
  const multiAt = () => atList().length > 1;
  const atShort = at => String(at || "").slice(-2);
  const atColor = at => RT_COLORS[Math.max(0, atList().indexOf(at)) % RT_COLORS.length];
  const atsOf = a => [...new Set(a.pkgs.filter(p => !p.src).map(p => p.at).filter(Boolean))];
  const rtChip = at => `<span class="chip rt" style="background:${atColor(at)}">Rota ${esc(atShort(at))}</span>`;
  const rtChips = a => ""; // a rota (AT) aparece só pela cor; o número que vale na etiqueta é a parada
  const rtPrefix = p => "";
  // Um número só em todo o app: a parada da Shopee, a mesma da etiqueta. Endereço com 2 paradas: "39+".
  const num = (a, full) => (a.shopeeStops?.length ? (full ? a.shopeeStops.join(" · ") : a.shopeeStops[0] + (a.shopeeStops.length > 1 ? "+" : "")) : a.pkgs.every(p => p.src) ? (PLATFORMS[a.pkgs[0].src]?.short || "ML") : "s/n");
  const srcOf = p => p.src || "shopee";
  const platformsOf = a => [...new Set(a.pkgs.map(srcOf))];
  const pkgLabel = p => (p.src ? PLATFORMS[p.src]?.name || p.src : rtPrefix(p) + (p.shopeeStop != null ? "Parada " + p.shopeeStop : "sem nº de parada"));
  // Próximas paradas pendentes, na ordem do app, a partir da próxima (máximo que o Google Maps aceita num link).
  // Sacos: a entregadora separa os pacotes de 10 em 10 (1–10, 11–20…), pelo número da etiqueta da Shopee ou pelo número da parada no app.
  let bagMode = store.get("re:bag", "shopee");
  const range10 = n => { const s = Math.floor((n - 1) / 10) * 10 + 1; return `${s}–${s + 9}`; };
  const bagOf = (p, a) => {
    if (bagMode === "none") return "";
    if (p.src) return PLATFORMS[p.src]?.name || p.src;
    if (bagMode === "app") return range10((a || byTn.get(p.tn)).n);
    if (bagMode === "area") return "Área " + areaOf(a || byTn.get(p.tn));
    return rtPrefix(p) + (p.shopeeStop != null ? range10(p.shopeeStop) : "sem nº");
  };
  const bagsOf = a => [...new Set(a.pkgs.filter(p => !pkgDone(p)).map(p => bagOf(p, a)).filter(Boolean))];
  const bagChip = a => (bagsOf(a).length && bagMode !== "area" ? `<span class="chip bag">Saco ${bagsOf(a).join(" + ")}</span>` : "");
  function nextLeg(n = 10) {
    if (mode !== "perto" || typeof here === "undefined" || !here) return order.filter(a => !addrDone(a)).slice(0, n);
    const left = pendingList().slice(), out = [];
    let pt = here, area = lastArea(), street = curStreet();
    while (out.length < n && left.length) {
      const b = Core.streetFirst(left, { here: pt, street, area, areaOf });
      out.push(b); left.splice(left.indexOf(b), 1); pt = b; area = areaOf(b); street = b.street;
    }
    return out;
  }
  // Rua em que você está: a do último endereço resolvido (entregue ou com ocorrência) ou a de um endereço a até 80 m.
  function lastDoneAddr() {
    let best = null, t = 0;
    all().forEach(p => { const v = ok[p.tn] || D?.fail?.[p.tn]?.t; if (v > t) { t = v; best = p; } });
    return best ? byTn.get(best.tn) : null;
  }
  function curStreet() {
    const last = lastDoneAddr();
    const h = typeof here !== "undefined" && here ? here : null;
    // A rua do último endereço resolvido vale enquanto você está perto dele (num cruzamento, a casa da transversal
    // pode estar mais perto, mas você está na rua que vinha fazendo).
    if (last && (!h || Core.hav(h, last) <= 300)) return last.street;
    if (h) {
      const at = order.filter(a => Core.hav(h, a) <= 80).sort((x, y) => Core.hav(h, x) - Core.hav(h, y))[0];
      if (at) return at.street;
    }
    return last?.street || null;
  }
  // Pendentes da mesma rua (fora este endereço), em ordem de número.
  const streetLeft = a => order.filter(x => x !== a && x.street && x.street === a.street && !addrDone(x)).sort((x, y) => x.num - y.num);
  const streetLine = a => {
    const l = streetLeft(a); if (!l.length) return "";
    const pk = l.reduce((t, x) => t + x.pkgs.filter(p => !pkgDone(p)).length, 0);
    return `+${pk} pacote${pk > 1 ? "s" : ""} nesta rua (nº ${l.slice(0, 5).map(x => x.nums?.join("/") || x.num).join(", ")}${l.length > 5 ? "…" : ""})`;
  };
  const shopee = a => (a.shopeeStops.length ? "Parada " + a.shopeeStops.join(" · ") : "") + (a.unseq ? (a.shopeeStops.length ? " · " : "") + "sem nº" : "");
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
    if (D?.locked || mode !== "perto" || typeof here === "undefined" || !here) return pend[0];
    const best = Core.streetFirst(pend, { here, street: curStreet(), area: lastArea(), areaOf });
    const cur = curKey && byKey.get(curKey);
    if (cur && pend.includes(cur) && (Core.hav(here, cur) <= 80 || Core.hav(here, cur) - Core.hav(here, best) < 50)) return cur;
    curKey = best.key;
    return best;
  }

  // A pé: até 500 m pelas ruas (linha reta x 1,25). Mais que isso, vai de carro.
  const WALK = 500;
  const walkM = (x, y) => Core.hav(x, y) * 1.25;
  // Áreas: endereços a até X m (padrão e máximo 500) do centro de uma área ficam juntos. Numeradas na ordem da rota e guardadas,
  // para os sacos por área não mudarem durante o dia.
  let areaRadius = Math.min(WALK, store.get("re:areaR", WALK));
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
    pontosCache = null;
  }
  const orderOk = () => D.order && D.order.length === A.length && D.order.every(k => byKey.has(k));

  // Ordem só dos endereços pendentes, a partir de `startKey`; os já entregues ficam na frente.
  // Com o GPS ligado e nenhuma entrega feita (ou pedindo "a partir de onde estou"), a rota sai de onde você está.
  // Endereços com horário ("entrega até 12:00", "após 14h") são encaixados pelo relógio.
  function plan(startKey, fromHere) {
    // Rota salva: a ordem não muda. Endereço novo (planilha somada, pacote adicionado) entra no fim.
    if (D.locked && D.order?.length) {
      const kept = D.order.filter(k => byKey.has(k)), known = new Set(kept);
      const fresh = A.filter(a => !known.has(a.key));
      const freshDone = fresh.filter(addrDone), freshPend = fresh.filter(a => !addrDone(a));
      let add = [];
      if (freshPend.length) {
        const last = byKey.get(kept[kept.length - 1]);
        const s0 = last ? nearestFrom(last, freshPend) : freshPend[0];
        add = Core.addressRoute(freshPend, s0.key, { from: last ? { lat: last.lat, lng: last.lng } : null }).order.map(a => a.key);
      }
      D.order = kept.concat(freshDone.map(a => a.key), add);
      pontosCache = null;
      return;
    }
    const doneA = (orderOk() ? D.order.map(k => byKey.get(k)) : A).filter(addrDone);
    const pend = A.filter(a => !addrDone(a));
    if (!pend.length) { D.order = doneA.map(a => a.key); return; }
    const start = pend.some(a => a.key === startKey) ? startKey : pend.reduce((b, a) => ((a.shopeeStops[0] ?? 1e9) < (b.shopeeStops[0] ?? 1e9) ? a : b)).key;
    const from = here && (fromHere || (!doneA.length && !startKey)) ? { ...here } : null;
    if (from && !D.startPt) D.startPt = { ...from };
    const to = fin.endMode === "casa" && fin.home ? fin.home : fin.endMode === "inicio" ? D.startPt || null : null;
    const now = new Date();
    const perStop = sess.start && doneA.length >= 3 ? (Date.now() - sess.start) / 60000 / doneA.length : 3;
    const r = Core.addressRoute(pend, start, { from, clock: { start: now.getHours() * 60 + now.getMinutes(), stopMin: Math.min(10, Math.max(1.5, perStop)) }, to });
    D.order = doneA.concat(r.order).map(a => a.key);
    if (!D.km) D.km = r.km;
    // Comparação com a ordem da Shopee, pelo mesmo critério de distância.
    const shp = pend.slice().sort((a, b) => (a.shopeeStops[0] ?? 1e9) - (b.shopeeStops[0] ?? 1e9));
    D.cmp = { app: r.km, shopee: Core.seqMeters(shp, from, to), n: pend.length, from: !!from, to: !!to, at: Date.now() };
  }
  function numberOrder() {
    pontosCache = null;
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
  let pendingImport = null;
  function addRoutes() {
    const pi = pendingImport; pendingImport = null; $("scanOverlay").hidden = true;
    if (!pi) return;
    markSeen(pi.pkgs, Date.now());
    D.pkgs = D.pkgs.concat(pi.pkgs);
    derive(); plan(nextAddr()?.key); save(); start(); drawMarkers(true);
    toast(`Rotas somadas: ${atList().map(atShort).join(" + ")} · ${all().length} pacotes`);
  }
  function newDayFrom() {
    const pi = pendingImport; pendingImport = null; $("scanOverlay").hidden = true;
    if (!pi) return;
    const prev = active ? archiveRoute() : null;
    markSeen(pi.pkgs, Date.now());
    D = { at: pi.ats.join("+") || pi.file, file: pi.file, pkgs: pi.pkgs, createdAt: Date.now(), order: null, km: null };
    ok = {}; sess = {}; fin.km = null; store.set("re:fin", fin);
    derive(); plan(null); save(); start();
    location.hash = "#separar";
    toast(prev ? `Rota anterior salva no histórico. Nova: ${pi.pkgs.length} pacotes` : `${A.length} endereços · ${pi.pkgs.length} pacotes`);
  }
  $("file").addEventListener("change", async e => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const { pkgs } = Core.parseRows(await readXlsxFile(f));
      if (!pkgs.length) throw new Error("A planilha não tem pacotes com coordenadas.");
      catAdd(pkgs);
      const ats = [...new Set(pkgs.map(p => p.at).filter(Boolean))].sort();
      const at = ats.length ? ats.join("+") : f.name;
      const dayAts = D ? [...new Set(D.pkgs.map(p => p.at).filter(Boolean))] : [];
      // Planilha de outra AT com o dia em andamento: pergunta antes, para não apagar a rota que já está no carro.
      if (D && active && D.pkgs.length && D.at !== at && !ats.some(x => dayAts.includes(x))) {
        pendingImport = { pkgs, file: f.name, ats };
        $("scanOverlay").hidden = false;
        $("scanSheet").innerHTML = `<div class="addr-big">Planilha de outra rota</div>
          <p>${ats.map(x => `<b>${esc(x)}</b>`).join(" e ")} · ${pkgs.length} pacotes. Hoje você já tem ${dayAts.map(x => `<b>${esc(x)}</b>`).join(" e ")} com ${D.pkgs.length} pacotes.</p>
          <button type="button" class="primary deliver" data-atadd="add">Somar as rotas no mesmo dia</button>
          <button type="button" class="line" data-atadd="new">Começar dia novo só com esta</button>
          <button type="button" class="line" data-close="1">Cancelar</button>`;
        return;
      }
      if (D && (D.at === at || ats.some(x => dayAts.includes(x)))) {
        // Atualiza só as rotas que vieram nesta planilha; as outras rotas do dia ficam como estão.
        const before = new Set(D.pkgs.map(p => p.tn));
        const fresh = pkgs.filter(p => !before.has(p.tn)).length;
        D.pkgs = D.pkgs.filter(p => !ats.includes(p.at)).concat(pkgs); D.file = f.name;
        const newTn = new Set(pkgs.map(p => p.tn)); D.extra = (D.extra || []).filter(p => !newTn.has(p.tn)); derive();
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
        const prev = active ? archiveRoute() : null;
        markSeen(pkgs, Date.now());
        D = { at, file: f.name, pkgs, createdAt: Date.now(), order: null, km: null };
        if (prev) setTimeout(() => toast(`Rota anterior salva no histórico (${prev.p} pacotes). Nova rota: ${pkgs.length} pacotes`), 2700);
        ok = {}; sess = {}; fin.km = null; store.set("re:fin", fin);
        derive(); plan(null); save(); start();
        location.hash = "#separar";
        toast(`${A.length} endereços · ${pkgs.length} pacotes`);
      }
    } catch (err) {
      toast(err.message || "Não consegui ler a planilha.");
    } finally { e.target.value = ""; }
  });

  function start() {
    active = true;
    catAdd(all());
    $("resume").hidden = true;
    numberOrder();
    fillAjustes();
    if (!location.hash || location.hash === "#inicio") location.hash = "#mapa";
    ensureLoad();
    route(); renderAll();
    if (map) { drawMarkers(true); }
    renderIssues(); checkAddresses();
  }

  // ---------- abas ----------
  const TABS = ["mapa", "lista", "separar", "voltar", "nova", "cal", "painel", "ajustes"];
  let listDone = false;
  // Barra "Próxima parada" nas abas Paradas, Painel e Ajustes: entregar ou navegar sem voltar para o mapa.
  function renderNextBar() {
    const bar = $("nextBar");
    const tab = location.hash.slice(1);
    const a = active ? nextAddr() : null;
    if (!a || tab === "mapa" || tab === "separar" || tab === "voltar" || tab === "nova" || tab === "cal" || !TABS.includes(tab)) { bar.hidden = true; return; }
    const pend = a.pkgs.filter(p => !pkgDone(p)).length;
    const app = navAppNow() || "waze";
    bar.hidden = false;
    bar.innerHTML = `<button type="button" class="nb-info" data-sel="${esc(a.key)}"><span class="nb-n">${num(a)}</span><span class="nb-t"><b>${esc(a.label)}</b><small>${pend} pacote${pend > 1 ? "s" : ""}${zoneOf(a) ? " · carga " + zoneOf(a).code : ""}${streetLine(a) ? " · " + esc(streetLine(a)) : ""}</small></span></button>
      <a class="btn line nb-go" href="${NAVS[app](a)}" target="_blank" rel="noopener">Ir</a>
      <button type="button" class="primary nb-ok" data-a="${esc(a.key)}">Entreguei</button>`;
  }
  function route() {
    let tab = location.hash.slice(1);
    if (tab === "lista") tab = "separar"; // Paradas e Organizar viraram uma aba só
    if (!active && tab !== "nova" && tab !== "cal") tab = "inicio";
    else if (!TABS.includes(tab)) tab = "mapa";
    if (tab === "nova") renderNova();
    if (tab === "cal") renderCal();
    ["inicio", ...TABS].forEach(t => ($("v-" + t).hidden = t !== tab));
    document.querySelectorAll(".tabbar a").forEach(a => (a.dataset.tab === tab ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
    if (tab === "mapa") { ensureMap(); setTimeout(() => map?.invalidateSize(), 50); }
    renderNextBar();
  }
  window.addEventListener("hashchange", route);

  function renderAll() {
    if (!active) return;
    numberOrder();
    computeEtas();
    const done = all().filter(pkgDone).length;
    $("meta").textContent = `${order.filter(addrDone).length}/${order.length} paradas · ${done}/${all().length} pacotes`;
    $("bar").hidden = false; $("barFill").style.width = (done / all().length * 100).toFixed(1) + "%";
    renderTimer();
    renderSheet();
    renderList();
    renderSep();
    renderBack();
    renderPainel();
    renderNextBar();
    if (map) updateMarkers();
    document.querySelectorAll(".modes").forEach(m => (m.hidden = !!D.locked));
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

  // ---------- Pontos: onde estacionar o carro e fazer a pé ----------
  // Na rua: você para o carro num lugar e entrega a pé tudo que está a até 300 m. Se o próximo endereço fica a até
  // 500 m, mas de carro seria uma volta grande (contramão: pelas ruas dá mais de 2,5 vezes a distância a pé), ele
  // também entra no mesmo Ponto. Os Pontos são montados quando você salva a rota e não mudam até o fim.
  const PARK = 300, PARK_MAX = 500, WALK_MPM = 70; // 70 m por minuto a pé (≈ 4,2 km/h)
  // Endereço comercial (ou com horário para entregar): vai primeiro na rota.
  const COMM_RE = /\b(loja|lj|comercial|com[eé]rcio|empresa|escrit[oó]rio|sala\s*\d+|conjunto\s*\d+|ltda|eireli|mercado|supermercado|mercearia|minimercado|oficina|cl[ií]nica|consult[oó]rio|farm[aá]cia|drogaria|restaurante|lanchonete|padaria|confeitaria|academia|sal[aã]o\s+de|barbearia|pet\s?shop|galp[aã]o|ind[uú]stria|f[aá]brica|dep[oó]sito|shopping|hor[aá]rio\s+comercial|recep[cç][aã]o|cnpj|hospital|laborat[oó]rio|escola|col[eé]gio|hotel|distribuidora|transportadora|imobili[aá]ria|ag[eê]ncia|ateli[eê]|studio|est[uú]dio|papelaria|autope[cç]as|borracharia|lavanderia|a[cç]ougue|sorveteria|pizzaria|bar\s+e|loteria|cart[oó]rio|prefeitura|unidade|cooperativa)\b/i;
  // Referências ("ao lado da clínica", "perto do posto", "próximo ao colégio") não fazem o endereço ser comercial.
  const LANDMARK_RE = /\b(ao\s+lado|lado|perto|pr[oó]ximo|em\s+frente|frente|atr[aá]s|esquina|vizinh[oa]|depois|antes|ref\.?|refer[eê]ncia)\b[^,;]*/gi;
  const pkgText = p => [p.address, p.compl, p.obs].filter(Boolean).join(" ").replace(LANDMARK_RE, " ");
  const isComm = a => a.pkgs.some(p => COMM_RE.test(pkgText(p)) || p.window?.until);
  const commChip = a => (isComm(a) ? `<span class="chip comm">${a.pkgs.some(p => COMM_RE.test(pkgText(p))) ? "Comercial" : "Com horário"}</span>` : "");
  let pontosCache = null;
  function getPontos() {
    if (pontosCache) return pontosCache;
    const out = [], inP = new Set();
    (D?.pontos || []).forEach(g => {
      const list = g.keys.map(k => byKey.get(k)).filter(Boolean);
      if (!list.length) return;
      list.forEach(a => inP.add(a.key));
      out.push({ id: g.keys[0], list, park: byKey.get(g.park) || list[0], drive: g.drive, contra: g.contra || [] });
    });
    // Endereços sem Ponto (rota ainda não salva, ou pacote novo depois de salvar): agrupa pela ordem, até 300 m.
    const rest = order.filter(a => !inP.has(a.key));
    const extraP = [];
    let cur = null;
    rest.forEach(a => {
      if (!cur || walkM(cur.park, a) > PARK) { cur = { id: a.key, list: [], park: a, drive: null, contra: [] }; extraP.push(cur); }
      cur.list.push(a);
    });
    pontosCache = D?.pontos?.length ? out.concat(extraP) : extraP;
    pontosCache.forEach((g, i) => (g.n = i + 1));
    return pontosCache;
  }
  function carOfAddr(a) { const cs = getPontos(), i = cs.findIndex(g => g.list.includes(a)); return { g: cs[i], i }; }
  const pontoOf = a => carOfAddr(a).g;
  // Quanto tempo o Ponto economiza: ir de carro de porta em porta (manobra e estacionar 1,5 min cada) contra ir a pé.
  function pontoInfo(g) {
    const others = g.list.filter(x => x !== g.park);
    const walkMin = others.reduce((t, x) => t + 2 * walkM(g.park, x) / WALK_MPM, 0);
    let driveMin = 0;
    for (let i = 1; i < g.list.length; i++) driveMin += g.drive?.[i - 1] != null ? g.drive[i - 1] / 60 : walkM(g.list[i - 1], g.list[i]) * 1.4 / 330;
    driveMin += 1.5 * others.length;
    return { walkMin: Math.round(walkMin), saved: Math.round(driveMin - walkMin), far: others.length ? Math.max(...others.map(x => walkM(g.park, x))) : 0 };
  }
  const streetOf = a => streetName(a) || a.label;
  function pontoHead(g, a) {
    const pend = g.list.filter(x => !addrDone(x));
    const left = g.list.reduce((t, x) => t + leftOf(x), 0);
    const inf = pontoInfo(g);
    const contra = g.list.filter(x => g.contra.includes(x.key));
    return `<div class="ponto-head"><div class="ph-top"><b>Ponto ${g.n}</b><span>${pend.length} endereço${pend.length === 1 ? "" : "s"} · faltam ${left} pacote${left === 1 ? "" : "s"}</span></div>
      ${g.list.length > 1 ? `<div class="ph-park">🅿️ Estacione na <b>${esc(streetOf(g.park))}</b>${g.park.nums?.length ? `, perto do nº ${esc(g.park.nums[0])}` : ""}, e faça ${g.list.length - 1 > 1 ? `os outros ${g.list.length - 1} endereços` : "o outro endereço"} a pé (até ${fmtDist(inf.far)}).${inf.walkMin ? ` ~${inf.walkMin} min a pé ida e volta` : ""}${inf.saved >= 1 ? `, <b>ganha ~${inf.saved} min</b> em vez de manobrar o carro.` : "."}</div>` : `<div class="ph-park">🅿️ Estacione na <b>${esc(streetOf(g.park))}</b>.</div>`}
      ${contra.length ? `<div class="ph-contra">${contra.map(x => esc(x.label)).join(", ")}: de carro seria uma volta grande (contramão). Vá a pé.</div>` : ""}
      ${a && a !== g.park && !addrDone(g.park) ? "" : `<a class="btn line sm" href="${Core.links.waze(g.park)}" target="_blank" rel="noopener">Waze até onde estacionar</a>`}</div>`;
  }

  // ---------- cartão do endereço ----------
  // Pacote: a parada da Shopee em destaque e o final do código BR, como na etiqueta.
  const pkgBtn = (p, a, tn) => `<button type="button" class="pkg${pkgDone(p) ? " done" : ""}${p.tn === tn ? " me" : ""}" data-p="${esc(p.tn)}" aria-pressed="${pkgDone(p)}">
        <span class="box">${pkgDone(p) ? ICON_CHECK : ""}</span>
        <span class="t"><b class="stp">${p.src ? esc(PLATFORMS[p.src]?.name || p.src) : p.shopeeStop != null ? "Parada " + p.shopeeStop : "sem nº"}</b> · <b>${esc(tail(p.tn))}</b>${failOf(p) ? ` · <span class="att">não entregue: ${esc(failOf(p).r)}</span>` : ""}${!pkgDone(p) ? (isChecked(p) ? ` · <span class="chk on">conferido</span>` : ` · <span class="chk">não conferido</span>`) : ""}${p.window ? ` · <span class="att">${p.window.until ? "até " + esc(p.window.until) : "após " + esc(p.window.after)}</span>` : ""}${attempt(p) > 1 ? ` · <span class="att">${attempt(p)}ª tentativa</span>` : ""}${extra(p) ? `<br><span class="sub">${esc(extra(p))}</span>` : ""}</span></button>`;
  const leftOf = x => x.pkgs.filter(p => !pkgDone(p)).length;
  // O cartão mostra o Ponto inteiro: onde estacionar, o endereço da vez e os outros que dá para fazer a pé.
  function carroBox(a, tn, part) {
    const { g } = carOfAddr(a);
    const list = g ? g.list : [a];
    const others = list.filter(x => x !== a && !addrDone(x)), doneA = list.filter(x => x !== a && addrDone(x));
    const blk = x => `<div class="cx${x === a ? " here" : ""}"><div class="cx-top">${x === a ? `<span class="cx-tag">AQUI</span>` : `<span class="cx-tag far">${fmtDist(walkM(a, x))} a pé</span>`}<b>${esc(x.label)}</b>${commChip(x)}</div>
      <div class="pkgs">${x.pkgs.map(p => pkgBtn(p, x, tn)).join("")}</div>
      ${x !== a ? `<button type="button" class="line" data-sel="${esc(x.key)}">Ir para este endereço</button>` : ""}</div>`;
    if (part === "rest") return others.length || doneA.length ? `<div class="carro"><div class="eyebrow">Também a pé daqui (Ponto ${g.n})</div>${others.map(blk).join("")}
      ${doneA.length ? `<div class="sub">Já entregues neste Ponto: ${doneA.map(x => esc(x.label)).join(" · ")}</div>` : ""}</div>` : "";
    return `<div class="carro">${g ? pontoHead(g, a) : ""}${blk(a)}</div>`;
  }
  // Para o cartão fechado: o Ponto e quantos endereços ainda dá para fazer a pé dali.
  function carroChip(a) {
    const { g } = carOfAddr(a);
    if (!g) return "";
    const others = g.list.filter(x => x !== a && !addrDone(x));
    const n = others.reduce((t, x) => t + leftOf(x), 0);
    return `<span class="chip car">Ponto ${g.n}${others.length ? ` · +${others.length} a pé (${n} pct)` : ""}</span>`;
  }
  function addrCard(a, tn) {
    const nx = nextAddr();
    const pend = a.pkgs.filter(p => !pkgDone(p));
    return `
      <div class="eyebrow">${a === nx ? (mode === "perto" && here ? "Mais perto de você" : "Próxima parada") : "Endereço"} · ${order.filter(x => !addrDone(x)).length} endereços faltando${addrDone(a) ? " · entregue" : ""}</div>
      <div class="bigstop">Parada ${esc(num(a, true))}</div>
      <div><div class="addr-big">${esc(a.label)}</div><div class="sub">${esc([a.bairro, ...new Set(a.pkgs.map(p => String(p.cep || "").replace(/\D/g, "")).filter(c => c.length === 8).map(c => "CEP " + c.slice(0, 5) + "-" + c.slice(5)))].filter(Boolean).join(" · "))}</div></div>
      ${issues.has(a.key) ? `<button type="button" class="issue-bar" data-issues="1"><b>Conferir endereço</b><span>${esc([issues.get(a.key).pin, issues.get(a.key).cep].filter(Boolean).join(" "))}</span></button>` : ""}
      ${a.pkgs.some(p => D.fix?.[p.tn]) ? `<button type="button" class="line" data-fixundo="${esc(a.key)}">Posição corrigida por você · voltar à da planilha</button>` : ""}
      ${streetLine(a) ? `<div class="streetline big">${esc(streetLine(a))}. Faça a rua inteira antes de sair.</div>` : ""}
      <div class="chips">${commChip(a)}${etaChip(a)}${navText(a)}${rtChips(a)}<span class="chip">${a.pkgs.length} pacote${a.pkgs.length > 1 ? "s" : ""}</span>${platformsOf(a).filter(k => k !== "shopee").map(k => `<span class="chip ${PLATFORMS[k]?.cls || "other"}">${esc(PLATFORMS[k]?.name || k)}</span>`).join("")}${addrDone(a) ? `<span class="chip ok">Entregue</span>` : ""}${a.pkgs.some(p => p.window) ? `<span class="chip warn">${a.pkgs.map(p => p.window).filter(Boolean).map(w => (w.until ? "até " + w.until : "após " + w.after)).join(" · ")}</span>` : ""}</div>
      ${platformsOf(a).length > 1 ? `<div class="together">Neste endereço tem entrega de ${platformsOf(a).map(k => PLATFORMS[k]?.name || k).join(" e ")}: ${platformsOf(a).map(k => `${a.pkgs.filter(p => srcOf(p) === k).length} ${PLATFORMS[k]?.name || k}`).join(", ")}.</div>` : ""}
      ${a.unseq ? `<div class="offroute">${a.unseq} pacote${a.unseq > 1 ? "s" : ""} <b>sem nº de parada</b>: no app da Shopee fica no topo da lista.</div>` : ""}
      ${carroBox(a, tn)}
      <div class="nav3">
        <a class="btn" href="${Core.links.waze(a)}" target="_blank" rel="noopener">Waze</a>
        <a class="btn" href="${Core.links.gmaps(a)}" target="_blank" rel="noopener">Google</a>
        <a class="btn" href="${Core.links.apple(a)}" target="_blank" rel="noopener">Apple</a>
      </div>
      ${a === nx && nextLeg().length > 1 ? `<a class="btn brand" href="${Core.links.gmapsLeg(nextLeg())}" target="_blank" rel="noopener">Próximas ${nextLeg().length} paradas no Google Maps (para o carro)</a>` : ""}
      ${pend.length && !(D.later || []).includes(a.key) ? `<button type="button" class="line" data-later="${esc(a.key)}">Ninguém atendeu: voltar depois</button>` : ""}
      ${(D.later || []).includes(a.key) && pend.length ? `<div class="offroute">Você marcou para voltar depois. Este endereço está no fim da fila.</div>` : ""}
      ${pend.length ? `<button type="button" class="primary deliver" data-a="${esc(a.key)}">Entreguei ${pend.length > 1 ? `os ${pend.length} pacotes` : "aqui"}</button>
        <button type="button" class="line" data-fail="${esc(a.key)}">Não consegui entregar</button>` : `<button type="button" class="line" data-a="${esc(a.key)}">${a.pkgs.some(pkgOk) ? "Desfazer entrega" : "Desfazer ocorrência"}</button>`}
      ${carroBox(a, tn, "rest")}
      ${proofBox(a)}
      ${!sess.start ? `<button type="button" class="brand" data-start="1">Iniciar entregas (contar o tempo)</button>` : ""}`;
  }

  // Da parada anterior (ou de onde você está) até esta: a pé até 500 m, senão de carro.
  function walkChip(a) {
    const i = order.indexOf(a), from = here || (i > 0 ? order[i - 1] : null);
    if (!from || addrDone(a)) return "";
    const m = walkM(from, a);
    return m <= WALK ? `<span class="chip ok">a pé · ${fmtDist(m)}</span>` : `<span class="chip">de carro · ${fmtDist(m)}</span>`;
  }

  // ---------- Salvar a rota ----------
  // 1) Começa pela rua mais perto de onde você está (GPS).
  // 2) Endereços comerciais ou com horário (e os vizinhos a até 300 m deles) vão primeiro.
  // 3) Monta os Pontos (onde estacionar) com as distâncias reais pelas ruas, quando o servidor de rotas responde.
  // Depois de salva, a ordem não muda mais: o carro foi arrumado por ela. Pacote novo entra no fim.
  async function osrmLegs(list) {
    // Distância e tempo de carro entre cada endereço e os 8 seguintes, em blocos (o servidor aceita até 100 pontos).
    const res = new Map();
    for (let s = 0; s < list.length; s += 72) {
      const blk = list.slice(s, s + 80);
      if (blk.length < 2) break;
      const url = `https://router.project-osrm.org/table/v1/driving/${blk.map(a => `${a.lng.toFixed(6)},${a.lat.toFixed(6)}`).join(";")}?annotations=distance,duration`;
      const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 9000);
      try {
        const j = await (await fetch(url, { signal: ctl.signal })).json();
        if (j.code !== "Ok") throw new Error(j.code);
        blk.forEach((a, i) => { for (let k = i + 1; k < Math.min(blk.length, i + 9); k++) res.set(a.key + ">" + blk[k].key, { d: j.distances[i][k], t: j.durations[i][k] }); });
      } finally { clearTimeout(tm); }
    }
    return res;
  }
  function makePontos(ord, M) {
    const P = []; let cur = null;
    ord.forEach((a, i) => {
      if (cur) {
        const w = walkM(cur.parkA, a);
        let fits = w <= PARK, contra = false;
        const dr = M?.get(cur.parkA.key + ">" + a.key);
        if (!fits && w <= PARK_MAX && dr && dr.d > 2.5 * w) { fits = true; contra = true; }
        if (fits) { cur.keys.push(a.key); if (contra) cur.contra.push(a.key); const lg = M?.get(ord[i - 1].key + ">" + a.key); cur.drive.push(lg ? lg.t : null); return; }
      }
      cur = { parkA: a, park: a.key, keys: [a.key], contra: [], drive: [] };
      P.push(cur);
    });
    return P.map(({ parkA, ...g }) => g);
  }
  let locking = false;
  async function lockRoute() {
    if (locking || !active) return;
    if (!here) {
      startGps(false);
      $("lockBox").innerHTML = `<p class="sub">Ligando a localização para saber por qual rua começar…</p>`;
      for (let i = 0; i < 16 && !here; i++) await new Promise(r => setTimeout(r, 500));
      if (!here) { toast("Sem localização: a rota começa pela parada 1 da Shopee. Libere a localização para começar perto de você."); }
    }
    locking = true;
    $("lockBox").innerHTML = `<p class="sub">Montando a rota e os Pontos…</p>`;
    try {
      const pend = A.filter(a => !addrDone(a));
      const from = here ? { lat: here.lat, lng: here.lng } : null;
      const comm = pend.filter(isComm);
      const first = (pt, list) => (pt ? nearestFrom(pt, list) : list.reduce((b, a) => ((a.shopeeStops[0] ?? 1e9) < (b.shopeeStops[0] ?? 1e9) ? a : b)));
      const run = (list, pt) => (list.length ? Core.addressRoute(list, first(pt, list).key, { from: pt }).order : []);
      // Rota normal a partir de onde você está; depois, em cada região (trecho sem salto maior que 1,5 km),
      // os comerciais e os vizinhos a até 300 m deles vão para o começo da região. Assim o comércio vem primeiro
      // sem atravessar a cidade de um lado para o outro.
      const base = run(pend, from);
      const regions = [];
      base.forEach((a, i) => { if (!i || Core.hav(base[i - 1], a) > 1500) regions.push([]); regions[regions.length - 1].push(a); });
      let ord = [], pri = 0, entry = from;
      regions.forEach(reg => {
        const cm = reg.filter(isComm);
        const p1 = reg.filter(a => isComm(a) || cm.some(c => walkM(c, a) <= PARK));
        const p2 = reg.filter(a => !p1.includes(a));
        const part = p1.length && p2.length ? (() => { const o1 = run(p1, entry || reg[0]); return o1.concat(run(p2, o1[o1.length - 1])); })() : reg;
        pri += p1.length; ord = ord.concat(part); entry = part[part.length - 1];
      });
      let M = null;
      try { M = await osrmLegs(ord); } catch { M = null; }
      D.order = A.filter(addrDone).map(a => a.key).concat(ord.map(a => a.key));
      D.pontos = makePontos(ord, M);
      D.locked = { at: Date.now(), from, pri, comm: comm.length, start: ord[0] ? streetOf(ord[0]) : "", osrm: !!M };
      D.loaded = {};
      pontosCache = null; curKey = null; selKey = null;
      if (mode !== "rota") { mode = "rota"; store.set("re:mode", mode); document.querySelectorAll("[data-mode]").forEach(b => b.classList.toggle("on", b.dataset.mode === mode)); }
      save(); numberOrder(); if (map) drawMarkers(false); renderAll();
      toast(`Rota salva: ${getPontos().length} Pontos. Comece pela ${D.locked.start}.`);
    } finally { locking = false; renderSep(); }
  }
  function unlockRoute() { if (!D) return; D.locked = null; D.pontos = null; D.loaded = {}; pontosCache = null; }

  // ---------- aba Organizar ----------
  // Duas visões: "Por endereço" (os pacotes de cada endereço, Ponto por Ponto, para conferir) e "Carregar o carro"
  // (de trás para frente: o que você entrega por último vai primeiro, no fundo; a 1ª entrega fica mais perto de você).
  let sepBy = store.get("re:sepBy2", "end");
  const stopsTxt = list => {
    const s = [...new Set(list.flatMap(a => a.pkgs.filter(p => !p.src).map(p => p.shopeeStop)).filter(v => v != null))].sort((x, y) => x - y);
    const o = list.flatMap(a => a.pkgs.filter(p => p.src)).length, sn = list.flatMap(a => a.pkgs.filter(p => !p.src && p.shopeeStop == null)).length;
    return [s.join(", "), sn ? "sem nº" : "", o ? o + " ML/outro" : ""].filter(Boolean).join(" · ");
  };
  function renderLock() {
    const box = $("lockBox");
    if (!box || !active || locking) return;
    if (!D.locked) {
      box.innerHTML = `<div class="lock-off"><b>Rota ainda não salva</b><span>Ligue a localização onde você vai começar e toque abaixo. O app começa pela rua mais perto de você, coloca comércio primeiro e diz onde estacionar. Depois disso a ordem não muda mais.</span>
        <button type="button" class="primary big" data-lock="1">Salvar a rota a partir de onde estou</button></div>`;
      return;
    }
    const L = D.locked, ps = getPontos();
    box.innerHTML = `<div class="lock-on"><b>✓ Rota salva às ${hhmm(L.at)}</b><span>Começa na <b>${esc(L.start || "")}</b> · ${ps.length} Pontos${L.comm ? ` · ${L.comm} endereço${L.comm > 1 ? "s" : ""} comercia${L.comm > 1 ? "is" : "l"} primeiro` : ""}${L.osrm ? "" : " · distâncias estimadas (sem servidor de rotas)"}</span>
      <span class="sub">A ordem fica igual até o fim, porque o carro foi arrumado por ela. Pacote novo entra no fim.</span>
      <button type="button" class="line sm" data-unlock="1">Refazer a rota (só antes de arrumar o carro)</button></div>`;
  }
  function renderSep() {
    const box = $("sepList");
    if (!box || !active) return;
    renderLock();
    const pk = all().filter(p => !pkgDone(p)), got = pk.filter(isChecked).length;
    $("sepHead").innerHTML = `<b>${got} de ${pk.length} conferidos</b><span>${pk.length - got ? `faltam ${pk.length - got}` : "tudo conferido ✓"}</span>`;
    $("sepBar").style.width = (pk.length ? got / pk.length * 100 : 100).toFixed(0) + "%";
    document.querySelectorAll("[data-sepby]").forEach(b => b.classList.toggle("on", b.dataset.sepby === sepBy));
    const q = ($("sepQ").value || "").trim().toUpperCase();
    const ps = getPontos();
    const nrm = x => String(x || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    const hit = p => !q || (/^\d{1,3}$/.test(q) ? p.shopeeStop === +q : p.tn.toUpperCase().includes(q) || nrm(byTn.get(p.tn)?.label).includes(nrm(q)));
    const tk = p => `<button type="button" class="tk${isChecked(p) ? " on" : ""}${pkgDone(p) ? " gone" : ""}" data-sepchk="${esc(p.tn)}">${isChecked(p) ? ICON_CHECK : ""}<b>${p.src ? esc(PLATFORMS[p.src]?.short || "ML") : esc(p.shopeeStop ?? "s/n")}</b><span class="mono">${esc(tail(p.tn))}</span></button>`;
    $("sepIdxWrap").hidden = sepBy !== "end";
    let html = "";
    if (sepBy === "end") {
      // Índice: número da etiqueta → Ponto.
      const idx = [];
      ps.forEach(g => g.list.forEach(a => a.pkgs.forEach(p => { if (!pkgDone(p) && hit(p)) idx.push({ p, g }); })));
      idx.sort((x, y) => (x.p.src ? 1 : 0) - (y.p.src ? 1 : 0) || atList().indexOf(x.p.at) - atList().indexOf(y.p.at) || (x.p.shopeeStop ?? 9999) - (y.p.shopeeStop ?? 9999));
      const seenIdx = new Set();
      $("sepIdx").innerHTML = idx.filter(({ p, g }) => { const k = (p.src ? p.tn : (p.at || "") + (p.shopeeStop ?? p.tn)) + "|" + g.n; if (seenIdx.has(k)) return false; seenIdx.add(k); return true; })
        .map(({ p, g }) => `<button type="button" class="tile${isChecked(p) ? " on" : ""}" data-sepgo="${g.n}"${multiAt() && p.at && !p.src ? ` style="box-shadow: inset 0 -4px 0 ${atColor(p.at)}"` : ""}><b>${p.src ? esc(PLATFORMS[p.src]?.short || "ML") : esc(p.shopeeStop ?? "s/n")}</b><span>P${g.n}</span></button>`).join("");
      ps.forEach(g => {
        const rows = g.list.map(a => ({ a, ps: a.pkgs.filter(p => hit(p) && (q || !pkgDone(p))) })).filter(r => r.ps.length);
        if (!rows.length) return;
        const n = rows.reduce((t, r) => t + r.ps.length, 0);
        html += `<div class="grp" id="grp-${g.n}"><div class="car-head"><b>Ponto ${g.n}</b><span>${esc(streetOf(g.park))} · ${rows.length} endereço${rows.length > 1 ? "s" : ""} · ${n} pacote${n > 1 ? "s" : ""}</span></div>
          ${rows.map(({ a, ps: pp }) => `<div class="pr2"><div class="pr2-top"><button type="button" class="pr2-a" data-sel="${esc(a.key)}">${esc(a.label)}</button>${commChip(a)}${a.pkgs.some(p => p.window) ? `<span class="chip warn">${a.pkgs.map(p => p.window).filter(Boolean).map(w => (w.until ? "até " + w.until : "após " + w.after)).join(" · ")}</span>` : ""}</div>
            <small>${esc([a.bairro, ...new Set(a.pkgs.map(p => String(p.cep || "").replace(/\D/g, "")).filter(c => c.length === 8).map(c => "CEP " + c.slice(0, 5) + "-" + c.slice(5)))].filter(Boolean).join(" · "))}${a.pkgs.length > 1 ? ` · <b>${a.pkgs.length} pacotes juntos</b>` : ""}</small>
            <div class="pr-pk">${pp.map(tk).join("")}</div></div>`).join("")}</div>`;
      });
    } else {
      // Carregar o carro, na ordem da entrega: a 1ª entrega fica na frente (perto de você) e as últimas, no fundo.
      const pend = ps.filter(g => g.list.some(a => !addrDone(a)));
      const L = D.loaded || {};
      const nL = pend.filter(g => L[g.id]).length;
      html += `<div class="card load-help"><b>Como arrumar o carro</b><span>A lista está na ordem da entrega. O <b>1º</b> é a <b>1ª entrega</b> e fica <b>na frente</b>, mais perto de você. Os últimos da lista vão <b>no fundo</b> (porta-malas). ${D.locked ? "" : "<b>Salve a rota antes</b>, para a ordem não mudar depois de arrumar."}</span><span class="sub">${nL} de ${pend.length} Pontos no carro</span></div>`;
      html += `<div class="load-end near">FRENTE · PERTO DE VOCÊ · 1ª ENTREGA</div>`;
      pend.forEach((g, i) => {
        const pp = g.list.flatMap(a => a.pkgs.filter(p => !pkgDone(p) && hit(p)));
        if (!pp.length) return;
        html += `<div class="ld${L[g.id] ? " on" : ""}"><button type="button" class="ld-chk" data-ldchk="${esc(g.id)}" aria-pressed="${!!L[g.id]}">${L[g.id] ? ICON_CHECK : ""}</button>
          <div class="ld-b"><div class="ld-top"><span class="ld-n">${i + 1}ª entrega</span><b>Ponto ${g.n}</b><span>${i === 0 ? "na frente" : i === pend.length - 1 ? "no fundo" : ""}</span></div>
          <small>${esc(streetOf(g.park))}${g.list.length > 1 ? ` + ${g.list.length - 1} a pé` : ""} · ${pp.length} pacote${pp.length > 1 ? "s" : ""} · etiquetas ${esc(stopsTxt(g.list))}</small>
          <div class="pr-pk">${pp.map(tk).join("")}</div></div></div>`;
      });
      html += `<div class="load-end">FUNDO DO CARRO · ÚLTIMAS ENTREGAS</div>`;
    }
    box.innerHTML = html || `<p class="empty-list">${q ? `Nada com "${esc(q)}".` : "Nada para organizar."}</p>`;
  }
  $("sepQ")?.addEventListener("input", renderSep);

  // ---------- aba Voltar: pacote que saiu da planilha volta para a rota ----------
  function backResult(items) {
    // items: [{ text, c, res }]
    $("backOut").innerHTML = items.map(({ text, c, res }) => res
      ? `<div class="bk ok"><b>${esc(res.msg)}</b><span>Parada ${esc(num(res.a, true))} · Ponto ${carOfAddr(res.a).g?.n ?? "?"}</span><span>${esc(res.a.label)}</span><span class="mono">${esc(c.tn)}</span><button type="button" class="line" data-sel="${esc(res.a.key)}">Ver no mapa</button></div>`
      : `<div class="bk no"><b>${text ? "Não achei este pacote nas planilhas dos últimos dias" : "Não consegui ler o código"}</b>${text ? `<span class="mono">${esc(text)}</span><span>Coloque o endereço à mão e ele entra na rota.</span><button type="button" class="primary" data-backadd="${esc(text)}">Digitar o endereço</button>` : `<span>Fotografe só a etiqueta, de perto e com luz. Ou digite o código abaixo.</span>`}</div>`).join("");
    renderBack();
  }
  function renderBack() {
    const l = $("backList");
    if (!l || !active) return;
    const b = (D.extra || []).filter(p => p.back);
    l.hidden = !b.length;
    l.innerHTML = b.length ? `<h2>Voltaram para a rota hoje (${b.length})</h2>` + b.map(p => { const a = byTn.get(p.tn); return `<div class="bk${pkgDone(p) ? " done" : ""}"><b>${p.shopeeStop != null ? "Parada " + p.shopeeStop : "sem nº"} · <span class="mono">${esc(tail(p.tn))}</span>${pkgDone(p) ? " · entregue" : ""}</b><span>${esc(a?.label || p.address || "")}</span><button type="button" class="line" data-rmextra="${esc(p.tn)}">Tirar da rota</button></div>`; }).join("") : "";
  }
  const onBack = async e => {
    const files = [...e.target.files];
    e.target.value = "";
    if (!files.length) return;
    if (!active) return toast("Abra a planilha da rota antes.");
    if (!window.ZXing) return toast("O leitor de código não carregou. Confira a internet.");
    const items = [];
    for (let i = 0; i < files.length; i++) {
      $("backOut").innerHTML = `<p class="sub">Lendo etiqueta ${i + 1} de ${files.length}…</p>`;
      try {
        const { p, read } = await decodePhoto(files[i]);
        const text = p ? p.tn : read[0] || "";
        const c = p || read.map(catFind).find(Boolean) || null;
        items.push({ text, c, res: c ? putBack(c) : null });
      } catch { items.push({ text: "", c: null, res: null }); }
    }
    buzz(items.every(x => x.res) ? 60 : [200, 80, 200]);
    backResult(items);
  };
  $("photoBack").addEventListener("change", onBack);
  $("photoBackMany").addEventListener("change", onBack);
  $("backGo").addEventListener("click", () => {
    if (!active) return toast("Abra a planilha da rota antes.");
    const text = $("backCode").value.trim().toUpperCase();
    if (text.length < 4) return toast("Digite o código BR ou pelo menos o final dele.");
    const c = all().find(p => p.tn.toUpperCase().endsWith(text) || text.includes(p.tn.toUpperCase())) || catFind(text);
    backResult([{ text, c, res: c ? putBack(c) : null }]);
    $("backCode").value = "";
  });
  function renderSheet() {
    const sh = $("sheet");
    let a = selKey && byKey.get(selKey);
    if (!a) a = nextAddr();
    if (!a) {
      sh.innerHTML = `<div class="grabwrap"><span class="grab"></span></div><div class="addr-big">Rota concluída</div>
        <p class="sub">${all().length} pacotes em ${order.length} endereços${sess.start && !sess.end ? ` em ${dur(Date.now() - sess.start)}` : ""}.</p>
        <button type="button" class="primary deliver" data-finish="1">Encerrar a rota e começar outra</button>
        <a class="btn line" href="#painel">Ver o painel desta rota</a>`;
      return;
    }
    sh.classList.toggle("open", sheetOpen);
    if (!sheetOpen) {
      const pend = a.pkgs.filter(p => !pkgDone(p));
      sh.innerHTML = `<button type="button" class="grabwrap" data-grab="1" aria-label="Abrir o cartão"><span class="grab"></span></button>
        <div class="mini${here && a === nextAddr() && Core.hav(here, a) < 60 ? " arrived" : ""}">
          <span class="mini-n ${a.pkgs.length > 1 ? "multi" : ""}">${num(a)}</span>
          <button type="button" class="mini-body" data-grab="1">
            <b>${esc(a.label)}</b>
            <span class="chips">${issues.has(a.key) ? `<span class="chip warn">Conferir endereço</span>` : ""}${carroChip(a)}${commChip(a)}${navText(a)}${rtChips(a)}${a.pkgs.length > 1 ? `<span class="chip count">${a.pkgs.length} pacotes</span>` : ""}${shopee(a) ? `<span class="chip shp">${shopee(a)}</span>` : ""}${platformsOf(a).filter(k => k !== "shopee").map(k => `<span class="chip ${PLATFORMS[k]?.cls || "other"}">${esc(PLATFORMS[k]?.name || k)}</span>`).join("")}</span>
            <span class="mono sub">${a.pkgs.map(p => (pkgDone(p) ? "✓" : "") + esc(tail(p.tn))).join(" · ")}</span>
            ${streetLine(a) ? `<span class="streetline">${esc(streetLine(a))}</span>` : ""}
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
    if (map || !active) return;
    if (!window.L) { $("map").innerHTML = `<div class="map-fail"><b>O mapa não carregou (sem internet?)</b><span>A rota continua funcionando: use a aba Organizar e os botões Waze e Google.</span><button type="button" class="primary" onclick="location.reload()">Tentar de novo</button><a class="btn line" href="#separar">Abrir Organizar</a></div>`; return; }
    map = L.map("map", { zoomControl: false });
    map.on("click", onMapPin);
    // Afastado (cidade inteira), as etiquetas "P" dos Pontos se amontoam: só aparecem com o mapa mais perto.
    const zf = () => $("map").classList.toggle("zfar", map.getZoom() < 15);
    map.on("zoomend", zf); setTimeout(zf, 0);
    map.on("dragstart", () => { if (here) { follow = false; $("btnRecenter").hidden = false; } });
    if (window.ResizeObserver) new ResizeObserver(() => map.invalidateSize()).observe($("map"));
    const sheetH = () => $("v-mapa").style.setProperty("--sheet-h", ($("sheet").hidden ? 0 : $("sheet").offsetHeight) + "px");
    if (window.ResizeObserver) new ResizeObserver(sheetH).observe($("sheet"));
    sheetH();
    // Mapa do OpenStreetMap; se os quadros falharem (servidor lento ou bloqueado), troca para o mapa da Esri.
    let tileErr = 0;
    const osm = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
    osm.on("tileerror", () => {
      if (++tileErr !== 6) return;
      map.removeLayer(osm);
      L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "© Esri, OpenStreetMap" }).addTo(map);
    });
    drawMarkers(true);
    startGps(true);
    document.querySelectorAll("[data-mode]").forEach(b => b.classList.toggle("on", b.dataset.mode === mode));
  }
  function pinHtml(a) {
    const nx = nextAddr(), up = upcoming();
    const cls = addrDone(a) ? "done" : a === nx ? "next" : !up.includes(a) ? "far" : a.pkgs.length > 1 ? "multi" : "";
    const left = a.pkgs.filter(p => !pkgDone(p)).length;
    const size = cls === "next" ? 46 : cls === "far" ? 26 : 34;
    const ring = multiAt() && atsOf(a)[0] ? ` style="border:3px solid ${atColor(atsOf(a)[0])}"` : "";
    return L.divIcon({ className: "", html: `<div class="pin ${cls}${a.key === selKey ? " sel" : ""}"${ring}>${addrDone(a) ? "✓" : num(a)}${left > 1 ? `<span class="cnt">${left}</span>` : ""}</div>`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
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
    drawPontos();
  }
  // No mapa, cada Ponto: "P" onde estacionar, um círculo com o que dá para fazer a pé e linhas pontilhadas até cada
  // endereço. Só os próximos 8 Pontos, para não poluir.
  let pontoLayer = null;
  function drawPontos() {
    pontoLayer?.remove(); pontoLayer = null;
    if (!map || !window.L || !D) return;
    pontoLayer = L.layerGroup().addTo(map);
    getPontos().filter(g => g.list.some(a => !addrDone(a))).slice(0, 8).forEach((g, i) => {
      const P = [g.park.lat, g.park.lng];
      const walk = g.list.filter(x => x !== g.park && !addrDone(x));
      if (walk.length) {
        const r = Math.max(45, ...walk.map(x => Core.hav(g.park, x))) + 20;
        L.circle(P, { radius: r, color: "#1c7ed6", weight: 1.5, opacity: i ? 0.45 : 0.8, dashArray: "4 6", fillColor: "#1c7ed6", fillOpacity: i ? 0.03 : 0.08, interactive: false }).addTo(pontoLayer);
        walk.forEach(x => L.polyline([P, [x.lat, x.lng]], { color: g.contra.includes(x.key) ? "#e8590c" : "#1c7ed6", weight: 2.5, opacity: 0.8, dashArray: "1 6", lineCap: "round", interactive: false }).addTo(pontoLayer));
      }
      L.marker(P, { icon: L.divIcon({ className: "", html: `<div class="pk-pin${i ? "" : " cur"}">P${g.n}${walk.length ? `<small>+${walk.length} a pé</small>` : ""}</div>`, iconSize: [60, 24], iconAnchor: [30, 46] }), zIndexOffset: 1800, interactive: false }).addTo(pontoLayer);
    });
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
    const planned = mode === "rota" ? pendingList()[0] : null;
    if (!done && !sess.start) { sess = { start: Date.now() }; toast("Cronômetro iniciado"); }
    a.pkgs.forEach(p => { if (done) { delete ok[p.tn]; if (D.fail) delete D.fail[p.tn]; } else if (!failOf(p)) ok[p.tn] = ok[p.tn] || Date.now(); });
    save();
    if (!done) {
      buzz(60);
      selKey = null; sheetOpen = false; curKey = null;
      // Na ordem da rota: entregou fora da ordem (passou por outro endereço antes)? A rota é refeita dali,
      // sem voltar. Não refaz quando os sacos seguem o número da parada do app, para não trocar os sacos.
      if (planned && planned !== a && bagMode !== "app") { plan(null, !!here); numberOrder(); if (map) drawMarkers(false); }
      const nx = nextAddr();
      renderAll();
      if (nx) {
        const sl = streetLeft(a).length && nx.street === a.street;
        toast(sl ? `Entregue! Ainda nesta rua: ${nx.label}` : `Entregue! Próxima: ${nx.label}`);
        autoNav(nx);
        if (map) { if (here) { follow = true; frame(); } else map.panTo([nx.lat, nx.lng]); }
        updateNav(true);
      }
      else { toast("Todos os pacotes entregues!"); setTimeout(() => { if (active && all().every(pkgDone)) openFinish(); }, 900); }
    } else renderAll();
  }
  document.addEventListener("click", e => {
    const t = e.target.closest("button, [data-sel]");
    if (e.target.id === "scanOverlay") { $("scanOverlay").hidden = true; return; }
    if (!t) return;
    const d = t.dataset;
    if (d.bip) return void openBip(d.bip === "nova" || d.bip === "conferir" ? d.bip : "rota");
    if (d.calday) { calDay = d.calday; return void renderCal(); }
    if (d.calm) { const dt = new Date(calMonth.y, calMonth.m + +d.calm, 1); calMonth = { y: dt.getFullYear(), m: dt.getMonth() }; return void renderCal(); }
    if (d.chkon) { D.checked = D.checked || {}; D.checked[d.chkon] = Date.now(); save(); renderSep(); t.outerHTML = `<span class="chip ok">✓ conferido agora</span>`; return; }
    if (d.backput) { const c = catFind(d.backput); if (c) { const r = putBack(c); t.outerHTML = `<span class="chip ok">${esc(r.msg)}</span>`; } return; }
    if (d.lock) return void lockRoute();
    if (d.unlock) return twoTap(t, () => { unlockRoute(); save(); numberOrder(); if (map) drawMarkers(false); renderAll(); toast("Rota liberada. Salve de novo a partir de onde você vai começar."); });
    if (d.sepby) { sepBy = d.sepby; store.set("re:sepBy2", sepBy); return void renderSep(); }
    if (d.ldchk) { D.loaded = D.loaded || {}; D.loaded[d.ldchk] ? delete D.loaded[d.ldchk] : (D.loaded[d.ldchk] = Date.now()); save(); return void renderSep(); }
    if (d.r2ok) return void r2Deliver(d.r2ok, true);
    if (d.r2undo) return void r2Deliver(d.r2undo, false);
    if (d.r2rm) { R2.pkgs = R2.pkgs.filter(p => p.tn !== d.r2rm); delete R2.ok[d.r2rm]; R2.order = null; r2Save(); return void renderNova(); }
    if (d.r2re) { R2.order = null; r2Plan(true); r2Save(); renderNova(); return void toast("Nova rota refeita a partir de onde você está"); }
    if (d.r2clear) return twoTap(t, () => { R2 = null; store.set("re:r2", null); renderNova(); toast("Nova rota apagada"); });
    if (d.r2manual != null) { if (bip) closeBip(); openAdd(); addDraft.src = "shopee"; addDraft.code = d.r2manual; addDraft.target = "r2"; openAdd(true); return; }
    if (d.bipclose) return void closeBip();
    if (d.biptorch) return void bipTorch();
    if (d.resume === "go") { derive(); ok = store.get(okKey(), {}); sess = store.get(sessKey(), {}); start(); return; }
    if (d.resume === "clear" || t.id === "clear") return twoTap(t, clearDay);
    if (d.importGo) return void runImport();
    if (d.atadd === "add") return void addRoutes();
    if (d.atadd === "new") return void newDayFrom();
    if (d.veh) return setVehicle(d.veh);
    if (d.backup) return backupData();
    if (d.restorego) return restoreGo();
    if (d.close) { $("scanOverlay").hidden = true; return; }
    if (!active) return;
    if (d.a) { deliverAddr(byKey.get(d.a)); if (t.closest("#scanSheet")) $("scanOverlay").hidden = true; }
    else if (d.p) {
      const tn = d.p;
      if (!ok[tn] && !sess.start) sess = { start: Date.now() };
      if (D.fail?.[tn]) delete D.fail[tn];
      else ok[tn] ? delete ok[tn] : (ok[tn] = Date.now());
      save(); renderAll();
      if (ok[tn] && all().every(pkgDone)) setTimeout(() => { if (active && all().every(pkgDone)) openFinish(); }, 900);
      if (t.closest("#scanSheet")) openScan(byTn.get(tn), tn);
    }
    else if (d.sel) { $("scanOverlay").hidden = true; select(d.sel); }
    else if (d.mode) setMode(d.mode);
    else if (d.sepgo) $("grp-" + d.sepgo)?.scrollIntoView({ block: "start" });
    else if (d.sepprint) window.print();
    else if (d.sepchk) {
      D.checked = D.checked || {};
      D.checked[d.sepchk] ? delete D.checked[d.sepchk] : (D.checked[d.sepchk] = Date.now());
      save(); renderSep(); renderList(); buzz(30);
    }
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
      $("scanOverlay").hidden = true;
      selKey = null; save(); renderAll();
      const nx = nextAddr(); if (nx && map) map.panTo([nx.lat, nx.lng]);
      toast("Endereço movido para o fim. Siga para a próxima.");
    }
    else if (d.add) openAdd();
    else if (d.backadd != null) { if (bip) closeBip(); openAdd(); addDraft.src = "shopee"; addDraft.code = d.backadd; openAdd(true); }
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
    else if (d.fail) openFail(d.fail);
    else if (d.failr) { const i = d.failr.indexOf("::"); failGo(d.failr.slice(0, i), d.failr.slice(i + 2)); }
    else if (d.who) { const i = d.who.indexOf("::"), k = d.who.slice(0, i), w = d.who.slice(i + 2); D.proof = D.proof || {}; D.proof[k] = { ...(D.proof[k] || {}), who: D.proof[k]?.who === w ? null : w }; save(); renderSheet(); }
    else if (d.load) openLoad();
    else if (d.listdone) { listDone = !listDone; renderList(); }
    else if (d.loadredo) { ensureLoad(true); renderAll(); openLoad(); toast("Ordem de carga refeita pela rota atual"); }
    else if (d.voice) voiceAddr();
    else if (d.fixuse) { const [key, which] = d.fixuse.split("::"); const it = issues.get(key); applyFix(key, it && it[which], t.dataset.lbl); }
    else if (d.fixok) { D.fixOk = { ...(D.fixOk || {}), [d.fixok]: 1 }; issues.delete(d.fixok); save(); renderAll(); renderIssues(); openIssues(); toast("Endereço mantido como está"); }
    else if (d.fixpin) { pinFix = d.fixpin; $("scanOverlay").hidden = true; location.hash = "#mapa"; $("maptip").hidden = false; $("maptip").textContent = "Toque no mapa onde fica este endereço"; sheetOpen = false; renderSheet(); }
    else if (d.fixundo) { const a = byKey.get(d.fixundo); if (a) { a.pkgs.forEach(p => delete D.fix?.[p.tn]); derive(); plan(nextAddr()?.key); save(); numberOrder(); drawMarkers(false); renderAll(); toast("Posição original de volta"); } }
    else if (d.per) { histPer = +d.per; store.set("re:per", histPer); renderPainel(); }
    else if (d.hmode) { histMode = d.hmode; store.set("re:hmode", histMode); renderHist(); }
    else if (d.finish) openFinish();
    else if (d.finishgo) { $("scanOverlay").hidden = true; finishRoute(); }
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
  // Guarda a rota atual no histórico (se teve entrega). Sem cronômetro, o início é a hora da primeira entrega.
  function archiveRoute() {
    if (!D) return null;
    const times = all().map(p => ok[p.tn]).filter(Boolean);
    if (!times.length) return null;
    if (!sess.start) sess.start = Math.min(...times);
    if (!sess.end) sess.end = Math.max(Date.now(), ...times);
    const rec = todayRec();
    hist = hist.filter(r => r.id !== rec.id).concat(rec);
    store.set("re:hist", hist); save();
    return rec;
  }
  function openFinish() {
    const s = stats(), left = all().filter(p => !pkgDone(p)).length;
    $("scanOverlay").hidden = false;
    const allDone = !left;
    const per = (v, d) => (d ? brl(v / d) : "–");
    $("scanSheet").innerHTML = `<div class="addr-big" id="finishView">${allDone ? "Rota concluída! Feche a rota" : "Encerrar a rota?"}</div>
      <p class="sub">Ficha da rota: confira e salve no histórico.</p>
      <div class="wf">
        ${s.gain != null ? `<div><span>Bruto da rota${s.gM && s.gS ? ` <small>Shopee ${brl(s.gS)} · Mercado Livre ${brl(s.gM)}</small>` : ""}</span><b>${brl(s.gain)}</b></div>` : ""}
        <div><span>Pacotes entregues <small>${s.gain != null ? per(s.gain, s.doneP) + " por pacote" : ""}${left ? ` · faltam ${left}` : ""}</small></span><b>${s.doneP} de ${all().length}</b></div>
        ${s.fails ? `<div><span>Ocorrências <small>${esc(Object.entries(all().filter(failOf).reduce((m, p) => ((m[failOf(p).r] = (m[failOf(p).r] || 0) + 1), m), {})).map(([r, n]) => `${r} (${n})`).join(" · "))}</small></span><b>${s.fails}</b></div>` : ""}
        <div><span>Km rodados <small>${s.kmSrc}${s.gain != null && s.km ? " · " + per(s.gain, s.km) + " de bruto por km" : ""}</small></span><b>${n1(s.km)} km</b></div>
        <div><span>Tempo <small>${s.hours > 0.25 ? n1(s.doneP / s.hours) + " pacotes por hora" : ""}</small></span><b>${sess.start ? dur((sess.end || Date.now()) - sess.start) : "–"}</b></div>
        <div class="minus"><span>Combustível <small>${n1(s.liters)} L a ${brl(fin.price)}</small></span><b>− ${brl(s.fuel)}</b></div>
        ${s.wear ? `<div class="minus"><span>Desgaste do veículo <small>${brl(fin.wear)} por km</small></span><b>− ${brl(s.wear)}</b></div>` : ""}
        ${s.fixed ? `<div class="minus"><span>Custos fixos do dia</span><b>− ${brl(s.fixed)}</b></div>` : ""}
        ${s.other ? `<div class="minus"><span>Outros gastos</span><b>− ${brl(s.other)}</b></div>` : ""}
        <div class="sum"><span>Custo operacional <small>${s.km ? per(s.cost, s.km) + " por km" : ""}</small></span><b>${brl(s.cost)}</b></div>
        ${s.gain != null ? `<div class="total ${s.profit >= 0 ? "good" : "bad"}"><span>Líquido <small>margem ${pctTxt(s.gain ? s.profit / s.gain : null)} · ${per(s.profit, s.doneP)} por pacote</small></span><b>${brl(s.profit)}</b></div>` : `<div><span>Informe quanto a rota paga em Painel → Valores do dia para ver bruto e líquido.</span></div>`}
      </div>
      <div class="form"><label for="finKm" class="full">Km do painel do carro (opcional, mais preciso que a estimativa)<input id="finKm" type="number" inputmode="decimal" step="0.1" placeholder="${n1(s.km)}"></label></div>
      ${left ? `<p class="offroute">Ainda ${left > 1 ? `faltam ${left} pacotes` : "falta 1 pacote"}. Eles não entram como entregues.</p>` : ""}
      <p class="sub">A rota vai para o Comparativo de rotas e dias no Painel, e o app volta para abrir a próxima planilha.</p>
      <button type="button" class="primary" data-finishgo="1">Fechar a rota e salvar no histórico</button>
      <button type="button" class="line" data-close="1">${allDone ? "Agora não" : "Continuar nesta rota"}</button>`;
    $("finKm").addEventListener("input", e => {
      const v = parseFloat(String(e.target.value).replace(",", "."));
      fin.km = isFinite(v) && v > 0 ? v : null; store.set("re:fin", fin); $("fKm").value = fin.km ?? "";
      const keep = e.target.value; openFinish(); $("finKm").value = keep; $("finKm").focus();
    });
  }
  // Encerrar a rota toda: salva no histórico, limpa a rota e volta para abrir a próxima planilha.
  // O valor que a plataforma paga fica; km digitado e outros gastos voltam a zero.
  function finishRoute() {
    const rec = archiveRoute();
    fin.km = null; fin.other = null; store.set("re:fin", fin);
    $("fKm").value = ""; $("fOther").value = "";
    issues = new Map();
    clearDay(); renderHome(); renderData();
    toast(rec ? `Rota salva: ${rec.p} pacotes, líquido ${brl(rec.l)}. Abra a próxima planilha.` : "Rota encerrada. Abra a próxima planilha.");
  }

  // ---------- lista ----------
  function renderList() {
    const q = $("q").value.trim();
    // Entregues saem da lista (ficam guardados no fim, num botão), para a tela mostrar só o que falta.
    let rows = q || listDone ? order : order.filter(a => !addrDone(a));
    if (q) {
      const norm = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
      if (/^\d{1,3}$/.test(q)) rows = order.filter(a => a.shopeeStops.includes(+q));
      else {
        const m = new Set(Core.matchTN(all(), q).map(p => byTn.get(p.tn)));
        rows = order.filter(a => m.has(a) || norm(a.label).includes(norm(q)));
      }
    }
    const rtIdx = a => atList().indexOf(atsOf(a)[0] ?? "");
    rows = rows.slice().sort((x, y) => rtIdx(x) - rtIdx(y) || (areaOf(x) || 0) - (areaOf(y) || 0) || x.n - y.n);
    const nx = nextAddr();
    let html = "";
    for (let i = 0; i < rows.length;) {
      let j = i; while (j < rows.length && rows[j].street === rows[i].street && areaOf(rows[j]) === areaOf(rows[i]) && rtIdx(rows[j]) === rtIdx(rows[i]) && rows[j].n - rows[i].n === j - i) j++;
      const g = rows.slice(i, j), pk = g.reduce((t, a) => t + a.pkgs.length, 0), left = g.filter(a => !addrDone(a)).length;
      if (multiAt() && (i === 0 || rtIdx(g[0]) !== rtIdx(rows[i - 1]))) {
        const at = atsOf(g[0])[0], pk = all().filter(p => p.at === at && !p.src);
        if (at) html += `<div class="rt-head" style="background:${atColor(at)}"><b>${esc(at)}</b><span>faltam ${pk.filter(p => !pkgDone(p)).length} de ${pk.length} pacotes</span></div>`;
      }
      if (areaOf(g[0]) !== areaOf(rows[i - 1]) || (multiAt() && rtIdx(g[0]) !== rtIdx(rows[i - 1]))) {
        const inA = order.filter(a => areaOf(a) === areaOf(g[0]));
        const leftA = inA.filter(a => !addrDone(a));
        html += `<div class="area-head"><b>Área ${areaOf(g[0])}</b><span>${leftA.reduce((t, a) => t + a.pkgs.filter(p => !pkgDone(p)).length, 0)} pacotes faltando · ${leftA.length}/${inA.length} endereços</span></div>`;
      }
      html += `<div class="street"><div class="street-head"><b>${esc(streetName(g[0]))}</b><span>${esc(g[0].bairro)} · ${pk} pct${left ? ` · faltam ${left}` : " · feita"}</span></div>
        ${g.map(a => `<button type="button" class="row${addrDone(a) ? " done" : ""}${a === nx ? " next" : ""}" data-sel="${esc(a.key)}">
          <span class="n">${addrDone(a) ? "✓" : num(a)}</span>
          <span><span class="num">${a.nums?.length ? "nº " + a.nums.join(" / ") : esc(a.label)}</span><br><span class="sub">${[shopee(a), ...platformsOf(a).filter(k => k !== "shopee").map(k => PLATFORMS[k]?.name || k)].filter(Boolean).join(" · ") || "fora da rota"}${a.pkgs.some(p => attempt(p) > 1) ? " · <b class=\"att\">nova tentativa</b>" : ""}${issues.has(a.key) ? " · <b class=\"att\">conferir endereço</b>" : ""}${zoneOf(a) ? " · carga " + zoneOf(a).code : ""}${etaMap.has(a.key) && !addrDone(a) ? " · ~" + hm(etaMap.get(a.key)) : ""}${a.pkgs.some(failOf) ? " · <b class=\"att\">ocorrência</b>" : ""} · <span class="mono">${a.pkgs.map(p => esc(tail(p.tn))).join(" ")}</span></span></span>
          <span class="count">${a.pkgs.length}${bagsOf(a).length ? `<br><small>${bagsOf(a).join("+")}</small>` : ""}${!addrDone(a) ? `<br><small class="${checkedOf(a) === a.pkgs.length ? "chk on" : "chk"}">📷 ${checkedOf(a)}/${a.pkgs.length}</small>` : ""}</span></button>`).join("")}</div>`;
      i = j;
    }
    const leg = nextLeg();
    $("legBtn").hidden = leg.length < 2;
    if (leg.length > 1) { $("legBtn").href = Core.links.gmapsLeg(leg); $("legBtn").textContent = `Próximas ${leg.length} paradas no Google Maps`; }
    const pend = all().filter(p => !pkgDone(p)), got = pend.filter(isChecked).length;
    $("checkBox").innerHTML = pend.length ? `<div class="top" style="display:flex;justify-content:space-between;gap:8px;align-items:baseline"><b>Conferência na separação</b><span class="sub">${got} de ${pend.length} conferidos${got < pend.length ? ` · faltam ${pend.length - got}` : " · tudo conferido ✓"}</span></div>
      <div class="bar" style="background:var(--line)"><i style="width:${(got / pend.length * 100).toFixed(0)}%;background:${got === pend.length ? "var(--ok)" : "var(--brand)"}"></i></div>
      <div class="nav3" style="grid-template-columns:1fr 1fr"><label class="btn brand" for="photoMany">Fotografar pacotes</label><button type="button" class="line" data-checkview="1">Ver o que falta</button></div>` : "";
    const doneN = order.filter(addrDone).length;
    $("list").innerHTML = (html || (q ? `<p class="empty-list">Nada encontrado para "${esc(q)}".</p>` : `<p class="empty-list">Tudo entregue nesta rota.</p>`))
      + (doneN && !q ? `<button type="button" class="line" data-listdone="1">${listDone ? "Esconder" : "Mostrar"} os entregues (${doneN})</button>` : "");
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
    const doneA = order.filter(addrDone).length, doneP = all().filter(pkgOk).length, fails = all().filter(failOf).length;
    const leftA = order.length - doneA;
    const perAddr = doneA ? elapsed / doneA : null;
    const pkgsPerAddr = all().length / order.length;
    const finish = perAddr && !sess.end ? Date.now() + perAddr * leftA : null;
    const kmEst = +(((D.km || 0) / 1000) + (fin.base || 0)).toFixed(1);
    const kmGps = sess.trk ? +(sess.trk.m / 1000).toFixed(1) : 0;
    const km = fin.km != null ? fin.km : kmGps >= 1 ? kmGps : kmEst;
    const kmSrc = fin.km != null ? "informado por você" : kmGps >= 1 ? "medido pelo GPS" : "estimado: rota" + (fin.base ? " + ida e volta do CD" : "");
    const doneBy = k => all().filter(p => pkgOk(p) && srcOf(p) === k).length;
    const pS = doneBy("shopee"), pM = doneBy("ml"), pO = doneBy("outro");
    const gS = fin.pay ? (fin.mode === "pacote" ? fin.pay * pS : fin.pay) : 0;
    const gM = fin.payMl || 0;
    const gain = fin.pay || fin.payMl ? gS + gM : null;
    const liters = fin.kml > 0 ? km / fin.kml : 0;
    const fuel = fin.price ? liters * fin.price : 0;
    const other = fin.other || 0;
    // Custo operacional: combustível + desgaste do veículo por km + custos fixos do dia + outros gastos.
    const wear = (fin.wear || 0) * km, fixed = fin.fixed || 0;
    const cost = fuel + wear + fixed + other;
    const profit = gain != null ? gain - cost : null;
    const hours = elapsed / 3.6e6;
    return { elapsed, doneA, doneP, leftA, perAddr, pkgsPerAddr, finish, km, kmEst, kmGps, kmSrc, liters, gain, gS, gM, pS, pM, pO, fuel, wear, fixed, other, cost, profit, hours, fails };
  }
  // A rota de hoje no formato do histórico.
  function todayRec() {
    const s = stats();
    return {
      id: D.at + sess.start, t: sess.start, at: D.at, p: s.doneP, a: s.doneA, total: all().length, ms: s.elapsed,
      km: s.km, kmEst: s.kmEst, kmGps: s.kmGps, fuel: +s.fuel.toFixed(2), wear: +s.wear.toFixed(2), fixed: s.fixed, other: s.other, g: s.gain || 0, l: s.profit || 0,
      gS: s.gS, gM: s.gM, pS: s.pS, pM: s.pM, pO: s.pO,
      later: (D.laterEver || []).length, att2: all().filter(p => pkgOk(p) && attempt(p) > 1).length,
      fails: s.fails, failBy: all().filter(failOf).reduce((m, p) => ((m[failOf(p).r] = (m[failOf(p).r] || 0) + 1), m), {}),
    };
  }
  function renderSession() {
    const s = stats();
    $("session").innerHTML = !sess.start
      ? `<h2>Pronto para começar?</h2><p>Toque quando sair para a primeira entrega. O app conta o tempo e monta o seu painel.</p><button type="button" data-start="1">Iniciar entregas</button>`
      : !sess.end
        ? `<div class="eyebrow" style="color:inherit;opacity:.85">Entregando desde ${hhmm(sess.start)}</div><div class="clock">${clock(s.elapsed)}</div><button type="button" class="stop" data-end="1">Finalizar entregas</button><button type="button" class="ghost" data-finish="1">Encerrar a rota e começar outra</button>`
        : `<div class="eyebrow" style="color:inherit;opacity:.85">Entregas de ${hhmm(sess.start)} às ${hhmm(sess.end)}</div><div class="clock">${dur(s.elapsed)}</div><button type="button" class="stop" data-finish="1">Encerrar a rota e começar outra</button><button type="button" class="ghost" data-reopen="1">Retomar cronômetro</button>`;
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
          ${s.wear ? `<div class="minus"><span>Desgaste do veículo <small>${brl(fin.wear)} por km</small></span><b>− ${brl(s.wear)}</b></div>` : ""}
          ${s.fixed ? `<div class="minus"><span>Custos fixos do dia</span><b>− ${brl(s.fixed)}</b></div>` : ""}
          ${s.other ? `<div class="minus"><span>Outros gastos</span><b>− ${brl(s.other)}</b></div>` : ""}
          <div class="sum"><span>Custo operacional <small>${s.km ? brl(s.cost / s.km) + " por km" : ""}</small></span><b>${brl(s.cost)}</b></div>
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

    renderTrend();
    renderHist();
  }

  // ---------- tendência e projeção ----------
  function spark(pts, ma) {
    if (pts.length < 2) return "";
    const v = pts.slice(-20).map(p => p.v), m = ma.slice(-20);
    const lo = Math.min(...v, ...m), hi = Math.max(...v, ...m), W = 120, H = 34, span = hi - lo || 1;
    const xy = (arr) => arr.map((y, i) => `${(i / (arr.length - 1) * W).toFixed(1)},${(H - 3 - (y - lo) / span * (H - 6)).toFixed(1)}`).join(" ");
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" aria-hidden="true"><polyline class="sp-raw" points="${xy(v)}"/><polyline class="sp-ma" points="${xy(m)}"/></svg>`;
  }
  function renderTrend() {
    if (!hist.length) { $("trend").innerHTML = `<p class="sub">A tendência aparece com as rotas fechadas. Para começar já com dados, registre rotas anteriores no Comparativo.</p>`; return; }
    const mp = Core.monthProjection(hist), be = Core.breakEven(hist, { fixed: fin.fixed || 0 }), sm = Core.summarize(hist);
    const tiles = [
      [brl(mp.net), `líquido de ${mp.month} até agora · ${mp.days} dia${mp.days === 1 ? "" : "s"}, ${mp.routes} rota${mp.routes === 1 ? "" : "s"}`, mp.net >= 0 ? "good" : "bad"],
      [mp.projected != null ? brl(mp.projected) : "–", `projeção de ${mp.month} no ritmo atual`],
      [mp.perDay != null ? brl(mp.perDay) : "–", "líquido médio por dia trabalhado"],
      [sm.costPerKm != null ? brl(sm.costPerKm) : "–", "custo operacional por km rodado"],
    ];
    const FMT = { kmPerPkg: v => n1(v, 2) + " km" };
    const fmt = (k, v) => (v == null ? "–" : (FMT[k] || brl)(v));
    const ST = { melhorando: ["up", "▲ Melhorando"], piorando: ["down", "▼ Piorando"], estavel: ["flat", "= Estável"], poucos: ["flat", "Poucas rotas"] };
    const tr = Core.trend(hist);
    $("trend").innerHTML = `<div class="grid2">${tiles.map(([b, l, c]) => `<div class="kpi ${c || ""}"><b>${b}</b><span>${l}</span></div>`).join("")}</div>
      ${be ? `<p class="be"><b>Ponto de equilíbrio:</b> uma rota média de ${n1(be.km)} km custa ${brl(be.perRoute)} para rodar (${be.perPkg != null ? brl(be.perPkg) + " por pacote" : ""}). Abaixo disso, a rota dá prejuízo. Cada km a mais custa ${brl(be.varCost)} de combustível e desgaste.</p>` : ""}
      <div class="trows">${tr.map(m => `<div class="trow">
          <span class="tn">${m.name}</span>
          <small class="tsub">agora <b>${fmt(m.k, m.recent ?? m.last)}</b>${m.before != null ? " · antes " + fmt(m.k, m.before) : ""}</small>
          ${spark(m.pts, m.ma)}
          <span class="tpill ${ST[m.status][0]}">${ST[m.status][1]}${m.change != null && m.status !== "estavel" ? " " + Math.abs(Math.round(m.change * 100)) + "%" : ""}</span>
        </div>`).join("")}</div>
      <p class="sub">"Agora" é a média das rotas mais recentes e "antes" a das anteriores (até 7 de cada lado). A linha escura é a média móvel de 5 rotas. A tendência aparece a partir de 5 rotas fechadas.</p>`;
  }

  // ---------- histórico ----------
  function histRows() {
    const cut = histPer ? Date.now() - histPer * 864e5 : 0;
    return hist.filter(r => r.t >= cut).sort((a, b) => b.t - a.t);
  }
  let histMode = store.get("re:hmode", "rota");
  // Comparativo: cada rota (ou cada dia) contra a média do período e contra a anterior.
  function renderHist() {
    document.querySelectorAll("[data-per]").forEach(b => b.classList.toggle("on", +b.dataset.per === histPer));
    document.querySelectorAll("[data-hmode]").forEach(b => b.classList.toggle("on", b.dataset.hmode === histMode));
    const rows = histRows();
    if (!rows.length) {
      $("histSum").innerHTML = ""; $("histChart").innerHTML = "";
      $("hist").innerHTML = `<p class="hempty">${hist.length ? "Nenhuma rota neste período." : `Quando você encerrar uma rota, ela aparece aqui. Para comparar com rotas que você já fez, use "Registrar rota anterior".`}</p>`;
      return;
    }
    const byDay = histMode === "dia";
    const items = (byDay ? Core.groupByDay(rows) : rows).slice().sort((a, b) => b.t - a.t);
    const sm = Core.summarize(rows);
    const nDays = Core.groupByDay(rows).length;
    $("histSum").innerHTML = [
      [sm.n, sm.n > 1 ? "rotas" : "rota"],
      [nDays, nDays > 1 ? "dias trabalhados" : "dia trabalhado"],
      [brl(sm.gross), "bruto"],
      [brl(sm.net), "líquido", sm.net >= 0 ? "good" : "bad"],
      [brl(sm.perRoute.net), "líquido médio por rota"],
      [brl(sm.net / nDays), "líquido médio por dia"],
      [brl(sm.grossPerPkg), "valor médio por pacote"],
      [brl(sm.netPerPkg), "líquido médio por pacote"],
      [sm.perRoute.km != null ? n1(sm.perRoute.km) + " km" : "–", "km médio por rota"],
      [brl(sm.perRoute.fuel), "combustível médio por rota"],
    ].map(([b, l, c]) => `<div class="kpi ${c || ""}"><b>${b}</b><span>${l}</span></div>`).join("")
      + Object.entries(sm.plat).map(([k, v]) => `<div class="kpi"><b>${brl(v.perPkg)}</b><span>por pacote · ${esc(k)} (${v.p} pct)</span></div>`).join("");
    // Gráfico: bruto e líquido dos últimos 14 itens, do mais antigo para o mais novo.
    const ks = items.slice(0, 14).reverse().map(r => ({ r, k: Core.routeKpis(r) }));
    const max = Math.max(...ks.map(x => x.k.gross), 1);
    const W = 340, H = 150, bw = W / ks.length;
    $("histChart").innerHTML = `<div class="legend"><span><i class="lg-g"></i>Bruto</span><span><i class="lg-n"></i>Líquido</span></div>
      <svg viewBox="0 0 ${W} ${H + 18}" role="img" aria-label="Bruto e líquido por ${byDay ? "dia" : "rota"}">
        <line x1="0" x2="${W}" y1="${H}" y2="${H}" class="axis"/>
        ${ks.map((x, i) => {
          const gh = x.k.gross / max * (H - 8), nh = Math.max(0, x.k.net) / max * (H - 8), cx = i * bw;
          const w = Math.min(14, bw * 0.34);
          return `<rect class="bar-g" x="${(cx + bw / 2 - w - 1).toFixed(1)}" y="${(H - gh).toFixed(1)}" width="${w.toFixed(1)}" height="${gh.toFixed(1)}" rx="2"><title>${new Date(x.r.t).toLocaleDateString("pt-BR")}: bruto ${brl(x.k.gross)}</title></rect>
            <rect class="bar-n" x="${(cx + bw / 2 + 1).toFixed(1)}" y="${(H - nh).toFixed(1)}" width="${w.toFixed(1)}" height="${nh.toFixed(1)}" rx="2"><title>líquido ${brl(x.k.net)}</title></rect>
            ${ks.length <= 10 || i % 2 === 0 ? `<text x="${(cx + bw / 2).toFixed(1)}" y="${H + 13}" text-anchor="middle">${new Date(x.r.t).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</text>` : ""}`;
        }).join("")}
      </svg>`;
    // Médias dos itens mostrados, para a seta de cada número.
    const K = items.map(r => ({ r, k: Core.routeKpis(r) }));
    const mean = f => { const v = K.map(x => x.k[f]).filter(x => x != null && isFinite(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
    const M = { net: mean("net"), netPerPkg: mean("netPerPkg"), pkgPerHour: mean("pkgPerHour"), kmPerPkg: mean("kmPerPkg"), netPerHour: mean("netPerHour"), minPerStop: mean("minPerStop") };
    const ranked = K.filter(x => x.k.netPerHour != null).sort((a, b) => b.k.netPerHour - a.k.netPerHour);
    const best = K.length >= 3 && ranked.length >= 3 ? ranked[0].r : null, worst = best ? ranked[ranked.length - 1].r : null;
    const dl = (v, avg, dir) => {
      if (v == null || !avg || !isFinite(v)) return "";
      const ch = v / avg - 1;
      if (Math.abs(ch) < 0.03) return `<i class="dz">= média</i>`;
      return `<i class="${ch * dir >= 0 ? "dup" : "ddown"}">${ch > 0 ? "▲" : "▼"}${Math.abs(Math.round(ch * 100))}%</i>`;
    };
    const cell = (label, val, v, avg, dir) => `<span class="mc"><small>${label}</small><b>${val}</b>${dl(v, avg, dir)}</span>`;
    $("hist").innerHTML = K.map(({ r, k }, i) => {
      const prev = K[i + 1];
      const day = new Date(r.t).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
      const who = byDay ? (r.routes > 1 ? `${r.routes} rotas` : "1 rota") : r.manual ? "registrada à mão" : r.at ? "rota " + esc(String(r.at).slice(-5)) + (sameDayCount(r) > 1 ? ` · ${hhmm(r.t)}` : "") : "";
      const vsPrev = prev ? (() => { const d = k.net - prev.k.net; return `vs ${byDay ? "dia" : "rota"} anterior: <b class="${d >= 0 ? "pos" : "neg"}">${d >= 0 ? "+" : "−"}${brl(Math.abs(d))}</b>`; })() : "";
      return `<div class="hcard${r === best ? " best" : ""}${r === worst ? " worst" : ""}">
        <div class="hhead"><span class="hd">${esc(day)}${r === best ? ` <em class="tag good">Melhor</em>` : ""}${r === worst ? ` <em class="tag bad">Pior</em>` : ""}<small>${[who, r.p + " pct", k.km ? n1(k.km) + " km" : "", k.hours ? dur(r.ms) : ""].filter(Boolean).join(" · ")}</small></span>
          <span class="hv ${k.net >= 0 ? "" : "neg"}">${brl(k.net)}<small>${dl(k.net, M.net, 1) || "líquido"}</small></span></div>
        <div class="mgrid">
          ${cell("Líquido/pacote", brl(k.netPerPkg), k.netPerPkg, M.netPerPkg, 1)}
          ${cell("Líquido/hora", k.netPerHour != null ? brl(k.netPerHour) : "–", k.netPerHour, M.netPerHour, 1)}
          ${cell("Pacotes/hora", n1(k.pkgPerHour), k.pkgPerHour, M.pkgPerHour, 1)}
          ${cell("Km/pacote", k.kmPerPkg != null ? n1(k.kmPerPkg, 2) : "–", k.kmPerPkg, M.kmPerPkg, -1)}
        </div>
        <div class="hfoot"><span class="hs">Bruto ${brl(k.gross)} · custo operacional ${brl(k.cost)}${k.costPerKm != null ? ` (${brl(k.costPerKm)}/km)` : ""}${vsPrev ? "<br>" + vsPrev : ""}</span>${byDay ? "" : `<button type="button" class="tiny" data-histedit="${esc(r.id)}" aria-label="Editar rota de ${new Date(r.t).toLocaleDateString("pt-BR")}">Editar</button>`}</div>
      </div>`;
    }).join("") + `<p class="sub">Setas: comparação com a média ${byDay ? "dos dias" : "das rotas"} deste período (verde é melhor, vermelho é pior).</p>`;
  }
  const sameDayCount = r => hist.filter(x => new Date(x.t).toDateString() === new Date(r.t).toDateString()).length;
  // Registrar ou editar uma rota (para trazer rotas antigas e comparar).
  function openHistForm(id) {
    const r = id ? hist.find(x => x.id === id) : null;
    const v = (x, d = "") => (x == null || x === "" ? d : x);
    const day = new Date(r ? r.t : Date.now() - 864e5);
    const iso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
    const k = r ? Core.routeKpis(r) : null;
    $("scanOverlay").hidden = false;
    $("scanSheet").innerHTML = `<div class="addr-big">${r ? "Editar rota" : "Registrar rota anterior"}</div>
      <p class="sub">Preencha o que souber. Combustível e desgaste em branco são calculados pelo km, com o preço do litro, o consumo e o desgaste por km dos Valores do dia.</p>
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
        <label for="hWear">Desgaste (R$)<input id="hWear" type="number" inputmode="decimal" step="0.01" placeholder="km × ${brl(fin.wear || 0)}" value="${v(r?.wear)}"></label>
        <label for="hFixed">Custos fixos do dia (R$)<input id="hFixed" type="number" inputmode="decimal" step="0.01" value="${v(r?.fixed ?? (r ? "" : fin.fixed || ""))}"></label>
        <label for="hOther" class="full">Outros gastos (R$): pedágio, estacionamento<input id="hOther" type="number" inputmode="decimal" step="0.01" value="${v(r?.other)}"></label>
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
      wear: num("hWear") ?? (km ? +(km * (fin.wear || 0)).toFixed(2) : 0), fixed: num("hFixed") || 0,
    };
    rec.l = rec.g - rec.fuel - rec.wear - rec.fixed - rec.other;
    hist = hist.filter(r => r.id !== rec.id).concat(rec);
    store.set("re:hist", hist);
    $("scanOverlay").hidden = true; renderPainel();
    toast(old ? "Rota atualizada" : "Rota registrada");
  }
  function exportCsv() {
    const rows = hist.slice().sort((a, b) => a.t - b.t);
    if (!rows.length) return toast("O histórico ainda está vazio.");
    const head = ["Dia", "Pacotes", "Pacotes Shopee", "Pacotes Mercado Livre", "Paradas", "Horas", "Km", "Combustível (R$)", "Desgaste (R$)", "Custos fixos (R$)", "Outros gastos (R$)", "Custo operacional (R$)", "Custo por km", "Bruto (R$)", "Shopee (R$)", "Mercado Livre (R$)", "Líquido (R$)", "Bruto por pacote", "Líquido por pacote", "Km por pacote", "Pacotes por hora", "Líquido por hora", "Margem", "Voltar depois", "Nova tentativa"];
    const f = v => (v == null || !isFinite(v) ? "" : String(+v.toFixed(2)).replace(".", ","));
    const lines = rows.map(r => {
      const k = Core.routeKpis(r);
      return [new Date(r.t).toLocaleDateString("pt-BR"), r.p, r.pS ?? "", r.pM ?? "", r.a || "", f(k.hours), f(k.km || null), f(k.fuel), f(k.wear), f(k.fixed), f(k.other), f(k.cost), f(k.costPerKm), f(k.gross), f(r.gS), f(r.gM), f(k.net), f(k.grossPerPkg), f(k.netPerPkg), f(k.kmPerPkg), f(k.pkgPerHour), f(k.netPerHour), k.margin != null ? Math.round(k.margin * 100) + "%" : "", r.later ?? "", r.att2 ?? ""].join(";");
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
  [["fPay", "pay"], ["fPayMl", "payMl"], ["fPrice", "price"], ["fKml", "kml"], ["fKm", "km"], ["fBase", "base"], ["fOther", "other"], ["fWear", "wear"], ["fFixed", "fixed"]].forEach(([id, k]) => {
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
          <div class="issue-top"><span class="mini-n">${num(a)}</span><span><b>${esc(a.label)}</b><br><span class="sub">${esc([shopee(a), a.cep ? "CEP " + fmtCep(a.cep) : "", a.pkgs.length + " pacote" + (a.pkgs.length > 1 ? "s" : "")].filter(Boolean).join(" · "))}</span></span></div>
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
    areaRadius = Math.max(100, Math.min(WALK, +e.target.value || WALK)); e.target.value = areaRadius; store.set("re:areaR", areaRadius);
    if (D) { D.areaSeeds = []; D.areaOf = {}; ensureAreas(); save(); renderAll(); toast("Áreas refeitas"); }
  });
  $("bagMode").value = bagMode;
  $("bagMode").addEventListener("change", e => { bagMode = e.target.value; store.set("re:bag", bagMode); renderAll(); toast("Sacos atualizados"); });
  $("recalc").addEventListener("click", () => { unlockRoute(); plan($("start").value); save(); numberOrder(); fillAjustes(); drawMarkers(false); renderAll(); toast("Ordem refeita"); });
  $("endMode").value = fin.endMode || "livre";
  $("endMode").addEventListener("change", e => {
    fin.endMode = e.target.value; store.set("re:fin", fin);
    if (fin.endMode === "casa" && !fin.home) toast("Toque em \"Salvar minha localização como casa\" para usar esta opção.");
    if (active) { plan(nextAddr()?.key); save(); numberOrder(); fillAjustes(); drawMarkers(false); renderAll(); toast("Rota refeita com o novo final"); }
  });
  $("saveHome").addEventListener("click", () => {
    if (!here) { startGps(false); return toast("Ligando a localização. Toque de novo em alguns segundos."); }
    fin.home = { ...here }; fin.endMode = "casa"; store.set("re:fin", fin); $("endMode").value = "casa";
    if (active) { plan(nextAddr()?.key); save(); numberOrder(); fillAjustes(); drawMarkers(false); renderAll(); }
    toast("Casa salva. A rota termina perto dela.");
  });
  $("reverse").addEventListener("click", () => {
    unlockRoute();
    const done = order.filter(addrDone), pend = D.order.map(k => byKey.get(k)).filter(a => a && !addrDone(a));
    D.order = done.concat(pend.reverse()).map(a => a.key); curKey = null;
    save(); numberOrder(); fillAjustes(); drawMarkers(false); renderAll(); updateNav(true);
    toast("Ordem invertida: a última parada virou a primeira");
  });
  $("autoNav").value = fin.autoNav || "auto";
  $("autoNav").addEventListener("change", e => { fin.autoNav = e.target.value; store.set("re:fin", fin); toast(fin.autoNav === "off" ? "Navegação automática desligada" : "Depois de Entreguei, a navegação abre sozinha na próxima parada"); });
  $("recalcHere").addEventListener("click", () => {
    if (!here) { startGps(false); return toast("Ligando a localização. Toque de novo em alguns segundos."); }
    unlockRoute(); curKey = null; plan(null, true); save(); numberOrder(); fillAjustes(); drawMarkers(false); renderAll(); updateNav(true);
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
        <label for="aSrc" class="full">De onde é<select id="aSrc">${Object.entries(PLATFORMS).map(([k, v]) => `<option value="${k}">${esc(v.name)}</option>`).join("")}</select></label>
        <label for="aAddr" class="full">Endereço (rua e número)<input id="aAddr" type="search" autocomplete="off" placeholder="ex. Rua Tatuapé, 130" value="${esc(addDraft.address)}"></label>
        ${SR ? `<button type="button" class="line full" data-voice="1">Falar o endereço</button>` : ""}
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
      code: addDraft.code, src: addDraft.target === "r2" && addDraft.src === "shopee" ? undefined : addDraft.src, address, bairro: "", city: D?.pkgs[0]?.city || "", cep: "",
      lat: addDraft.lat, lng: addDraft.lng, seq: null, shopeeStop: null, at: D?.at,
      ...Core.parseAddress(address), window: Core.parseWindow(address),
    };
    if (addDraft.target === "r2") {
      const r = r2Add(p);
      $("scanOverlay").hidden = true; location.hash = "#nova"; renderNova();
      return toast(r === "dup" ? "Esse código já está na Nova rota." : "Entrou na Nova rota");
    }
    if (all().some(x => x.tn === p.tn)) return toast("Esse código já está na rota.");
    D.extra = (D.extra || []).concat(p);
    derive(); plan(nextAddr()?.key); save();
    $("scanOverlay").hidden = true;
    numberOrder(); fillAjustes(); drawMarkers(false); renderAll();
    const a = byTn.get(p.tn);
    toast("Entrou na rota");
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
    $("scanSheet").innerHTML = missHtml || `<div class="bigno">Parada ${esc(num(a, true))}</div><div class="bagbig">Ponto ${carOfAddr(a).g?.n ?? "?"}</div>${tp && bagOf(tp, a) ? `<div class="bagbig">Saco ${esc(bagOf(tp, a))}</div>` : ""}${addrCard(a, tn)}
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
      if (p) { D.checked = D.checked || {}; D.checked[p.tn] = D.checked[p.tn] || Date.now(); save(); renderList(); renderSep(); buzz(60); return openScan(byTn.get(p.tn), p.tn); }
      buzz([200, 80, 200]);
      const back = read.map(catFind).find(Boolean);
      if (back) { const res = putBack(back); toast(res.msg); return openScan(res.a, back.tn); }
      openScan(null, null, `<div class="miss"><b>${read.length ? "Este pacote não está nesta rota" : "Não consegui ler o código"}</b>${read.length ? `<button type="button" class="primary" data-backadd="${esc(read[0])}">Colocar na rota (digitar o endereço)</button>` : ""}<span class="sub">${read.length ? "Código lido: " + esc(read.join(", ")) : "Fotografe só a etiqueta, de perto e com luz."}</span></div>
        <label class="btn primary" for="photo">Tentar de novo</label><button type="button" class="line" data-close="1">Fechar</button>`);
    } catch { openScan(null, null, `<div class="miss"><b>Não consegui ler o código</b></div><button type="button" class="line" data-close="1">Fechar</button>`); }
  });

  // ---------- Bipar: câmera aberta lendo etiqueta atrás de etiqueta, com bip ----------
  // Aponte para a etiqueta: o app lê sozinho, apita e mostra a parada e o grupo. Pacote da rota fica marcado como
  // separado; pacote que saiu da planilha (mas está guardado) volta para a rota; código desconhecido dá bip de erro.
  let bip = null;
  function tone(kind) {
    try {
      const ac = bip?.ac; if (!ac) return;
      const seq = kind === "ok" ? [[1046, 0.09]] : kind === "back" ? [[880, 0.08], [1318, 0.1]] : kind === "done" ? [[523, 0.15]] : [[220, 0.18], [180, 0.22]];
      let t = ac.currentTime;
      seq.forEach(([f, d]) => {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = kind === "err" ? "square" : "sine"; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        o.connect(g).connect(ac.destination); o.start(t); o.stop(t + d + 0.02); t += d + 0.04;
      });
    } catch {}
  }
  async function openBip(mode) {
    if (!active && mode !== "nova") return toast("Abra a planilha da rota antes.");
    if (!window.ZXing) return toast("O leitor de código não carregou. Confira a internet.");
    let ac = null;
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); ac.resume?.(); } catch {}
    bip = { ac, mode: mode || "rota", last: {}, done: new Set(), n: 0, log: [], stream: null, stop: false, rot: 0 };
    $("bip").classList.toggle("nova", bip.mode === "nova");
    $("bip").hidden = false;
    $("bipRes").innerHTML = `<div class="bip-hint">Aponte a câmera para a etiqueta</div>`;
    $("bipCount").textContent = "";
    if (!navigator.mediaDevices?.getUserMedia) return bipNoCam("Este navegador não abre a câmera ao vivo.");
    try {
      bip.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    } catch (err) { return bipNoCam(err && err.name === "NotAllowedError" ? "Sem permissão para a câmera. Libere a câmera para este site nos ajustes do celular." : "Não consegui abrir a câmera."); }
    if (!bip || bip.stop) { bip?.stream?.getTracks().forEach(t => t.stop()); return; }
    const v = $("bipVideo");
    v.srcObject = bip.stream; v.setAttribute("playsinline", ""); v.muted = true;
    try { await v.play(); } catch {}
    const tr = bip.stream.getVideoTracks()[0];
    $("bipTorchBtn").hidden = !(tr?.getCapabilities?.().torch);
    bipLoop();
  }
  function bipNoCam(msg) {
    $("bipRes").innerHTML = `<div class="bip-card err"><b>${esc(msg)}</b><span>Use a foto da etiqueta.</span><label class="btn primary" for="photo">Tirar foto da etiqueta</label></div>`;
  }
  function closeBip() {
    if (bip) { bip.stop = true; bip.stream?.getTracks().forEach(t => t.stop()); try { bip.ac?.close(); } catch {} }
    bip = null; $("bipVideo").srcObject = null; $("bip").hidden = true;
    renderAll(); renderNova();
  }
  async function bipTorch() {
    const tr = bip?.stream?.getVideoTracks()[0]; if (!tr) return;
    bip.torch = !bip.torch;
    try { await tr.applyConstraints({ advanced: [{ torch: bip.torch }] }); } catch {}
  }
  document.addEventListener("visibilitychange", () => { if (document.hidden && bip) closeBip(); });
  // "Tirar foto" de dentro do Bipar: fecha a câmera ao vivo (o seletor de foto abre normalmente).
  document.addEventListener("click", e => { if (bip && e.target.closest('#bip label[for="photo"]')) setTimeout(closeBip, 0); }, true);
  function bipLoop() {
    if (!bip || bip.stop) return;
    const v = $("bipVideo");
    if (v.readyState >= 2 && v.videoWidth) {
      const vw = v.videoWidth, vh = v.videoHeight;
      // Faixa central (onde fica o quadro guia), reduzida para ler rápido. Alterna em pé e deitada.
      // Alterna: imagem inteira e o miolo ampliado (etiqueta longe ou perto).
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
        const r = (bip.reader || (bip.reader = new ZXing.MultiFormatReader())).decode(new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(new ZXing.HTMLCanvasElementLuminanceSource(cv))), bip.hints || (bip.hints = zxHints()));
        bipHandle(r.getText());
      } catch {}
    }
    setTimeout(() => requestAnimationFrame(bipLoop), 60);
  }
  // Bipar do botão do meio: só consulta. Mostra a parada, o Ponto, se já foi conferido (fotografado/bipado na
  // organização), o horário para entregar e se é comercial. Não muda nada sem você tocar num botão.
  function bipShow(kind, html, logTxt, again) {
    tone(kind); buzz(kind === "err" ? [200, 80, 200] : 60);
    if (!again) { bip.log.unshift(logTxt); if (kind !== "err") bip.n++; }
    $("bipRes").innerHTML = html;
    $("bipCount").textContent = `${bip.n} consultado${bip.n === 1 ? "" : "s"}`;
    $("bipLog").textContent = bip.log.slice(0, 6).join("   ");
    $("bip").classList.remove("flash-ok", "flash-err"); void $("bip").offsetWidth;
    $("bip").classList.add(kind === "err" ? "flash-err" : "flash-ok");
  }
  function bipConsulta(text, again) {
    const p = findPkgByCode(text);
    if (p) {
      const a = byTn.get(p.tn), g = pontoOf(a), w = p.window;
      const st = [
        isChecked(p) ? `<span class="chip ok">✓ conferido às ${hhmm(D.checked[p.tn])}</span>` : `<span class="chip warn">ainda não conferido</span>`,
        w ? `<span class="chip warn">${w.until ? "entregar até " + esc(w.until) : "entregar após " + esc(w.after)}</span>` : "",
        commChip(a),
        pkgOk(p) ? `<span class="chip ok">entregue às ${hhmm(ok[p.tn])}</span>` : failOf(p) ? `<span class="chip warn">não entregue: ${esc(failOf(p).r)}</span>` : "",
        attempt(p) > 1 ? `<span class="chip warn">${attempt(p)}ª tentativa</span>` : "",
      ].join("");
      return bipShow(pkgDone(p) ? "done" : "ok", `<div class="bip-card ${pkgDone(p) ? "done" : "ok"}"><span class="bip-big">Parada ${esc(p.src ? PLATFORMS[p.src]?.name || p.src : p.shopeeStop ?? "s/n")}</span>
        <span class="bip-grp">Ponto ${g?.n ?? "?"} · ${esc(g ? streetOf(g.park) : "")}</span><span>${esc(a.label)}</span><div class="bip-st">${st}</div>
        ${!pkgDone(p) && !isChecked(p) ? `<button type="button" class="line" data-chkon="${esc(p.tn)}">Marcar como conferido</button>` : ""}
        ${pkgDone(p) ? `<button type="button" class="line" data-p="${esc(p.tn)}">Não foi entregue: voltar para a rota</button>` : ""}</div>`, (p.shopeeStop ?? "s/n") + " · " + tail(p.tn), again);
    }
    const inR2 = r2Has(text);
    if (inR2) return bipShow("done", `<div class="bip-card back"><b>Este pacote está na Nova rota</b><span class="bip-big">Parada ${esc(inR2.shopeeStop ?? "s/n")}</span><span>${esc(inR2.address || "")}</span>${R2.ok[inR2.tn] ? `<span class="chip ok">entregue às ${hhmm(R2.ok[inR2.tn])}</span>` : ""}</div>`, "N · " + tail(inR2.tn), again);
    const c = catFind(text);
    if (c) return bipShow("done", `<div class="bip-card done"><b>Saiu da planilha (já baixado na Shopee)</b><span class="bip-big">Parada ${esc(c.shopeeStop ?? "s/n")}</span><span>${esc(c.address || "")}</span>
      <button type="button" class="line" data-backput="${esc(c.tn)}">Voltar para a rota comum</button></div>`, "↩ " + tail(c.tn), again);
    return bipShow("err", `<div class="bip-card err"><b>Não conheço este pacote</b><span class="mono">${esc(text)}</span><button type="button" class="line" data-backadd="${esc(text)}">Colocar na rota (digitar endereço)</button></div>`, "✕ " + tail(text), again);
  }
  function bipHandle(text) {
    const now = Date.now();
    // Mesma etiqueta parada na frente da câmera: não apita de novo. Só repete se você afastar e voltar depois de 4 s.
    const seenAt = bip.last[text];
    bip.last[text] = now;
    if (seenAt && now - seenAt < 4000) return;
    const again = bip.done.has(text);
    bip.done.add(text);
    if (bip.mode === "nova") return bipNova(text, again);
    // Pacote que está na Nova rota não volta para a rota comum.
    const inR2 = r2Has(text);
    if (inR2 && !findPkgByCode(text)) { tone("done"); $("bipRes").innerHTML = `<div class="bip-card done"><b>Este pacote está na Nova rota</b><span class="bip-big">Parada ${esc(inR2.shopeeStop ?? "s/n")}</span><span>${esc(inR2.address || "")}</span></div>`; return; }
    if (bip.mode === "rota") return bipConsulta(text, again);
    let p = findPkgByCode(text), kind, html;
    if (p && !pkgDone(p)) {
      D.checked = D.checked || {}; D.checked[p.tn] = D.checked[p.tn] || now; save();
      const a = byTn.get(p.tn);
      kind = "ok";
      html = `<div class="bip-card ok"><span class="bip-big">Parada ${esc(p.shopeeStop ?? "s/n")}</span><span class="bip-grp">Ponto ${carOfAddr(a).g?.n ?? "?"}</span><span>${esc(a.label)}</span><span class="mono">${esc(p.tn)}</span></div>`;
    } else if (p) {
      kind = "done";
      html = `<div class="bip-card done"><span class="bip-big">Parada ${esc(p.shopeeStop ?? "s/n")}</span><b>Este pacote está como entregue</b><span class="mono">${esc(p.tn)}</span><button type="button" class="line" data-p="${esc(p.tn)}">Não foi entregue: voltar para a rota</button></div>`;
    } else {
      const c = catFind(text);
      if (c) {
        const res = putBack(c);
        D.checked = D.checked || {}; D.checked[c.tn] = now; save();
        kind = "back";
        html = `<div class="bip-card back"><b>Voltou para a rota</b><span class="bip-big">Parada ${esc(num(res.a, true))}</span><span class="bip-grp">Ponto ${carOfAddr(res.a).g?.n ?? "?"}</span><span>${esc(res.a.label)}</span></div>`;
      } else {
        kind = "err";
        html = `<div class="bip-card err"><b>Não está na rota</b><span class="mono">${esc(text)}</span><button type="button" class="line" data-backadd="${esc(text)}">Colocar na rota (digitar endereço)</button></div>`;
      }
    }
    tone(kind); buzz(kind === "err" ? [200, 80, 200] : 60);
    if (kind !== "err" && !again) bip.n++;
    if (!again) bip.log.unshift(kind === "err" ? "✕ " + tail(text) : (p ? (p.shopeeStop ?? "s/n") : "↩") + " · " + tail(p ? p.tn : text));
    $("bipRes").innerHTML = html;
    const pk = all().filter(x => !pkgDone(x)), got = pk.filter(isChecked).length;
    $("bipCount").textContent = `${bip.n} bipado${bip.n === 1 ? "" : "s"} · ${got} de ${pk.length} separados`;
    $("bipLog").textContent = bip.log.slice(0, 6).join("   ");
    $("bip").classList.remove("flash-ok", "flash-err"); void $("bip").offsetWidth;
    $("bip").classList.add(kind === "err" ? "flash-err" : "flash-ok");
  }

  // ---------- Nova rota: pacotes bipados, separada da rota comum ----------
  // Para pacotes já baixados no app da Shopee que ainda vão ser entregues. Fica guardada à parte (re:r2): entregar aqui
  // não mexe na ordem da rota comum; se o pacote também estiver na rota comum, ele aparece lá como entregue.
  let R2 = store.get("re:r2", null);
  const r2Save = () => { store.set("re:r2", R2); try { syncDelivR2(); } catch {} };
  const normCode = t => String(t || "").toUpperCase().replace(/\s+/g, "");
  const r2Has = text => { const t = normCode(text); return R2?.pkgs.find(p => t.includes(p.tn.toUpperCase())) || null; };
  function r2Lookup(text) {
    const t = normCode(text);
    const m = D ? all().find(p => p.tn && t.includes(p.tn.toUpperCase())) : null;
    return m || catFind(text);
  }
  function r2Add(c) {
    if (!R2) R2 = { pkgs: [], ok: {}, created: Date.now(), order: null };
    if (R2.pkgs.some(p => p.tn === c.tn)) return "dup";
    const { _t, back, olat, olng, ...q } = c;
    R2.pkgs.push({ ...q, addedAt: Date.now() });
    R2.order = null; r2Save();
    return "ok";
  }
  let A2 = [], by2 = new Map();
  const r2Done = a => a.pkgs.every(p => R2.ok[p.tn]);
  function r2Plan(fromHere) {
    A2 = Core.buildAddresses(R2.pkgs); by2 = new Map(A2.map(a => [a.key, a]));
    const pend = A2.filter(a => !r2Done(a));
    const okOrder = R2.order && pend.every(a => R2.order.includes(a.key));
    if (!okOrder && pend.length) {
      const start = pend.reduce((b, a) => ((a.shopeeStops[0] ?? 1e9) < (b.shopeeStops[0] ?? 1e9) ? a : b)).key;
      const r = Core.addressRoute(pend, start, { from: (fromHere || !R2.order) && here ? { ...here } : null });
      R2.order = r.order.map(a => a.key);
    }
  }
  function r2Deliver(key, on) {
    const a = by2.get(key); if (!a) return;
    a.pkgs.forEach(p => {
      if (on) { R2.ok[p.tn] = Date.now(); if (D && all().some(x => x.tn === p.tn)) ok[p.tn] = ok[p.tn] || Date.now(); }
      else { delete R2.ok[p.tn]; if (D) delete ok[p.tn]; }
    });
    r2Save(); if (D) save();
    renderNova(); if (active) renderAll();
    if (on) toast("Entregue (Nova rota)");
  }
  function renderNova() {
    const box = $("novaList");
    if (!box) return;
    if (!R2 || !R2.pkgs.length) {
      $("novaHead").innerHTML = `<b>Nenhum pacote ainda</b><span>Bipe os pacotes que você vai entregar nesta rota.</span>`;
      box.innerHTML = ""; $("novaLeg").hidden = true; $("novaTools").hidden = true; return;
    }
    r2Plan(false);
    const pend = (R2.order || []).map(k => by2.get(k)).filter(a => a && !r2Done(a));
    A2.filter(a => !r2Done(a) && !pend.includes(a)).forEach(a => pend.push(a));
    const done = A2.filter(r2Done);
    const nOk = R2.pkgs.filter(p => R2.ok[p.tn]).length;
    $("novaHead").innerHTML = `<b>${R2.pkgs.length} pacote${R2.pkgs.length > 1 ? "s" : ""} em ${A2.length} endereço${A2.length > 1 ? "s" : ""}</b><span>${nOk} entregue${nOk === 1 ? "" : "s"} · faltam ${R2.pkgs.length - nOk}</span>`;
    $("novaTools").hidden = false;
    const leg = pend.slice(0, 10);
    $("novaLeg").hidden = leg.length < 2;
    if (leg.length > 1) { $("novaLeg").href = Core.links.gmapsLeg(leg); $("novaLeg").textContent = `Próximas ${leg.length} paradas no Google Maps`; }
    const card = (a, i) => {
      const ceps = [...new Set(a.pkgs.map(p => String(p.cep || "").replace(/\D/g, "")).filter(c => c.length === 8))].map(c => c.slice(0, 5) + "-" + c.slice(5));
      const dist = here ? fmtDist(walkM(here, a)) : "";
      return `<div class="r2a${i === 0 ? " next" : ""}">
        <div class="r2-top"><span class="r2-i">${i + 1}º</span><span><b class="r2-stop">${a.shopeeStops.length ? "Parada " + a.shopeeStops.join(" · ") : "sem nº"}</b><br><b>${esc(a.label)}</b><br><small>${esc([ceps.length ? "CEP " + ceps.join(", ") : "", a.bairro, dist].filter(Boolean).join(" · "))}</small></span></div>
        <div class="pr-pk">${a.pkgs.map(p => `<span class="tk">${esc(tail(p.tn))}<button type="button" class="tk-x" data-r2rm="${esc(p.tn)}" aria-label="Tirar da Nova rota">×</button></span>`).join("")}</div>
        <div class="nav3"><a class="btn" href="${Core.links.waze(a)}" target="_blank" rel="noopener">Waze</a><a class="btn" href="${Core.links.gmaps(a)}" target="_blank" rel="noopener">Google</a><a class="btn" href="${Core.links.apple(a)}" target="_blank" rel="noopener">Apple</a></div>
        <button type="button" class="primary deliver" data-r2ok="${esc(a.key)}">Entreguei ${a.pkgs.length > 1 ? `os ${a.pkgs.length}` : "aqui"}</button></div>`;
    };
    box.innerHTML = pend.map(card).join("") + (pend.length ? "" : `<div class="card"><b>Nova rota concluída ✓</b></div>`)
      + (done.length ? `<h2 class="r2-done-h">Entregues (${done.length})</h2>` + done.map(a => `<div class="r2a done"><span><b>${a.shopeeStops.length ? "Parada " + a.shopeeStops.join(" · ") + " · " : ""}${esc(a.label)}</b><br><small class="mono">${a.pkgs.map(p => esc(tail(p.tn))).join(" ")}</small></span><button type="button" class="line" data-r2undo="${esc(a.key)}">Desfazer</button></div>`).join("") : "");
  }
  function bipNova(text, again) {
    const now = Date.now();
    const c = r2Lookup(text);
    let kind, html;
    if (!c) {
      kind = "err";
      html = `<div class="bip-card err"><b>Não achei o endereço deste pacote</b><span class="mono">${esc(text)}</span><button type="button" class="line" data-r2manual="${esc(text)}">Digitar o endereço</button></div>`;
    } else {
      const r = r2Add(c);
      kind = r === "dup" ? "done" : "ok";
      html = `<div class="bip-card ${r === "dup" ? "done" : "ok"}"><b>${r === "dup" ? "Já está na Nova rota" : "Entrou na Nova rota"}</b><span class="bip-big">Parada ${esc(c.shopeeStop ?? "s/n")}</span><span>${esc(c.address || "")}</span><span class="mono">${esc(c.tn)}</span></div>`;
    }
    tone(kind); buzz(kind === "err" ? [200, 80, 200] : 60);
    if (!again) bip.log.unshift((kind === "err" ? "✕ " : (c.shopeeStop ?? "s/n") + " · ") + tail(c ? c.tn : text));
    $("bipRes").innerHTML = html;
    $("bipCount").textContent = `Nova rota: ${R2?.pkgs.length || 0} pacote${R2?.pkgs.length === 1 ? "" : "s"}`;
    $("bipLog").textContent = bip.log.slice(0, 6).join("   ");
    $("bip").classList.remove("flash-ok", "flash-err"); void $("bip").offsetWidth;
    $("bip").classList.add(kind === "err" ? "flash-err" : "flash-ok");
  }
  $("novaGo").addEventListener("click", () => {
    const text = normCode($("novaCode").value);
    if (text.length < 4) return toast("Digite o código BR ou pelo menos o final dele.");
    const c = (D ? all().find(p => p.tn.toUpperCase().endsWith(text)) : null) || catFind(text);
    if (!c) { $("novaCode").value = ""; openAdd(); addDraft.src = "shopee"; addDraft.code = text; addDraft.target = "r2"; openAdd(true); return toast("Não achei esse pacote: digite o endereço."); }
    const r = r2Add(c); $("novaCode").value = ""; renderNova();
    toast(r === "dup" ? "Já está na Nova rota" : `Entrou: Parada ${c.shopeeStop ?? "s/n"}`);
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
        <div class="chklist">${pk.map(x => `<button type="button" class="${chk[x.p.tn] ? "on" : ""}" data-chk="${esc(x.p.tn)}"><span class="box">${chk[x.p.tn] ? "✓" : ""}</span><b class="mono">${esc(tail(x.p.tn))}</b><span class="sub">${multiAt() && x.p.at ? `<b style="color:${atColor(x.p.at)}">Rota ${esc(atShort(x.p.at))}</b> · ` : ""}${esc(x.a.label)}${bagOf(x.p, x.a) && bagMode !== "area" ? " · saco " + esc(bagOf(x.p, x.a)) : ""}</span></button>`).join("")}</div></div>`;
    }).join("");
    $("scanOverlay").hidden = false;
    $("scanSheet").innerHTML = `<div class="addr-big">Conferência por área</div>
      ${found.length || fails.length || others.length ? `<p>${found.length} etiqueta(s) lida(s)${others.length ? ` · ${others.length} de fora da rota` : ""}${fails.length ? ` · ${fails.length} foto(s) sem código legível (nº ${fails.join(", ")})` : ""}.</p>` : ""}
      ${found.length ? `<div class="chips">${found.map(p => `<span class="chip area">${esc(tail(p.tn))} → ${multiAt() && p.at ? "Rota " + esc(atShort(p.at)) + " · " : ""}Área ${areaOf(byTn.get(p.tn))}</span>`).join("")}</div>` : ""}
      <p class="sub">Coloque os pacotes de cada área juntos (saco ou caixa). Marcado = já conferido. Etiqueta não saiu na foto? Toque no pacote para marcar à mão.</p>
      <label style="display:flex;gap:10px;align-items:center"><input type="checkbox" id="onlyMissing" ${onlyMissing ? "checked" : ""} style="width:24px;height:24px"> Mostrar só os que faltam</label>
      ${rows}
      <label class="btn primary" for="photoMany">Fotografar mais pacotes</label>
      <button type="button" class="line" data-close="1">Fechar</button>`;
  }

  document.addEventListener("change", e => { if (e.target.id === "onlyMissing") { onlyMissing = e.target.checked; showChecked([], [], []); } });

  // ---------- Fase 1: carga, hora prevista, ocorrência, comprovante, fim da rota, navegação automática ----------
  // Ordem de carga: congelada quando a rota é aberta (refaz só se você pedir), para os pacotes não mudarem de lugar.
  const vehKey = () => ({ util: "utilitario", moto: "moto" }[fin.vehicle] || "carro");
  function ensureLoad(force) {
    if (!D || !order.length) return;
    if (!force && D.load && D.load.veh === vehKey()) return;
    D.load = { veh: vehKey(), map: Core.loadPlan(order.map(a => a.key), vehKey()).map, at: Date.now() };
    save();
  }
  const zoneOf = a => { const z = a && D?.load?.map?.[a.key]; return z == null ? null : Core.VEHICLES[D.load.veh].zones[z]; };
  const zoneChip = (a, long) => { const z = zoneOf(a); return z ? `<span class="chip zone">Carga ${z.code}${long ? " · " + esc(z.name) : ""}</span>` : ""; };
  function openLoad() {
    ensureLoad();
    const veh = Core.VEHICLES[D.load.veh], zs = veh.zones;
    const groups = zs.map((z, i) => ({ z, list: order.filter(a => D.load.map[a.key] === i) })).filter(g => g.list.length);
    $("scanOverlay").hidden = false;
    $("scanSheet").innerHTML = `<div class="addr-big">Ordem de carga</div>
      <p class="sub">${esc(veh.name)}. Carregue <b>de baixo para cima</b>: comece pela zona ${esc(groups[groups.length - 1]?.z.code || "")} e termine pela A, que é a primeira parte da rota e fica mais à mão. O cartão de cada parada mostra a zona.</p>
      ${groups.slice().reverse().map((g, i) => {
        const pk = g.list.flatMap(a => a.pkgs.filter(p => !pkgDone(p)));
        return `<div class="loadz"><span class="lz-code">${g.z.code}</span><span><b>${i + 1}º a carregar · ${esc(g.z.name)}</b><br><span class="sub">${esc(g.z.hint || "")}${g.z.hint ? " · " : ""}paradas ${g.list[0].n} a ${g.list[g.list.length - 1].n} · ${pk.length} pacote${pk.length === 1 ? "" : "s"}</span><br><span class="mono sub">${pk.slice(0, 40).map(p => esc(tail(p.tn))).join(" ")}${pk.length > 40 ? " …" : ""}</span></span></div>`;
      }).join("")}
      <button type="button" class="line" data-loadredo="1">Refazer a ordem de carga pela rota atual</button>
      <button type="button" class="line" data-close="1">Fechar</button>`;
  }

  // Hora prevista em cada parada: seu ritmo real (depois de 3 paradas) ou 3 min por parada, a 18 km/h na rua.
  let etaMap = new Map();
  function computeEtas() {
    etaMap = new Map();
    if (!D) return;
    const pend = pendingList();
    if (!pend.length) return;
    const doneN = order.filter(addrDone).length;
    const stopMin = sess.start && doneN >= 3 ? Math.min(12, Math.max(1.5, (Date.now() - sess.start) / 60000 / doneN)) : 3;
    const list = mode === "perto" && here ? nextLeg(pend.length) : pend;
    const now = new Date();
    const mins = Core.etas(list, { start: now.getHours() * 60 + now.getMinutes(), from: here || null, stopMin });
    list.forEach((a, i) => etaMap.set(a.key, mins[i]));
  }
  const hm = m => { const x = Math.round(m) % 1440; return String(Math.floor(x / 60)).padStart(2, "0") + ":" + String(x % 60).padStart(2, "0"); };
  const etaChip = a => (etaMap.has(a.key) && !addrDone(a) ? `<span class="chip eta">chega ~${hm(etaMap.get(a.key))}</span>` : "");

  // Não consegui entregar: motivo registrado por pacote. Conta como resolvido na rota, não como entregue.
  const REASONS = ["Endereço não encontrado", "Destinatário recusou", "Local fechado ou sem acesso", "Pacote avariado", "Área de risco", "Outro motivo"];
  function openFail(key) {
    const a = byKey.get(key); if (!a) return;
    $("scanOverlay").hidden = false;
    $("scanSheet").innerHTML = `<div class="addr-big">Não consegui entregar</div><p class="sub">${esc(a.label)} · ${a.pkgs.filter(p => !pkgDone(p)).length} pacote(s)</p>
      <button type="button" class="brand" data-later="${esc(key)}">Ninguém atendeu: voltar depois</button>
      <div class="reasons">${REASONS.map(r => `<button type="button" class="line" data-failr="${esc(key)}::${esc(r)}">${esc(r)}</button>`).join("")}</div>
      <p class="sub">O motivo fica registrado no pacote e entra nos indicadores da rota. Para desfazer, toque no pacote ou em "Desfazer ocorrência".</p>
      <button type="button" class="line" data-close="1">Cancelar</button>`;
  }
  function failGo(key, r) {
    const a = byKey.get(key); if (!a) return;
    D.fail = D.fail || {};
    a.pkgs.filter(p => !pkgDone(p)).forEach(p => (D.fail[p.tn] = { r, t: Date.now() }));
    if (!sess.start) sess = { start: Date.now() };
    D.later = (D.later || []).filter(k => k !== key);
    save(); $("scanOverlay").hidden = true;
    selKey = null; sheetOpen = false; curKey = null;
    renderAll(); updateNav(true);
    toast(`Ocorrência registrada: ${r}`);
    const nx = nextAddr(); if (nx) autoNav(nx);
    if (all().every(pkgDone)) setTimeout(() => { if (active && all().every(pkgDone)) openFinish(); }, 900);
  }

  // Comprovante (opcional): quem recebeu e foto. A foto fica no aparelho (IndexedDB), reduzida, fora do backup.
  const WHO = ["Cliente", "Porteiro", "Vizinho", "Familiar", "Caixa de correio"];
  const idb = (() => {
    let dbp;
    const open = () => dbp || (dbp = new Promise((res, rej) => { const r = indexedDB.open("rota-certa", 1); r.onupgradeneeded = () => r.result.createObjectStore("fotos"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
    const run = (mode, fn) => open().then(db => new Promise((res, rej) => { const t = db.transaction("fotos", mode); const q = fn(t.objectStore("fotos")); t.oncomplete = () => res(q.result); t.onerror = () => rej(t.error); }));
    return { put: (k, v) => run("readwrite", st => st.put(v, k)), get: k => run("readonly", st => st.get(k)) };
  })();
  function proofBox(a) {
    if (!a.pkgs.some(p => !failOf(p))) return "";
    const pr = D.proof?.[a.key] || {};
    queueMicrotask(hydrateProof);
    return `<div class="proof"><div class="eyebrow">Comprovante (opcional)</div>
      <div class="chips">${WHO.map(w => `<button type="button" class="chip pick${pr.who === w ? " on" : ""}" data-who="${esc(a.key)}::${esc(w)}">${esc(w)}</button>`).join("")}</div>
      <div class="proof-row"><label class="btn line" for="proofPhoto" data-proofkey="${esc(a.key)}">${pr.photo ? "Trocar a foto" : "Foto da entrega"}</label>${pr.photo ? `<img class="proof-img" data-proofimg="${esc(a.key)}" alt="Foto da entrega em ${esc(a.label)}">` : ""}</div></div>`;
  }
  const proofUrls = {};
  function hydrateProof() {
    document.querySelectorAll("[data-proofimg]").forEach(img => {
      const k = img.dataset.proofimg;
      if (proofUrls[k]) { img.src = proofUrls[k]; return; }
      idb.get(D.at + "|" + k).then(b => { if (b) { proofUrls[k] = URL.createObjectURL(b); img.src = proofUrls[k]; } }).catch(() => {});
    });
  }
  let proofKey = null;
  document.addEventListener("click", e => { const l = e.target.closest("[data-proofkey]"); if (l) proofKey = l.dataset.proofkey; }, true);
  $("proofPhoto").addEventListener("change", async e => {
    const f = e.target.files[0]; e.target.value = "";
    const key = proofKey; if (!f || !key || !D) return;
    try {
      const bmp = await createImageBitmap(f);
      const sc = Math.min(1, 900 / Math.max(bmp.width, bmp.height));
      const c = document.createElement("canvas"); c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc);
      c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
      const blob = await new Promise(r => c.toBlob(r, "image/jpeg", 0.6));
      await idb.put(D.at + "|" + key, blob);
      delete proofUrls[key];
      D.proof = D.proof || {}; D.proof[key] = { ...(D.proof[key] || {}), photo: true, t: Date.now() };
      save(); renderAll(); toast("Foto da entrega guardada");
    } catch { toast("Não consegui guardar a foto."); }
  });

  // Depois de "Entreguei": abre a navegação para a próxima parada (opcional, em Ajustes).
  // Navegação: o app lembra qual você usou por último (Waze, Google Maps ou Apple Mapas) e, depois de cada
  // "Entreguei", já abre esse mesmo app na próxima parada. Assim o GPS acompanha sem você trocar o destino.
  const NAVS = { waze: p => Core.links.waze(p), google: p => Core.links.gmaps(p), apple: p => Core.links.apple(p) };
  document.addEventListener("click", e => {
    const l = e.target.closest("a[href]"); if (!l) return;
    const h = l.getAttribute("href");
    const app = /waze\.com/.test(h) ? "waze" : /google\.com\/maps/.test(h) && !/waypoints/.test(h) ? "google" : /maps\.apple\.com/.test(h) ? "apple" : null;
    if (app && fin.navApp !== app) { fin.navApp = app; store.set("re:fin", fin); }
  }, true);
  const navMode = () => fin.autoNav || "auto";
  const navAppNow = () => (navMode() === "auto" ? fin.navApp : navMode() === "off" ? null : navMode());
  function autoNav(nx) {
    const app = navAppNow();
    if (!nx || !app || !NAVS[app]) return;
    window.open(NAVS[app](nx), "_blank", "noopener");
  }

  // Endereço por voz (Mercado Livre e outros), onde o navegador permite.
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  function voiceAddr() {
    if (!SR) return toast("Este navegador não tem reconhecimento de voz.");
    const r = new SR(); r.lang = "pt-BR"; r.interimResults = false; r.maxAlternatives = 1;
    toast("Pode falar o endereço…");
    r.onresult = ev => { const t = ev.results[0][0].transcript; $("aAddr").value = t; syncDraft(); findAddr(); };
    r.onerror = () => toast("Não entendi. Tente de novo ou digite.");
    r.start();
  }

  // ---------- veículo, dados e tela inicial ----------
  // Veículo em um toque: preenche consumo e desgaste por km (dá para ajustar em Valores do dia).
  const VEH = { carro: { name: "Carro", kml: 11, wear: 0.25 }, moto: { name: "Moto", kml: 35, wear: 0.12 }, util: { name: "Utilitário", kml: 9, wear: 0.35 } };
  const vehButtons = () => Object.entries(VEH).map(([k, v]) => `<button type="button" data-veh="${k}" class="${fin.vehicle === k ? "on" : ""}">${v.name}<small>${v.kml} km/l · ${brl(v.wear)}/km</small></button>`).join("");
  function setVehicle(k) {
    const v = VEH[k]; if (!v) return;
    Object.assign(fin, { vehicle: k, kml: v.kml, wear: v.wear }); store.set("re:fin", fin);
    $("fKml").value = fin.kml; $("fWear").value = fin.wear;
    renderHome(); $("vehPick").innerHTML = vehButtons();
    if (active) renderPainel();
    toast(`${v.name}: ${v.kml} km por litro e ${brl(v.wear)} de desgaste por km`);
  }

  // Os dados ficam no aparelho (localStorage). Backup em arquivo para não perder o histórico financeiro
  // e para levar para outro celular. Pedimos ao navegador para não apagar os dados sozinho.
  let persisted = null;
  try { navigator.storage?.persist?.().then(v => { persisted = v; renderData(); }).catch(() => {}); } catch {}
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
  const backupAge = () => { const t = store.get("re:lastBackup", 0); return t ? Date.now() - t : Infinity; };
  function backupData() {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("re:") && k !== "re:geoq" && k !== "re:cep") data[k] = localStorage.getItem(k);
    }
    const blob = new Blob([JSON.stringify({ app: "rota-certa", v: 1, at: Date.now(), routes: hist.length, data })], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `rota-certa-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    store.set("re:lastBackup", Date.now()); renderData(); renderHome();
    toast("Backup baixado. Guarde no Google Drive ou mande para o seu WhatsApp.");
  }
  let pendingRestore = null;
  $("restoreFile").addEventListener("change", async e => {
    const f = e.target.files[0]; e.target.value = "";
    if (!f) return;
    try {
      const b = JSON.parse(await f.text());
      if (b.app !== "rota-certa" || !b.data) throw new Error();
      pendingRestore = b;
      const h = (() => { try { return JSON.parse(b.data["re:hist"] || "[]").length; } catch { return 0; } })();
      $("scanOverlay").hidden = false;
      $("scanSheet").innerHTML = `<div class="addr-big">Restaurar backup?</div>
        <p>Backup de ${new Date(b.at).toLocaleString("pt-BR")}, com <b>${h} rota${h === 1 ? "" : "s"}</b> no histórico.</p>
        <p class="offroute">Os dados deste aparelho (histórico, valores e a rota aberta) serão trocados pelos do backup.</p>
        <button type="button" class="primary" data-restorego="1">Restaurar</button>
        <button type="button" class="line" data-close="1">Cancelar</button>`;
    } catch { toast("Esse arquivo não é um backup do Rota Certa."); }
  });
  function restoreGo() {
    const b = pendingRestore; if (!b) return;
    Object.keys(localStorage).filter(k => k.startsWith("re:") && k !== "re:geoq" && k !== "re:cep").forEach(k => localStorage.removeItem(k));
    Object.entries(b.data).forEach(([k, v]) => { try { localStorage.setItem(k, v); } catch {} });
    store.set("re:lastBackup", Date.now());
    location.replace(location.pathname + "?v=" + Date.now());
  }
  function renderData() {
    const age = backupAge();
    $("dataStat").innerHTML = `<span>${hist.length} rota${hist.length === 1 ? "" : "s"} no histórico, guardadas neste aparelho.</span>
      <span>Proteção contra limpeza automática: ${persisted === true ? `<b class="ok">ativa</b>` : persisted === false ? `<b class="no">não concedida</b> (instale o app na tela inicial)` : "verificando…"}</span>
      <span>Último backup: ${isFinite(age) ? `<b class="${age > 7 * 864e5 ? "no" : "ok"}">${new Date(Date.now() - age).toLocaleDateString("pt-BR")}</b>` : `<b class="no">nunca</b>`}</span>`;
  }
  // Tela inicial: escolher o veículo (primeiro uso), última rota fechada e lembrete de backup.
  function renderHome() {
    $("setup").innerHTML = fin.vehicle ? "" : `<div class="setup"><b>Primeiro, o seu veículo</b><span class="sub">Define o consumo e o desgaste usados no custo de cada rota.</span><div class="vehicles">${vehButtons()}</div></div>`;
    const last = hist.slice().sort((a, b) => b.t - a.t)[0];
    if (!last) { $("lastRoute").innerHTML = ""; return; }
    const k = Core.routeKpis(last);
    $("lastRoute").innerHTML = `<div class="card" style="background:var(--bg);gap:8px">
      <div class="lastroute"><span><span class="eyebrow">Última rota · ${new Date(last.t).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })}</span><br><span class="sub">${last.p} pacotes${k.km ? " · " + n1(k.km) + " km" : ""} · ${brl(k.grossPerPkg)} por pacote</span></span><b class="v" style="color:${k.net >= 0 ? "var(--ok)" : "var(--bad)"}">${brl(k.net)}</b></div>
      ${backupAge() > 7 * 864e5 ? `<button type="button" class="line" data-backup="1">Fazer backup do histórico (${hist.length} rota${hist.length === 1 ? "" : "s"})</button>` : ""}
    </div>`;
  }
  $("vehPick").innerHTML = vehButtons();

  // ---------- início: o dia salvo só volta se você pedir ----------
  if (D) {
    const okSaved = store.get("re:ok:" + D.at, {});
    const pend = D.pkgs.filter(p => !okSaved[p.tn]).length;
    $("resume").hidden = false;
    $("resume").innerHTML = `<div class="card" style="background:var(--bg)"><b>Rota salva: ${esc(D.at)}</b><span class="sub">${D.pkgs.length} pacotes · ${pend} pendentes</span>
      <div class="nav3" style="grid-template-columns:1fr 1fr"><button type="button" class="brand" data-resume="go">Continuar</button><button type="button" class="line" data-resume="clear">Começar do zero</button></div></div>`;
  }
  renderHome(); renderData();
  route();
})();
