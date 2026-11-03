// Rota Certa — lógica pura (sem DOM). Roda no navegador e no Node para testes.
const Core = (() => {
  const R = 6371000;
  function hav(a, b) {
    const toR = Math.PI / 180;
    const dLat = (b.lat - a.lat) * toR, dLng = (b.lng - a.lng) * toR;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }
  const STREET_FACTOR = 1.35;

  function stripAccents(s) { return s.normalize("NFD").replace(/[̀-ͯ]/g, ""); }

  // "R Doutor José da Silva , 100" -> { street: "jose silva", number: "100" }
  function parseAddress(addr) {
    const s = stripAccents(String(addr || "")).toLowerCase().replace(/\s+/g, " ").trim();
    const parts = s.split(",").map(p => p.trim());
    let street = parts[0] || "";
    let number = "";
    const tail = street.match(/^(.*?)\s+(\d+[a-z]?)$/);
    if (tail) { street = tail[1]; number = tail[2]; }
    if (!number && parts[1]) { const m = parts[1].match(/^(\d+[a-z]?)\b/); if (m) number = m[1]; }
    street = street
      .replace(/\(.*?\)/g, " ")
      .replace(/^(r|rua)\.?\s+/, "")
      .replace(/^(av|avenida)\.?\s+/, "")
      .replace(/^(al|alameda)\.?\s+/, "")
      .replace(/^(tv|travessa)\.?\s+/, "")
      .replace(/\b(dr|doutor)\.?\s+/g, "")
      .replace(/\bdes(embargador)?\.?\s+/g, "")
      .replace(/\bcpo\b/g, "campo")
      .replace(/\b(d[aeo]s?)\b/g, " ")
      .replace(/[^a-z0-9 ]/g, " ")
      .replace(/\s+/g, " ").trim();
    return { street, number };
  }

  // Janela de horário escrita no complemento: "Entrega até às 17:30", "após 14h".
  function parseWindow(addr) {
    const s = stripAccents(String(addr || "")).toLowerCase();
    const hm = (h, m) => String(+h).padStart(2, "0") + ":" + String(m ? +m : 0).padStart(2, "0");
    const until = s.match(/\bate\s*(?:as\s*)?(\d{1,2})\s*(?:[:h]\s*(\d{2})?)/);
    const after = s.match(/\b(?:apos|depois\s+d[ae]s?)\s*(?:as\s*)?(\d{1,2})\s*(?:[:h]\s*(\d{2})?)/)
      || s.match(/\bso\s+(?:estou|esta|tem\s+(?:alguem|gente))\b[^0-9]{0,25}?(?:a\s*partir\s*d[ae]s?\s*|as\s*)?(\d{1,2})\s*(?:[:h]\s*(\d{2})?)/);
    const w = {};
    if (until && +until[1] < 24) w.until = hm(until[1], until[2]);
    if (after && +after[1] < 24) w.after = hm(after[1], after[2]);
    return w.until || w.after ? w : null;
  }

  const HEADERS = {
    at: ["at id"], seq: ["sequence", "sequencia"], stop: ["stop", "parada"], tn: ["spx tn", "tracking", "tn"],
    address: ["destination address", "endereco", "address"], bairro: ["bairro", "neighborhood"],
    city: ["city", "cidade"], cep: ["zipcode/postal code", "zipcode", "cep"], lat: ["latitude", "lat"], lng: ["longitude", "lng", "lon"],
  };

  function parseRows(rows) {
    const hi = rows.findIndex(r => r && r.some(c => /latitude/i.test(String(c || ""))));
    if (hi < 0) throw new Error("Não achei a coluna Latitude. Confira se é a planilha exportada da rota.");
    const head = rows[hi].map(c => stripAccents(String(c || "")).toLowerCase().trim());
    const col = {};
    for (const [k, names] of Object.entries(HEADERS)) col[k] = head.findIndex(h => names.includes(h));
    if (col.lat < 0 || col.lng < 0 || col.address < 0) throw new Error("Faltam colunas de endereço ou coordenadas.");
    const num = v => { const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", ".")); return Number.isFinite(n) ? n : null; };
    const pkgs = [], bad = [];
    rows.slice(hi + 1).forEach(r => {
      if (!r || r.every(c => c == null || c === "")) return;
      const g = k => (col[k] >= 0 ? r[col[k]] : null);
      const p = {
        at: g("at") ? String(g("at")) : "", seq: num(g("seq")), shopeeStop: num(g("stop")),
        tn: String(g("tn") || "").trim(), address: String(g("address") || "").trim(), bairro: String(g("bairro") || "").trim(),
        city: String(g("city") || "").trim(), cep: String(g("cep") || ""), lat: num(g("lat")), lng: num(g("lng")),
      };
      if (p.lat == null || p.lng == null || Math.abs(p.lat) < 0.01) { bad.push(p); return; }
      Object.assign(p, parseAddress(p.address));
      p.window = parseWindow(p.address);
      pkgs.push(p);
    });
    return { pkgs, bad };
  }

  // Junta pacotes do mesmo endereço (rua + número) ou a até `radius` metros.
  function groupStops(pkgs, radius) {
    const parent = pkgs.map((_, i) => i);
    const find = i => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const join = (a, b) => { parent[find(a)] = find(b); };
    const byKey = new Map();
    pkgs.forEach((p, i) => {
      if (p.street && p.number) {
        const k = p.street + "|" + p.number;
        if (byKey.has(k)) join(i, byKey.get(k)); else byKey.set(k, i);
      }
    });
    for (let i = 0; i < pkgs.length; i++)
      for (let j = i + 1; j < pkgs.length; j++)
        if (hav(pkgs[i], pkgs[j]) <= radius) join(i, j);
    const groups = new Map();
    pkgs.forEach((p, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(p); });
    return [...groups.values()].map(list => {
      list.sort((a, b) => (a.seq ?? 1e9) - (b.seq ?? 1e9) || a.tn.localeCompare(b.tn));
      const lat = list.reduce((s, p) => s + p.lat, 0) / list.length;
      const lng = list.reduce((s, p) => s + p.lng, 0) / list.length;
      const streetCount = {};
      list.forEach(p => { streetCount[p.street] = (streetCount[p.street] || 0) + 1; });
      const street = Object.entries(streetCount).sort((a, b) => b[1] - a[1])[0][0];
      const label = list[0].address.split(",").slice(0, 2).join(",").replace(/\s+,/g, ",").trim();
      const numbers = [...new Set(list.map(p => p.number).filter(Boolean))];
      const shopeeStops = [...new Set(list.map(p => p.shopeeStop).filter(v => v != null))].sort((a, b) => a - b);
      const minSeq = Math.min(...list.map(p => p.seq ?? 1e9));
      const windows = list.map(p => p.window).filter(Boolean);
      const until = windows.map(w => w.until).filter(Boolean).sort()[0] || null;
      const after = windows.map(w => w.after).filter(Boolean).sort().pop() || null;
      const key = list.map(p => p.tn).sort()[0];
      return { key, lat, lng, pkgs: list, street, label, numbers, shopeeStops, minSeq, bairro: list[0].bairro, until, after, unseq: list.filter(p => p.seq == null).length };
    });
  }

  // Custo entre paradas: distância (rua ou reta x fator) + penalidade ao trocar de rua.
  function buildCost(points, roadMatrix, streetPenalty) {
    const n = points.length;
    const C = Array.from({ length: n }, () => new Float64Array(n));
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const d = roadMatrix ? roadMatrix[i][j] : hav(points[i], points[j]) * STREET_FACTOR;
        const pen = points[i].street && points[j].street && points[i].street !== points[j].street ? streetPenalty : 0;
        C[i][j] = d + pen;
      }
    return C;
  }

  function pathCost(C, t) { let s = 0; for (let i = 1; i < t.length; i++) s += C[t[i - 1]][t[i]]; return s; }
  function rng(seed) { let x = seed >>> 0 || 1; return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296); }

  // Caminho aberto saindo de `start`, sem voltar. Vizinho mais próximo + 2-opt + Or-opt, com reinícios.
  function solve(C, start, restarts = 40) {
    const n = C.length;
    if (n <= 2) return [start, ...[...Array(n).keys()].filter(i => i !== start)];
    const rand = rng(12345);
    let best = null, bestCost = Infinity;
    for (let r = 0; r < restarts; r++) {
      const left = new Set([...Array(n).keys()]); left.delete(start);
      const t = [start];
      while (left.size) {
        const cur = t[t.length - 1];
        const cand = [...left].sort((a, b) => C[cur][a] - C[cur][b]);
        const pick = r === 0 ? cand[0] : cand[rand() < 0.75 || cand.length === 1 ? 0 : 1];
        t.push(pick); left.delete(pick);
      }
      improve(C, t);
      const c = pathCost(C, t);
      if (c < bestCost - 1e-9) { bestCost = c; best = t.slice(); }
    }
    return best;
  }

  function improve(C, t) {
    const n = t.length;
    let improved = true, guard = 0;
    while (improved && guard++ < 200) {
      improved = false;
      // 2-opt (reverte t[i..j]); trecho recalculado por causa de ruas de mão única
      for (let i = 1; i < n - 1; i++) {
        for (let j = i + 1; j < n; j++) {
          const before = C[t[i - 1]][t[i]] + (j + 1 < n ? C[t[j]][t[j + 1]] : 0) + segCost(C, t, i, j);
          const after = C[t[i - 1]][t[j]] + (j + 1 < n ? C[t[i]][t[j + 1]] : 0) + segCostRev(C, t, i, j);
          if (after < before - 1e-6) { reverse(t, i, j); improved = true; }
        }
      }
      // Or-opt: move blocos de 1 a 3 paradas para outra posição
      for (let len = 1; len <= 3; len++) {
        for (let i = 1; i + len <= n; i++) {
          const seg = t.slice(i, i + len);
          const rest = t.slice(0, i).concat(t.slice(i + len));
          let bestPos = -1, bestVal = pathCost(C, t) - 1e-6;
          for (let k = 1; k <= rest.length; k++) {
            if (k === i) continue;
            const v = pathCost(C, rest.slice(0, k).concat(seg, rest.slice(k)));
            if (v < bestVal) { bestVal = v; bestPos = k; }
          }
          if (bestPos >= 0) {
            const cand = rest.slice(0, bestPos).concat(seg, rest.slice(bestPos));
            for (let q = 0; q < n; q++) t[q] = cand[q];
            improved = true;
          }
        }
      }
    }
  }
  function segCost(C, t, i, j) { let s = 0; for (let k = i; k < j; k++) s += C[t[k]][t[k + 1]]; return s; }
  function segCostRev(C, t, i, j) { let s = 0; for (let k = j; k > i; k--) s += C[t[k]][t[k - 1]]; return s; }
  function reverse(t, i, j) { while (i < j) { const x = t[i]; t[i] = t[j]; t[j] = x; i++; j--; } }

  function legDist(points, a, b, roadMatrix) { return roadMatrix ? roadMatrix[a][b] : hav(points[a], points[b]) * STREET_FACTOR; }
  function distOf(points, order, roadMatrix) {
    let s = 0;
    for (let i = 1; i < order.length; i++) s += legDist(points, order[i - 1], order[i], roadMatrix);
    return s;
  }

  // Zonas do veículo em ordem de acesso: o bloco 1 vai para a zona mais à mão.
  const VEHICLES = {
    carro: {
      name: "Carro (hatch ou sedã)",
      zones: [
        { code: "A", name: "Banco do passageiro", hint: "à mão, sem sair do carro" },
        { code: "B", name: "Banco traseiro, lado direito", hint: "porta do lado da calçada" },
        { code: "C", name: "Banco traseiro, lado esquerdo", hint: "porta de trás do motorista" },
        { code: "D", name: "Porta-malas, lado direito", hint: "abre a tampa, à direita" },
        { code: "E", name: "Porta-malas, lado esquerdo", hint: "abre a tampa, à esquerda" },
      ],
    },
    utilitario: {
      name: "Utilitário (Fiorino, Kangoo, Saveiro)",
      zones: [
        { code: "A", name: "Banco do passageiro", hint: "à mão, sem sair do carro" },
        { code: "B", name: "Baú, junto à porta, direita", hint: "primeiro que se vê ao abrir" },
        { code: "C", name: "Baú, junto à porta, esquerda", hint: "primeiro que se vê ao abrir" },
        { code: "D", name: "Baú, meio, direita", hint: "um passo para dentro" },
        { code: "E", name: "Baú, meio, esquerda", hint: "um passo para dentro" },
        { code: "F", name: "Baú, fundo", hint: "junto à cabine" },
      ],
    },
    moto: {
      name: "Moto (baú ou bag)",
      zones: [
        { code: "A", name: "Bag, por cima", hint: "primeiro que se pega" },
        { code: "B", name: "Bag, no meio", hint: "" },
        { code: "C", name: "Bag, no fundo", hint: "último a sair" },
      ],
    },
  };

  // Bloco = grupo de N paradas seguidas. Bloco b vai para a zona b (com volta, por baixo, se faltar zona).
  // `list` (opcional) restringe às zonas reservadas para uma rota quando há mais de uma no dia.
  function zoneFor(block, vehicle, list) {
    const zones = (VEHICLES[vehicle] || VEHICLES.carro).zones;
    const idxs = list && list.length ? list : zones.map((_, i) => i);
    const zoneIdx = idxs[block % idxs.length];
    return { zone: zones[zoneIdx], zoneIdx, layer: Math.floor(block / idxs.length) };
  }

  // Reparte as zonas entre as rotas pela quantidade de pacotes. A primeira rota fica com as zonas mais à mão.
  function splitZones(nZones, counts) {
    const R = counts.length;
    if (R <= 1) return [[...Array(nZones).keys()]];
    if (R >= nZones) return counts.map((_, i) => [i % nZones]);
    const total = counts.reduce((a, b) => a + b, 0) || 1;
    const sizes = counts.map(c => Math.max(1, Math.floor(c / total * nZones)));
    while (sizes.reduce((a, b) => a + b, 0) > nZones) sizes[sizes.indexOf(Math.max(...sizes))]--;
    while (sizes.reduce((a, b) => a + b, 0) < nZones) {
      const want = counts.map((c, i) => c / total * nZones - sizes[i]);
      sizes[want.indexOf(Math.max(...want))]++;
    }
    let z = 0;
    return sizes.map(n => Array.from({ length: n }, () => z++));
  }

  // Tempo estimado: direção + atendimento + busca do pacote no veículo em cada parada.
  function estimateMinutes(legsMeters, stops, a) {
    const drive = legsMeters.reduce((s, m) => s + m, 0) / 1000 / a.speed * 60;
    const service = stops.reduce((s, st) => s + a.stopMin + a.extraPkgMin * (st.pkgs.length - 1), 0);
    return { drive, service, messy: drive + service + stops.length * a.searchMessy, organized: drive + service + stops.length * a.searchOrg };
  }

  function finance(f) {
    const liters = f.kml > 0 ? f.km / f.kml : 0;
    const fuel = liters * (f.price || 0);
    const gain = f.payMode === "pacote" ? (f.payValue || 0) * f.delivered : f.payMode === "parada" ? (f.payValue || 0) * f.stopsDone : (f.payValue || 0) * (f.routes || 1);
    const costs = fuel + (f.extras || 0);
    const profit = gain - costs;
    return {
      liters, fuel, gain, costs, profit,
      perHour: f.hours > 0 ? profit / f.hours : null,
      perKm: f.km > 0 ? profit / f.km : null,
      perPkg: f.delivered > 0 ? profit / f.delivered : null,
      costPerKm: f.km > 0 ? costs / f.km : null,
    };
  }

  // Busca pelo fim do código: "0507", "507O" ou o código inteiro.
  function matchTN(pkgs, q) {
    q = String(q || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (q.length < 3) return [];
    const exact = pkgs.filter(p => p.tn.toUpperCase() === q);
    if (exact.length) return exact;
    return pkgs.filter(p => {
      const t = p.tn.toUpperCase();
      return t.endsWith(q) || t.replace(/[A-Z]+$/, "").endsWith(q);
    });
  }

  // ---------- rota por endereço ----------
  // Uma parada por endereço (rua + número); a parada da Shopee vira só referência.
  // Mesmo CEP + nome parecido = mesma rua ("Dr Joaquim Afonso de P Neves" e "Doutor Joaquim Affonso de Paula Neves").
  function lev(a, b) {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  }
  function similarStreet(a, b) {
    const ta = a.split(" ").filter(t => t.length > 2), tb = b.split(" ").filter(t => t.length > 2);
    const [s, l] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
    if (!s.length) return false;
    const hit = s.filter(t => l.some(u => u === t || u.startsWith(t) || t.startsWith(u) || (t.length > 3 && lev(t, u) <= 2))).length;
    return hit / s.length >= 0.6;
  }
  function unifyStreets(pkgs) {
    const byCep = new Map();
    pkgs.forEach(p => { const c = String(p.cep || "").replace(/\D/g, ""); if (c.length === 8 && p.street) { if (!byCep.has(c)) byCep.set(c, []); byCep.get(c).push(p); } });
    byCep.forEach(list => {
      const names = [...new Set(list.map(p => p.street))].sort((a, b) => b.length - a.length);
      names.forEach((n, i) => {
        const canon = names.slice(0, i).find(m => similarStreet(n, m));
        if (canon) list.forEach(p => { if (p.street === n) p.street = canon; });
      });
    });
    return pkgs;
  }

  function buildAddresses(pkgs) {
    unifyStreets(pkgs);
    const map = new Map();
    pkgs.forEach(p => {
      const key = p.street && p.number ? p.street + "|" + p.number : "geo|" + p.lat.toFixed(4) + "," + p.lng.toFixed(4);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(p);
    });
    // CEP + número da casa identifica o endereço mesmo com a rua escrita de outro jeito ("R Doutor..." x "Rua Dr...").
    // CEP usado em várias ruas (CEP geral da cidade) não conta, e os dois pontos precisam estar a até 300 m (CEP digitado errado).
    const cepOf = p => String(p.cep || "").replace(/\D/g, "");
    const cepStreets = new Map();
    pkgs.forEach(p => { const c = cepOf(p); if (c.length === 8 && p.street) { if (!cepStreets.has(c)) cepStreets.set(c, new Set()); cepStreets.get(c).add(p.street); } });
    const cepNum = l => {
      const p = l.find(x => cepOf(x).length === 8 && parseInt(x.number, 10) > 0 && cepStreets.get(cepOf(x)).size <= 2);
      return p ? cepOf(p) + "|" + parseInt(p.number, 10) : null;
    };
    // Números diferentes no mesmo ponto (condomínio, mesma casa) viram uma parada só:
    // mesma rua a até 25 m, ou qualquer rua a até 10 m.
    const groups = [...map.entries()];
    const centre = l => ({ lat: l.reduce((t, p) => t + p.lat, 0) / l.length, lng: l.reduce((t, p) => t + p.lng, 0) / l.length });
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const [ki, li] = groups[i], [kj, lj] = groups[j];
        const d = hav(centre(li), centre(lj));
        const sameCepNum = d <= 300 && cepNum(li) && cepNum(li) === cepNum(lj);
        if (sameCepNum || d <= 10 || (d <= 25 && li[0].street && li[0].street === lj[0].street)) {
          groups[i] = [ki, li.concat(lj)];
          groups.splice(j, 1); j = i;
        }
      }
    }
    return groups.map(([key, list]) => {
      list.sort((a, b) => (a.shopeeStop ?? 1e9) - (b.shopeeStop ?? 1e9) || a.tn.localeCompare(b.tn));
      const nums = [...new Set(list.map(p => parseInt(p.number, 10)).filter(n => n > 0))].sort((a, b) => a - b);
      const lat = list.reduce((s, p) => s + p.lat, 0) / list.length, lng = list.reduce((s, p) => s + p.lng, 0) / list.length;
      const wins = list.map(p => p.window).filter(Boolean);
      return {
        key, pkgs: list, lat, lng, street: list[0].street, num: nums[0] || 0, nums,
        cep: (list.map(p => String(p.cep || "").replace(/\D/g, "")).find(c => c.length === 8)) || "",
        until: wins.map(w => w.until).filter(Boolean).sort()[0] || null,
        after: wins.map(w => w.after).filter(Boolean).sort().pop() || null,
        label: nums.length > 1 ? list[0].address.split(",")[0].replace(/\s+\d+[a-z]?\s*$/i, "").trim() + ", " + nums.join(" / ") : list[0].address.split(",").slice(0, 2).join(",").replace(/\s+,/g, ",").trim(),
        bairro: list[0].bairro,
        shopeeStops: [...new Set(list.map(p => p.shopeeStop).filter(v => v != null))].sort((a, b) => a - b),
        unseq: list.filter(p => p.seq == null && !p.src).length,
        srcs: [...new Set(list.map(p => p.src).filter(Boolean))],
      };
    });
  }

  // Trechos de rua: endereços da mesma rua em ordem de número; trecho quebra se o próximo número fica a mais de `gapM`.
  function streetSegments(addrs, gapM = 250) {
    const byStreet = new Map();
    addrs.forEach(a => { const k = a.key.startsWith("geo|") ? a.key : a.street; if (!byStreet.has(k)) byStreet.set(k, []); byStreet.get(k).push(a); });
    const segs = [];
    byStreet.forEach(list => {
      list.sort((a, b) => a.num - b.num);
      let cur = [list[0]];
      for (let i = 1; i < list.length; i++) {
        if (hav(list[i - 1], list[i]) > gapM) { segs.push(cur); cur = []; }
        cur.push(list[i]);
      }
      segs.push(cur);
    });
    return segs.map(addrs => ({ addrs, len: addrs.slice(1).reduce((s, a, i) => s + hav(addrs[i], a), 0) }));
  }

  const toMin = hm => { const m = String(hm || "").match(/^(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : null; };

  // Ordem dos trechos (cada um percorrido inteiro, num sentido ou no outro), saindo do endereço `startKey`.
  // opts.from: {lat,lng} de onde você está (a rota começa pelo trecho mais perto e pode começar por qualquer um).
  // opts.clock: { start (minutos desde 0h), speed (km/h), stopMin, latePenalty (m por minuto de atraso) }:
  //   endereços com "entrega até HH:MM" ganham prioridade; "após HH:MM" evita chegar antes da hora.
  function addressRoute(addrs, startKey, opts = {}) {
    const segs = streetSegments(addrs);
    const ends = (s, dir) => (dir ? [s.addrs[s.addrs.length - 1], s.addrs[0]] : [s.addrs[0], s.addrs[s.addrs.length - 1]]);
    const from = opts.from && Number.isFinite(opts.from.lat) ? opts.from : null;
    // opts.to: onde a rota termina (casa ou CD); o último trecho já fica perto dele.
    const to = opts.to && Number.isFinite(opts.to.lat) ? opts.to : null;
    const clk = opts.clock && addrs.some(a => a.until || a.after) ? { speed: 18, stopMin: 3, latePenalty: 400, ...opts.clock } : null;
    const timePenalty = path => {
      let t = clk.start, pos = from, pen = 0;
      const mPerMin = clk.speed * 1000 / 60;
      path.forEach(([si, d]) => {
        (d ? segs[si].addrs.slice().reverse() : segs[si].addrs).forEach(a => {
          if (pos) t += hav(pos, a) * STREET_FACTOR / mPerMin;
          const u = toMin(a.until), af = toMin(a.after);
          if (af != null && t < af) { pen += (af - t) * clk.latePenalty * 0.4; t = af; }
          if (u != null && t > u) pen += (t - u) * clk.latePenalty;
          t += clk.stopMin; pos = a;
        });
      });
      return pen;
    };
    const cost = path => path.reduce((t, [si, d], i) => {
      if (!i) return t + (from ? hav(from, ends(segs[si], d)[0]) * STREET_FACTOR : 0);
      const [pi, pd] = path[i - 1];
      return t + hav(ends(segs[pi], pd)[1], ends(segs[si], d)[0]) * STREET_FACTOR;
    }, 0) + (clk ? timePenalty(path) : 0)
      + (to && path.length ? hav(ends(segs[path[path.length - 1][0]], path[path.length - 1][1])[1], to) * STREET_FACTOR : 0);
    let first, firstDir;
    if (from) {
      let bd = Infinity;
      segs.forEach((s, i) => [0, 1].forEach(d => { const v = hav(from, ends(s, d)[0]); if (v < bd) { bd = v; first = i; firstDir = d; } }));
    } else {
      first = segs.findIndex(s => s.addrs.some(a => a.key === startKey));
      if (first < 0) first = 0;
      const fs = segs[first], at = fs.addrs.findIndex(a => a.key === startKey);
      firstDir = at > (fs.addrs.length - 1) / 2 ? 1 : 0;
    }
    const path = [[first, firstDir]];
    const left = new Set(segs.map((_, i) => i)); left.delete(first);
    while (left.size) {
      const exit = ends(segs[path[path.length - 1][0]], path[path.length - 1][1])[1];
      let best = null, bd = Infinity;
      left.forEach(i => [0, 1].forEach(d => { const v = hav(exit, ends(segs[i], d)[0]); if (v < bd) { bd = v; best = [i, d]; } }));
      path.push(best); left.delete(best[0]);
    }
    // Melhora: move ou inverte blocos de 1 a 3 trechos enquanto o caminho encurtar.
    // Saindo de onde você está, o primeiro trecho também pode mudar; saindo de um endereço, ele fica fixo.
    const lo = from ? 0 : 1;
    let improved = true, guard = 0;
    while (improved && guard++ < 100) {
      improved = false;
      for (let len = 1; len <= 3; len++) {
        for (let i = lo; i + len <= path.length; i++) {
          const block = path.slice(i, i + len);
          const rest = path.slice(0, i).concat(path.slice(i + len));
          const base = cost(path);
          let best = null, bv = base - 1;
          for (let k = lo; k <= rest.length; k++) {
            for (const rev of [false, true]) {
              const b = rev ? block.slice().reverse().map(([s, d]) => [s, 1 - d]) : block;
              const cand = rest.slice(0, k).concat(b, rest.slice(k));
              const v = cost(cand);
              if (v < bv) { bv = v; best = cand; }
            }
          }
          if (best) { path.splice(0, path.length, ...best); improved = true; }
        }
      }
    }
    const order = path.flatMap(([si, d]) => (d ? segs[si].addrs.slice().reverse() : segs[si].addrs));
    return { order, km: seqMeters(order, from, to), segs: path.length };
  }

  // Metros de uma sequência de endereços (fator de rua sobre a reta), opcionalmente saindo de `from`.
  function seqMeters(list, from, to) {
    let m = from && list.length ? hav(from, list[0]) * STREET_FACTOR : 0;
    for (let i = 1; i < list.length; i++) m += hav(list[i - 1], list[i]) * STREET_FACTOR;
    if (to && list.length) m += hav(list[list.length - 1], to) * STREET_FACTOR;
    return m;
  }

  // Ordem de carga: as paradas, na ordem da rota, são divididas em blocos iguais, um por zona do veículo.
  // A primeira parte da rota vai para a zona mais à mão (A); carregue de trás para frente (a última zona primeiro).
  function loadPlan(keys, vehicle) {
    const zones = (VEHICLES[vehicle] || VEHICLES.carro).zones;
    const per = Math.max(1, Math.ceil(keys.length / zones.length));
    const map = {};
    keys.forEach((k, i) => (map[k] = Math.min(zones.length - 1, Math.floor(i / per))));
    return { map, zones, per };
  }

  // Hora prevista em cada endereço: deslocamento pela rua (velocidade média) + tempo por parada.
  function etas(list, opts) {
    const o = { speed: 18, stopMin: 3, ...opts };
    const mPerMin = o.speed * 1000 / 60;
    let t = o.start, pos = o.from || null;
    return list.map(a => {
      if (pos) t += hav(pos, a) * STREET_FACTOR / mPerMin;
      const arrive = t;
      t += o.stopMin * (1 + 0.3 * Math.max(0, (a.pkgs?.length || 1) - 1));
      pos = a;
      return arrive;
    });
  }

  // ---------- endereço x CEP ----------
  // `info` é a resposta do ViaCEP ({ logradouro, bairro, localidade, uf } ou { erro: true }).
  // CEP geral da cidade vem sem logradouro e não serve para conferir a rua.
  function cepCheck(street, info) {
    if (!info) return { status: "unknown" };
    if (info.erro) return { status: "invalid" };
    const lg = parseAddress(info.logradouro || "").street;
    if (!lg) return { status: "general" };
    if (!street) return { status: "ok", street: lg };
    return similarStreet(street, lg) ? { status: "ok", street: lg } : { status: "mismatch", street: lg, name: String(info.logradouro || "").trim() };
  }

  // Pino fora do lugar. Na numeração brasileira o número da casa é, mais ou menos, a distância em metros desde o
  // começo da rua: a casa 120 fica perto da 150. Um endereço longe de todas as outras casas da mesma rua (com folga
  // pela diferença de número) ou de todos os endereços do mesmo CEP está com a coordenada errada.
  function pinOutliers(addrs) {
    const out = new Map();
    const cepStreets = new Map();
    addrs.forEach(a => { if (a.cep) { if (!cepStreets.has(a.cep)) cepStreets.set(a.cep, new Set()); cepStreets.get(a.cep).add(a.street); } });
    addrs.forEach(a => {
      if (a.key.startsWith("geo|")) return;
      const street = addrs.filter(b => b !== a && b.street && b.street === a.street && b.num > 0 && !b.key.startsWith("geo|"));
      if (a.num > 0 && street.length >= 2) {
        const ok = street.filter(b => hav(a, b) <= Math.abs(a.num - b.num) * 2.5 + 350);
        // As outras casas precisam concordar entre si (senão a rua é que é longa ou repetida em outro bairro).
        const agree = street.filter(b => street.some(c => c !== b && hav(b, c) <= Math.abs(b.num - c.num) * 2.5 + 350)).length;
        if (!ok.length && agree >= 2) {
          const near = street.slice().sort((x, y) => Math.abs(x.num - a.num) - Math.abs(y.num - a.num))[0];
          out.set(a.key, { why: "rua", meters: Math.round(hav(a, near)), ref: near, guess: interpolate(a.num, street) });
          return;
        }
      }
      if (a.cep && (cepStreets.get(a.cep)?.size || 0) <= 2) {
        const same = addrs.filter(b => b !== a && b.cep === a.cep);
        if (same.length >= 2 && same.every(b => hav(a, b) > 1200)) {
          const near = same.slice().sort((x, y) => hav(a, x) - hav(a, y))[0];
          out.set(a.key, { why: "cep", meters: Math.round(hav(a, near)), ref: near, guess: null });
        }
      }
    });
    return out;
  }

  // Posição estimada de um número pela posição das outras casas da rua (interpolação entre os dois números vizinhos).
  function interpolate(num, street) {
    const pts = street.filter(b => b.num > 0).sort((x, y) => x.num - y.num);
    if (pts.length < 2) return null;
    let i = pts.findIndex(b => b.num >= num);
    if (i <= 0) i = i === 0 ? 1 : pts.length - 1;
    const a = pts[i - 1], b = pts[i];
    if (a.num === b.num) return { lat: a.lat, lng: a.lng };
    const f = Math.max(-0.5, Math.min(1.5, (num - a.num) / (b.num - a.num)));
    return { lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f };
  }

  // ---------- km rodados pelo GPS ----------
  // Ignora leituras imprecisas (> 50 m), tremidas (< 15 m) e saltos impossíveis (> 160 km/h).
  function trackStep(st, fix) {
    st = st || { m: 0, last: null };
    if (!fix || !(fix.acc <= 50)) return st;
    if (!st.last) return { m: st.m, last: fix };
    const d = hav(st.last, fix), dt = Math.max(1, (fix.t - st.last.t) / 1000);
    if (d < 15) return st;
    if (d / dt > 45) return { m: st.m, last: fix };
    return { m: st.m + d, last: fix };
  }

  // ---------- indicadores ----------
  // Registro de uma rota no histórico: t (início), ms (duração), p (pacotes entregues), a (paradas), total (pacotes
  // na rota), km, fuel (R$), other (outros gastos R$), g (bruto R$), gS/gM/gO e pS/pM/pO (por plataforma),
  // later (endereços "voltar depois"), att2 (pacotes em nova tentativa). Registros antigos só têm p, a, ms, g e l.
  function routeKpis(r) {
    const h = (r.ms || 0) / 3.6e6, km = r.km || 0, p = r.p || 0, a = r.a || 0;
    const gross = r.g || 0;
    const fuel = r.fuel != null ? r.fuel : r.l != null ? Math.max(0, gross - r.l) : 0;
    const other = r.other || 0, wear = r.wear || 0, fixed = r.fixed || 0;
    // Custo operacional = combustível + desgaste do veículo (R$ por km) + custos fixos do dia + outros gastos.
    const cost = fuel + wear + fixed + other;
    const net = gross - cost;
    const div = (x, y) => (y > 0 ? x / y : null);
    // Rota de menos de 15 minutos (teste ou registro incompleto) não gera taxa por hora nem tempo por parada.
    const hr = h >= 0.25 ? h : 0;
    return {
      hours: h, km, gross, fuel, wear, fixed, other, cost, net, p, a,
      pkgPerHour: div(p, hr), stopPerHour: div(a, hr), minPerStop: hr ? div((r.ms || 0) / 60000, a) : null,
      kmPerPkg: km ? div(km, p) : null, grossPerPkg: div(gross, p), netPerPkg: div(net, p), costPerPkg: div(cost, p), costPerKm: km ? div(cost, km) : null,
      grossPerKm: km ? div(gross, km) : null, netPerKm: km ? div(net, km) : null, netPerHour: div(net, hr),
      margin: div(net, gross), success: r.total ? p / r.total : null,
      laterRate: r.later != null && a ? r.later / a : null,
      fails: r.fails || 0, failRate: r.fails != null && p + r.fails ? r.fails / (p + r.fails) : null,
    };
  }

  // Totais e médias de um conjunto de rotas, com o valor médio por pacote de cada plataforma.
  function summarize(rows) {
    const ks = rows.map(routeKpis);
    const sum = k => ks.reduce((t, x) => t + (x[k] || 0), 0);
    const n = rows.length;
    const withKm = ks.filter(x => x.km > 0);
    const plat = {};
    [["S", "Shopee"], ["M", "Mercado Livre"], ["O", "Outras"]].forEach(([k, name]) => {
      const g = rows.reduce((t, r) => t + (r["g" + k] || 0), 0), p = rows.reduce((t, r) => t + (r["p" + k] || 0), 0);
      if (p > 0 && g > 0) plat[name] = { g, p, perPkg: g / p };
    });
    const avg = (k, list = ks) => { const v = list.map(x => x[k]).filter(x => x != null && isFinite(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
    return {
      n, p: sum("p"), a: sum("a"), hours: sum("hours"), km: sum("km"), gross: sum("gross"), fuel: sum("fuel"), wear: sum("wear"), fixed: sum("fixed"), other: sum("other"), cost: sum("cost"), net: sum("net"),
      costPerKm: withKm.length ? withKm.reduce((t, x) => t + x.cost, 0) / withKm.reduce((t, x) => t + x.km, 0) : null,
      perRoute: n ? { gross: sum("gross") / n, net: sum("net") / n, p: sum("p") / n, fuel: sum("fuel") / n, km: withKm.length ? withKm.reduce((t, x) => t + x.km, 0) / withKm.length : null, hours: sum("hours") / n } : null,
      grossPerPkg: sum("p") ? sum("gross") / sum("p") : null, netPerPkg: sum("p") ? sum("net") / sum("p") : null,
      kmPerPkg: withKm.length ? withKm.reduce((t, x) => t + x.km, 0) / withKm.reduce((t, x) => t + x.p, 0) : null,
      netPerHour: sum("hours") ? sum("net") / sum("hours") : null, margin: sum("gross") ? sum("net") / sum("gross") : null,
      minPerStop: avg("minPerStop"), pkgPerHour: avg("pkgPerHour"), plat,
    };
  }

  // Junta as rotas do mesmo dia (horário local): soma tudo e guarda quantas rotas foram.
  function groupByDay(rows) {
    const SUM = ["p", "a", "ms", "km", "fuel", "wear", "fixed", "other", "fails", "g", "gS", "gM", "gO", "pS", "pM", "pO", "total", "later", "att2"];
    const days = new Map();
    rows.forEach(r => {
      const d = new Date(r.t), key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
      const k = routeKpis(r);
      if (!days.has(key)) days.set(key, { id: "dia:" + key, day: key, t: r.t, routes: 0 });
      const x = days.get(key);
      x.routes++; x.t = Math.min(x.t, r.t);
      SUM.forEach(f => {
        const v = f === "fuel" ? k.fuel : r[f];
        if (v != null && isFinite(v)) x[f] = (x[f] || 0) + v;
      });
    });
    return [...days.values()].map(x => ({ ...x, l: (x.g || 0) - (x.fuel || 0) - (x.wear || 0) - (x.fixed || 0) - (x.other || 0) }));
  }

  // Tendência: média das rotas mais recentes x média das anteriores (até 7 de cada lado), e a série de cada
  // indicador com média móvel de 5 rotas. Só diz "subindo" ou "caindo" com 5 rotas ou mais.
  const TREND = [
    { k: "grossPerPkg", name: "Valor por pacote", dir: 1 },
    { k: "netPerPkg", name: "Líquido por pacote", dir: 1 },
    { k: "kmPerPkg", name: "Km por pacote", dir: -1 },
    { k: "costPerKm", name: "Custo operacional por km", dir: -1 },
    { k: "netPerHour", name: "Líquido por hora", dir: 1 },
    { k: "net", name: "Líquido por rota", dir: 1 },
  ];
  function trend(rows, win = 5) {
    const sorted = rows.slice().sort((a, b) => a.t - b.t).map(r => ({ r, k: routeKpis(r) }));
    const mean = l => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : null);
    return TREND.map(m => {
      const pts = sorted.filter(x => x.k[m.k] != null && isFinite(x.k[m.k])).map(x => ({ t: x.r.t, v: x.k[m.k] }));
      const ma = pts.map((_, i) => mean(pts.slice(Math.max(0, i - win + 1), i + 1).map(p => p.v)));
      const out = { ...m, pts, ma, last: pts.length ? pts[pts.length - 1].v : null, avg: mean(pts.map(p => p.v)), change: null, status: "poucos" };
      if (pts.length >= 5) {
        const n = Math.min(7, Math.floor(pts.length / 2));
        const rec = mean(pts.slice(-n).map(p => p.v)), old = mean(pts.slice(-2 * n, -n).map(p => p.v));
        out.recent = rec; out.before = old;
        if (old) {
          out.change = rec / old - 1;
          out.status = Math.abs(out.change) < 0.03 ? "estavel" : out.change * m.dir > 0 ? "melhorando" : "piorando";
        }
      }
      return out;
    });
  }

  // Projeção do mês: líquido até agora + média por dia trabalhado x dias de trabalho que ainda devem vir
  // (na mesma proporção de dias trabalhados até hoje).
  function monthProjection(rows, now = Date.now()) {
    const d = new Date(now), y = d.getFullYear(), m = d.getMonth();
    const inMonth = rows.filter(r => { const x = new Date(r.t); return x.getFullYear() === y && x.getMonth() === m; });
    const net = inMonth.reduce((t, r) => t + routeKpis(r).net, 0), gross = inMonth.reduce((t, r) => t + (r.g || 0), 0);
    const days = groupByDay(inMonth).length;
    const today = d.getDate(), last = new Date(y, m + 1, 0).getDate();
    const perDay = days ? net / days : null;
    const workRate = days / today;
    const projected = days ? net + perDay * workRate * (last - today) : null;
    return { routes: inMonth.length, days, net, gross, perDay, projected, daysLeft: last - today, month: d.toLocaleDateString("pt-BR", { month: "long" }) };
  }

  // Ponto de equilíbrio: quanto uma rota média custa para rodar (km médio x custo por km + fixos do dia).
  function breakEven(rows, opts = {}) {
    const ks = rows.map(routeKpis).filter(k => k.km > 0);
    if (!ks.length) return null;
    const km = ks.reduce((t, k) => t + k.km, 0) / ks.length;
    const varCost = ks.reduce((t, k) => t + k.fuel + k.wear, 0) / ks.reduce((t, k) => t + k.km, 0);
    const perRoute = km * varCost + (opts.fixed || 0);
    const pkgs = ks.reduce((t, k) => t + k.p, 0) / ks.length;
    return { km, varCost, perRoute, perPkg: pkgs ? perRoute / pkgs : null };
  }

  // Oportunidades de melhoria: compara a rota mais recente com a média das anteriores.
  function insights(rows) {
    const out = [];
    if (!rows.length) return out;
    const sorted = rows.slice().sort((a, b) => a.t - b.t);
    const last = routeKpis(sorted[sorted.length - 1]);
    const prev = sorted.slice(0, -1);
    const base = prev.length >= 2 ? summarize(prev) : null;
    const pct = (x, y) => Math.round((x / y - 1) * 100);
    const n1 = (v, d = 1) => v.toLocaleString("pt-BR", { maximumFractionDigits: d, minimumFractionDigits: d });
    const brl = v => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    if (base) {
      if (last.kmPerPkg && base.kmPerPkg && last.kmPerPkg > base.kmPerPkg * 1.2)
        out.push({ tone: "warn", text: `Na última rota você rodou ${n1(last.kmPerPkg, 2)} km por pacote, ${pct(last.kmPerPkg, base.kmPerPkg)}% acima da sua média. Confira os endereços com alerta e use "Refazer a rota a partir de onde estou".` });
      if (last.minPerStop && base.minPerStop && last.minPerStop > base.minPerStop * 1.2)
        out.push({ tone: "warn", text: `O tempo por parada subiu para ${n1(last.minPerStop)} min (média ${n1(base.minPerStop)} min). Separar os sacos por área e conferir os pacotes antes de sair encurta cada parada.` });
      if (last.netPerHour != null && base.netPerHour != null && last.netPerHour > base.netPerHour * 1.1)
        out.push({ tone: "good", text: `Líquido por hora de ${brl(last.netPerHour)} na última rota, ${pct(last.netPerHour, base.netPerHour)}% acima da sua média.` });
      if (last.netPerHour != null && base.netPerHour != null && last.netPerHour < base.netPerHour * 0.85)
        out.push({ tone: "warn", text: `Líquido por hora de ${brl(last.netPerHour)} na última rota, ${-pct(last.netPerHour, base.netPerHour)}% abaixo da sua média de ${brl(base.netPerHour)}.` });
    }
    const all = summarize(sorted);
    if (all.margin != null && all.gross > 0 && all.margin < 0.75)
      out.push({ tone: "warn", text: `O custo operacional (combustível, desgaste, fixos e outros) leva ${Math.round((1 - all.margin) * 100)}% do que você recebe. Reduzir km por pacote é o que mais aumenta o líquido.` });
    if (last.failRate != null && last.failRate > 0.05) {
      const by = Object.entries(sorted[sorted.length - 1].failBy || {}).sort((a, b) => b[1] - a[1])[0];
      out.push({ tone: "warn", text: `${Math.round(last.failRate * 100)}% dos pacotes da última rota tiveram ocorrência${by ? `, a maior parte por "${by[0].toLowerCase()}"` : ""}. Cada pacote que volta é tempo e km sem receber.` });
    }
    if (last.laterRate != null && last.laterRate > 0.1)
      out.push({ tone: "warn", text: `${Math.round(last.laterRate * 100)}% dos endereços da última rota ficaram para "voltar depois". Ligar antes para quem avisa horário evita a segunda passada.` });
    const pl = Object.entries(all.plat);
    if (pl.length >= 2) {
      pl.sort((a, b) => b[1].perPkg - a[1].perPkg);
      out.push({ tone: "info", text: `Valor médio por pacote: ${pl.map(([k, v]) => `${k} ${brl(v.perPkg)}`).join(" · ")}.` });
    }
    if (sorted.length >= 3) {
      const best = sorted.map(r => ({ r, k: routeKpis(r) })).filter(x => x.k.netPerHour != null).sort((a, b) => b.k.netPerHour - a.k.netPerHour)[0];
      if (best) out.push({ tone: "info", text: `Sua melhor rota em líquido por hora foi a de ${new Date(best.r.t).toLocaleDateString("pt-BR")}: ${brl(best.k.netPerHour)} por hora, ${n1(best.k.pkgPerHour || 0)} pacotes por hora.` });
    }
    return out;
  }

  // Outros locais a até `maxM` metros, do mais perto ao mais longe.
  function nearby(stop, stops, maxM) {
    return stops.filter(s => s !== stop).map(s => ({ s, d: hav(stop, s) })).filter(x => x.d <= maxM).sort((a, b) => a.d - b.d);
  }

  const ll = p => p.lat.toFixed(6) + "," + p.lng.toFixed(6);
  const links = {
    waze: p => "https://waze.com/ul?ll=" + ll(p) + "&navigate=yes",
    gmaps: p => "https://www.google.com/maps/dir/?api=1&destination=" + ll(p) + "&travelmode=driving",
    apple: p => "https://maps.apple.com/?daddr=" + ll(p) + "&dirflg=d",
    gmapsLeg: stops => {
      const dest = stops[stops.length - 1];
      const wps = stops.slice(0, -1).map(ll).join("|");
      return "https://www.google.com/maps/dir/?api=1&destination=" + ll(dest) + (wps ? "&waypoints=" + encodeURIComponent(wps) : "") + "&travelmode=driving";
    },
  };

  return { hav, STREET_FACTOR, parseAddress, parseWindow, parseRows, groupStops, buildCost, solve, pathCost, legDist, distOf, VEHICLES, zoneFor, splitZones, estimateMinutes, finance, matchTN, nearby, buildAddresses, unifyStreets, streetSegments, addressRoute, seqMeters, loadPlan, etas, toMin, cepCheck, pinOutliers, interpolate, trackStep, routeKpis, summarize, groupByDay, trend, monthProjection, breakEven, insights, links };
})();
if (typeof module !== "undefined") module.exports = Core;
