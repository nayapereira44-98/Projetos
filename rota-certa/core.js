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
    const after = s.match(/\b(?:apos|depois\s+d[ae]s?)\s*(?:as\s*)?(\d{1,2})\s*(?:[:h]\s*(\d{2})?)/);
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
  function zoneFor(block, vehicle) {
    const zones = (VEHICLES[vehicle] || VEHICLES.carro).zones;
    return { zone: zones[block % zones.length], zoneIdx: block % zones.length, layer: Math.floor(block / zones.length) };
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
    const gain = f.payMode === "pacote" ? (f.payValue || 0) * f.delivered : f.payMode === "parada" ? (f.payValue || 0) * f.stopsDone : (f.payValue || 0);
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

  return { hav, STREET_FACTOR, parseAddress, parseWindow, parseRows, groupStops, buildCost, solve, pathCost, legDist, distOf, VEHICLES, zoneFor, estimateMinutes, finance, matchTN, links };
})();
if (typeof module !== "undefined") module.exports = Core;
