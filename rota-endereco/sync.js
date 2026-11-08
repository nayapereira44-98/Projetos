// Rota Certa: rota em equipe (Firebase). Login com Google ou e-mail/senha, convite por e-mail e tudo ao vivo:
// entregas, anotações, "Pego esta", onde cada pacote está no carro de cada um e quem está online.
// O app continua funcionando sem internet e sem login: este módulo só liga a sincronização quando a rota é
// compartilhada. Conversa com o app pelo objeto window.RCApp (definido em app.js).
import { initializeApp } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js";
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import { initializeFirestore, persistentLocalCache, doc, collection, setDoc, updateDoc, getDoc, getDocs, onSnapshot, query, where, arrayUnion, writeBatch, deleteDoc, orderBy, limit as qlimit } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDZmOGNKUmrW1kSILCJTM9usYaLbQeNb98",
  authDomain: "rota-certa-e9fdd.firebaseapp.com",
  projectId: "rota-certa-e9fdd",
  storageBucket: "rota-certa-e9fdd.firebasestorage.app",
  messagingSenderId: "519072411335",
  appId: "1:519072411335:web:4840944539a29132d6d8e2",
};
const fb = initializeApp(firebaseConfig);
const auth = getAuth(fb);
let db;
try { db = initializeFirestore(fb, { localCache: persistentLocalCache() }); } catch { db = initializeFirestore(fb, {}); }

const A = () => window.RCApp;
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const clean = o => JSON.parse(JSON.stringify(o ?? null));
const kid = k => encodeURIComponent(k).replace(/\./g, "%2E"); // id de documento a partir da chave da parada
const unkid = k => decodeURIComponent(k);
const nameOf = u => (u?.displayName || (u?.email || "").split("@")[0] || "Eu").split(" ")[0];
const errMsg = e => {
  const c = String(e?.code || "");
  if (c.includes("invalid-credential") || c.includes("wrong-password") || c.includes("user-not-found")) return "E-mail ou senha incorretos.";
  if (c.includes("email-already-in-use")) return "Esse e-mail já tem conta. Use Entrar.";
  if (c.includes("weak-password")) return "A senha precisa de pelo menos 6 caracteres.";
  if (c.includes("invalid-email")) return "E-mail inválido.";
  if (c.includes("popup-closed")) return "Login cancelado.";
  if (c.includes("popup-blocked")) return "O navegador bloqueou a janela do Google. Tente de novo ou use e-mail e senha.";
  if (c.includes("unauthorized-domain")) return "Este site ainda não está autorizado no Firebase (Domínios autorizados).";
  if (c.includes("permission-denied")) return "Sem permissão. Confira as regras do Firestore.";
  if (c.includes("network")) return "Sem internet agora. Tente de novo.";
  return "Não deu certo: " + (e?.message || c);
};

let user = null, routeId = null, unsubs = [], pres = null;
const last = { route: "", st: {}, notes: {}, car: {} };
const remote = { claims: {}, car: {}, presence: {}, team: null };

// ---------- login ----------
// Login obrigatório: sem conta, só a tela de entrada aparece.
function lock(on) {
  document.body.classList.toggle("locked", on);
  if (on) renderGate(); else { $("gate").innerHTML = ""; }
}
onAuthStateChanged(auth, u => {
  user = u ? { uid: u.uid, email: (u.email || "").toLowerCase(), name: nameOf(u) } : null;
  try { if (user) localStorage.setItem("rc3:lastUser", JSON.stringify(user)); else localStorage.removeItem("rc3:lastUser"); } catch {}
  lock(!user);
  if (!A()) return;
  A().user = user;
  if (!user) { detach(); invUnsubs.forEach(f => { try { f(); } catch {} }); invUnsubs = []; inv.got = []; inv.sent = []; inv.team = []; }
  else { checkAttach(); registerMe(); listenInvites(); useLinkInvite(); }
  A().render();
});
const loginForm = () => `
    <button type="button" class="full" id="lgGoogle"><b>G</b>&nbsp; Entrar com Google</button>
    <div class="muted small" style="text-align:center">ou</div>
    <input type="text" id="lgEmail" placeholder="E-mail" autocomplete="email" inputmode="email" autocapitalize="off">
    <input type="text" id="lgPass" placeholder="Senha (mínimo 6)" autocomplete="current-password" style="-webkit-text-security:disc">
    <input type="text" id="lgName" placeholder="Seu nome (para criar conta)" autocomplete="given-name" hidden>
    <div class="row2"><button type="button" class="pri" id="lgIn">Entrar</button><button type="button" id="lgNew">Criar conta</button></div>
    <button type="button" class="ghost full sm" id="lgForgot">Esqueci a senha</button>
    <p class="small" id="lgMsg" style="color:var(--bad)"></p>`;
function renderGate() {
  $("gate").innerHTML = `<div class="gate-box"><div class="gate-logo">📦</div><h1>Rota Certa</h1><p class="muted">Rotas pelo endereço, carregamento do carro e entregas em equipe.</p>${loginForm()}</div>`;
  bindLogin();
}
function openLogin() {
  if (!user) return renderGate();
  A().openSheet(`<h2>Entrar</h2>${loginForm()}`, "login");
  bindLogin();
}
function bindLogin() {
  const msg = t => { if ($("lgMsg")) $("lgMsg").textContent = t; };
  const ok = t => { A()?.closeSheet(); A()?.toast(t); };
  $("lgGoogle").onclick = async () => { try { await signInWithPopup(auth, new GoogleAuthProvider()); ok("Conectada ✓"); } catch (e) { msg(errMsg(e)); } };
  $("lgIn").onclick = async () => { msg(""); try { await signInWithEmailAndPassword(auth, $("lgEmail").value.trim(), $("lgPass").value); ok("Conectada ✓"); } catch (e) { msg(errMsg(e)); } };
  $("lgPass").onkeydown = e => { if (e.key === "Enter") $("lgIn").click(); };
  $("lgNew").onclick = async () => {
    if ($("lgName").hidden) { $("lgName").hidden = false; $("lgName").focus(); return msg("Digite seu nome e toque de novo em Criar conta."); }
    // Lê tudo antes: quando a conta é criada, a tela de entrada some.
    const email = $("lgEmail").value.trim(), pass = $("lgPass").value, nm = $("lgName").value.trim();
    if (!nm) return msg("Digite seu nome.");
    try {
      const c = await createUserWithEmailAndPassword(auth, email, pass);
      await updateProfile(c.user, { displayName: nm });
      user = { uid: c.user.uid, email: (c.user.email || "").toLowerCase(), name: nm.split(" ")[0] };
      try { localStorage.setItem("rc3:lastUser", JSON.stringify(user)); } catch {}
      if (A()) { A().user = user; checkAttach(); A().render(); }
      registerMe(); listenInvites(); useLinkInvite();
      ok("Conta criada ✓");
    } catch (e) { if ($("lgMsg")) msg(errMsg(e)); else A()?.toast(errMsg(e)); }
  };
  $("lgForgot").onclick = async () => { const e = $("lgEmail").value.trim(); if (!e) return msg("Digite seu e-mail acima."); try { await sendPasswordResetEmail(auth, e); msg("Enviamos um e-mail para trocar a senha."); } catch (er) { msg(errMsg(er)); } };
}
const $ = id => document.getElementById(id);
async function logout() { detach(); A().closeSheet(); await signOut(auth); A().toast("Você saiu da conta"); A().render(); }

// ---------- compartilhar e convidar ----------
// "share" abre a equipe da rota; a rota só sobe para o Firestore quando alguém é chamado.
function share() { return openRouteTeam(); }
async function shareRoute() {
  const R = A().R, id = R.id;
  {
    await setDoc(doc(db, "routes", id), { owner: user.uid, members: [user.uid], invites: [], names: { [user.uid]: user.name }, emails: { [user.uid]: user.email }, name: R.name, created: R.created, pkgs: clean(R.pkgs), order: clean(R.order || []), updated: Date.now() });
    // Entregas e anotações que já existem.
    let b = writeBatch(db), n = 0;
    const flush = async () => { if (n) { await b.commit(); b = writeBatch(db); n = 0; } };
    for (const [tn, s] of Object.entries(R.st || {})) { b.set(doc(db, "routes", id, "st", kid(tn)), clean({ ...s, by: s.by || user.uid, byName: s.byName || user.name })); if (++n >= 400) await flush(); }
    for (const [k, v] of Object.entries(R.notes || {})) { b.set(doc(db, "routes", id, "notes", kid(k)), { v }); if (++n >= 400) await flush(); }
    await flush();
    R.shared = id; A().saveLocal(); attach(id);
  }
}
function openInvite() {
  const t = remote.team || {}, now = Date.now();
  const online = uid => remote.presence[uid] && now - remote.presence[uid].t < 150000;
  A().openSheet(`<h2>Equipe da rota</h2>
    <div class="list">${(t.members || []).map(uid => `<div class="pkg" style="grid-template-columns:auto 1fr auto"><span class="num sm ${online(uid) ? "ok" : "idle"}">${esc((t.names?.[uid] || "?")[0].toUpperCase())}</span><span><b>${esc(t.names?.[uid] || "Sem nome")}</b>${uid === user?.uid ? " (você)" : ""}<br><span class="muted small">${online(uid) ? "online agora" : "offline"}</span></span><span></span></div>`).join("")}
    ${(t.invites || []).filter(e => e && !Object.values(t.emails || {}).includes(e)).map(e => `<div class="muted small">✉️ ${esc(e)} · convidado(a), ainda não entrou</div>`).join("")}</div>
    <label class="f">Convidar pelo e-mail<input type="text" id="invEmail" placeholder="email@exemplo.com" inputmode="email" autocapitalize="off"></label>
    <button type="button" class="pri full" id="invGo">Convidar</button>
    <p class="muted small">A pessoa abre o app neste mesmo link, entra com esse e-mail e a rota aparece no Início dela.</p>`, "invite");
  $("invGo").onclick = async () => {
    const e = $("invEmail").value.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return A().toast("Digite um e-mail válido.");
    try { await updateDoc(doc(db, "routes", routeId), { invites: arrayUnion(e) }); A().toast("Convite enviado para " + e); openInvite(); }
    catch (er) { A().toast(errMsg(er)); }
  };
}
// Rotas em que você está ou foi convidada.
async function teamRoutes() {
  if (!user) return openLogin();
  A().openSheet(`<h2>Rotas da equipe</h2><p class="muted small">Procurando…</p>`, "team");
  try {
    const qs = [query(collection(db, "routes"), where("members", "array-contains", user.uid))];
    if (user.email) qs.push(query(collection(db, "routes"), where("invites", "array-contains", user.email)));
    const seen = new Map();
    for (const q of qs) (await getDocs(q)).forEach(d => seen.set(d.id, d.data()));
    const list = [...seen.entries()].sort((a, b) => (b[1].updated || 0) - (a[1].updated || 0)).slice(0, 15);
    A().openSheet(`<h2>Rotas da equipe</h2>${list.length ? `<div class="list">${list.map(([id, r]) => `<button type="button" class="stop" data-sync="join" data-id="${esc(id)}"><span class="num sm idle">${(r.pkgs || []).length}</span><span><span class="addr">${esc(r.name)}</span><br><span class="muted small">de ${esc(r.names?.[r.owner] || "?")} · ${new Date(r.created || r.updated).toLocaleDateString("pt-BR")}</span></span><span></span></button>`).join("")}</div>` : `<p class="muted">Nenhuma rota compartilhada com você ainda. Peça para a pessoa te convidar pelo e-mail <b>${esc(user.email)}</b>.</p>`}`, "team");
  } catch (e) { A().openSheet(`<h2>Rotas da equipe</h2><p class="muted">${esc(errMsg(e))}</p>`, "team"); }
}
async function join(btn) {
  const id = btn?.dataset?.id; if (!id || !user) return;
  try {
    const ref = doc(db, "routes", id);
    const snap = await getDoc(ref);
    if (!snap.exists()) return A().toast("Essa rota não existe mais.");
    const r = snap.data();
    if (!(r.members || []).includes(user.uid)) await updateDoc(ref, { members: arrayUnion(user.uid), [`names.${user.uid}`]: user.name, [`emails.${user.uid}`]: user.email });
    const cur = A().R;
    if (cur && cur.pkgs?.length && cur.shared !== id) A().archiveCurrent();
    A().setRoute({ id, name: r.name, created: r.created || Date.now(), file: "", pkgs: r.pkgs || [], order: r.order || [], st: {}, notes: {}, loaded: {}, zph: {}, shared: id });
    last.route = sig(A().R); last.st = {}; last.notes = {};
    attach(id);
    A().closeSheet(); A().toast("Você entrou na rota " + r.name); A().go("mapa");
  } catch (e) { A().toast(errMsg(e)); }
}

// ---------- ao vivo ----------
const sig = R => (R ? JSON.stringify([R.name, R.order, (R.pkgs || []).map(p => p.tn)]) : "");
function detach() { unsubs.forEach(f => { try { f(); } catch {} }); unsubs = []; routeId = null; clearInterval(pres); remote.claims = {}; remote.car = {}; remote.presence = {}; remote.team = null; }
function checkAttach() { const R = A()?.R; if (user && R?.shared && R.shared !== routeId) attach(R.shared); }
function attach(id) {
  detach(); routeId = id;
  const R0 = A().R;
  last.route = sig(R0); last.st = clean(R0?.st || {}); last.notes = clean(R0?.notes || {});
  const base = doc(db, "routes", id);
  unsubs.push(onSnapshot(base, s => {
    if (!s.exists()) return;
    const d = s.data(), R = A().R; if (!R || R.shared !== id) return;
    remote.team = { owner: d.owner, members: d.members || [], invites: d.invites || [], names: d.names || {}, emails: d.emails || {} };
    const rs = sig({ name: d.name, order: d.order, pkgs: d.pkgs });
    if (rs !== sig(R)) { R.name = d.name; R.pkgs = d.pkgs || []; R.order = d.order || []; R.geom = null; }
    last.route = rs; A().saveLocal(); A().render();
  }, e => A().toast(errMsg(e))));
  unsubs.push(onSnapshot(collection(base, "st"), s => {
    const R = A().R; if (!R) return;
    s.docChanges().forEach(ch => {
      const tn = unkid(ch.doc.id);
      if (ch.type === "removed") { delete R.st[tn]; delete last.st[tn]; }
      else { const v = ch.doc.data(); R.st[tn] = v; last.st[tn] = clean(v); }
    });
    A().saveLocal(); A().render();
  }));
  unsubs.push(onSnapshot(collection(base, "notes"), s => {
    const R = A().R; if (!R) return;
    s.docChanges().forEach(ch => {
      const k = unkid(ch.doc.id);
      if (ch.type === "removed") { delete R.notes[k]; delete last.notes[k]; }
      else { R.notes[k] = ch.doc.data().v; last.notes[k] = R.notes[k]; }
    });
    A().saveLocal(); A().render();
  }));
  unsubs.push(onSnapshot(collection(base, "claims"), s => {
    remote.claims = {}; s.forEach(d => (remote.claims[unkid(d.id)] = d.data())); A().render();
  }));
  unsubs.push(onSnapshot(collection(base, "car"), s => {
    remote.car = {}; s.forEach(d => (remote.car[unkid(d.id)] = d.data())); A().render();
  }));
  unsubs.push(onSnapshot(collection(base, "presence"), s => {
    remote.presence = {}; s.forEach(d => (remote.presence[d.id] = d.data())); A().renderTop?.();
  }));
  const beat = () => { if (user && routeId && !document.hidden) setDoc(doc(db, "routes", routeId, "presence", user.uid), { name: user.name, t: Date.now() }).catch(() => {}); };
  beat(); pres = setInterval(beat, 60000);
  pushCar();
}
document.addEventListener("visibilitychange", () => { if (!document.hidden && routeId && user) setDoc(doc(db, "routes", routeId, "presence", user.uid), { name: user.name, t: Date.now() }).catch(() => {}); });

// Mudanças locais → Firestore (só o que mudou).
async function push() {
  const R = A()?.R;
  if (!user || !routeId || !R || R.shared !== routeId) return;
  try {
    const rs = sig(R);
    if (rs !== last.route) { last.route = rs; await updateDoc(doc(db, "routes", routeId), { name: R.name, pkgs: clean(R.pkgs), order: clean(R.order || []), updated: Date.now() }); }
    const b = writeBatch(db); let n = 0;
    const st = R.st || {};
    for (const tn of Object.keys(st)) {
      if (JSON.stringify(st[tn]) === JSON.stringify(last.st[tn])) continue;
      if (!st[tn].by) { st[tn].by = user.uid; st[tn].byName = user.name; }
      b.set(doc(db, "routes", routeId, "st", kid(tn)), clean(st[tn])); last.st[tn] = clean(st[tn]); n++;
    }
    for (const tn of Object.keys(last.st)) if (!st[tn]) { b.delete(doc(db, "routes", routeId, "st", kid(tn))); delete last.st[tn]; n++; }
    const nt = R.notes || {};
    for (const k of Object.keys(nt)) if (nt[k] !== last.notes[k]) { b.set(doc(db, "routes", routeId, "notes", kid(k)), { v: nt[k] }); last.notes[k] = nt[k]; n++; }
    for (const k of Object.keys(last.notes)) if (nt[k] == null) { b.delete(doc(db, "routes", routeId, "notes", kid(k))); delete last.notes[k]; n++; }
    if (n) await b.commit();
  } catch (e) { A().toast(errMsg(e)); }
}
// Onde cada pacote da rota está no SEU carro (cada pessoa tem o seu).
async function pushCar() {
  const app = A(), R = app?.R;
  if (!user || !routeId || !R) return;
  try {
    const b = writeBatch(db); let n = 0;
    const tns = new Set(R.pkgs.map(p => app.normTn(p.tn)));
    for (const [code, v] of Object.entries(app.CAR.pk || {})) {
      if (!tns.has(code) && ![...tns].some(t => code.includes(t))) continue;
      const val = { z: app.zName(v.z), v: !!v.v, uid: user.uid, name: user.name };
      const key = code + "|" + user.uid;
      if (JSON.stringify(val) === JSON.stringify(last.car[key])) continue;
      b.set(doc(db, "routes", routeId, "car", kid(code)), val); last.car[key] = val; n++;
      if (n >= 400) break;
    }
    if (n) await b.commit();
  } catch {}
}
async function claim(btn) {
  const k = btn?.dataset?.key; if (!k || !routeId || !user) return;
  const ref = doc(db, "routes", routeId, "claims", kid(k));
  try {
    if (remote.claims[k]?.uid === user.uid) await deleteDoc(ref);
    else await setDoc(ref, { uid: user.uid, name: user.name, t: Date.now() });
  } catch (e) { A().toast(errMsg(e)); }
}


// ---------- equipe e convites ----------
// Equipe: pessoas que aceitaram um convite seu (ou que você aceitou). Fica para sempre, até alguém remover.
// Convites ficam em invites/{id}: { type: "team" | "route", from, fromName, fromEmail, toEmail, toUid, toName,
// routeId, routeName, status: "pending" | "accepted" | "declined" | "removed", created }.
// Quem já tem conta recebe a notificação no app. Quem não tem recebe o link pelo WhatsApp: ao criar a conta pelo
// link (?convite=ID), já entra na equipe.
const APP_URL = location.origin + location.pathname.replace(/index\.html$/, "");
const inv = { got: [], sent: [], team: [] };
let invUnsubs = [];
function registerMe() {
  if (!user?.email) return;
  setDoc(doc(db, "emails", user.email), { uid: user.uid, name: user.name }).catch(() => {});
}
function listenInvites() {
  invUnsubs.forEach(f => { try { f(); } catch {} }); invUnsubs = [];
  if (!user) return;
  const col = collection(db, "invites");
  const maps = { a: new Map(), b: new Map(), c: new Map() };
  const rebuild = () => {
    const recv = new Map([...maps.a, ...maps.b]), sent = maps.c;
    const before = new Set(inv.got.map(x => x.id));
    inv.got = [...recv.values()].filter(x => x.status === "pending" && x.from !== user.uid);
    inv.sent = [...sent.values()].filter(x => x.status === "pending");
    // Equipe: convites de equipe aceitos, nos dois sentidos.
    const team = new Map();
    [...recv.values()].filter(x => x.type === "team" && x.status === "accepted").forEach(x => team.set(x.from, { uid: x.from, name: x.fromName, email: x.fromEmail, inv: x.id }));
    [...sent.values()].filter(x => x.type === "team" && x.status === "accepted" && x.toUid).forEach(x => team.set(x.toUid, { uid: x.toUid, name: x.toName || x.toEmail, email: x.toEmail, inv: x.id }));
    team.delete(user.uid);
    inv.team = [...team.values()].sort((a, b) => String(a.name).localeCompare(String(b.name)));
    const fresh = inv.got.filter(x => !before.has(x.id));
    if (fresh.length && A()) A().toast(fresh[0].type === "route" ? `${fresh[0].fromName} te chamou para uma rota 🔔` : `${fresh[0].fromName} quer te adicionar 🔔`);
    A()?.render();
    if (sheetIs("team") || sheetIs("notif") || sheetIs("rteam")) reopen();
    try { drawChat(); } catch {}
  };
  const sub = (q, m) => invUnsubs.push(onSnapshot(q, s => { m.clear(); s.forEach(d => m.set(d.id, { id: d.id, ...d.data() })); rebuild(); }, () => {}));
  if (user.email) sub(query(col, where("toEmail", "==", user.email)), maps.a);
  sub(query(col, where("toUid", "==", user.uid)), maps.b);
  sub(query(col, where("from", "==", user.uid)), maps.c);
}
let openKind = null;
const sheetIs = k => openKind === k && !document.getElementById("sheetBg").hidden;
const reopen = () => ({ team: openTeam, notif: openNotif, rteam: openRouteTeam })[openKind]?.();
const show = (html, kind) => { openKind = kind; A().openSheet(html, kind); };

// Tela da equipe.
function openTeam() {
  if (!user) return openLogin();
  show(`<div class="sheet-h"><span class="num">${inv.team.length}</span><div><div class="addr">Amigos e equipe</div><div class="muted small">Quem você adicionou e aceitou</div></div><button type="button" class="x" data-close="1">✕</button></div>
    ${inv.got.length ? `<button type="button" class="pri full" data-sync="openNotif">🔔 ${inv.got.length} convite${inv.got.length > 1 ? "s" : ""} para você</button>` : ""}
    <div class="list">${inv.team.map(m => `<div class="pkg" style="grid-template-columns:auto 1fr auto"><span class="num sm">${esc((m.name || "?")[0].toUpperCase())}</span><span><b>${esc(m.name || "")}</b><br><span class="muted small">${esc(m.email || "")}</span></span><button type="button" class="ghost sm danger" data-sync="removeMember" data-id="${esc(m.inv)}">Remover</button></div>`).join("") || `<p class="muted">Ninguém ainda. Convide abaixo ou adicione pessoas pela Comunidade.</p>`}</div>
    <h3>Convidar alguém</h3>
    <label class="f">E-mail da pessoa (se ela já usa o app)<input type="text" id="tmEmail" placeholder="email@exemplo.com" inputmode="email" autocapitalize="off"></label>
    <button type="button" class="pri full" data-sync="inviteEmail">Convidar pelo e-mail</button>
    <button type="button" class="full" data-sync="inviteWhats" style="background:#25d366;border-color:#25d366;color:#fff">Convidar pelo WhatsApp</button>
    <p class="muted small">Pelo WhatsApp vai uma mensagem pronta com o link. Quando a pessoa criar a conta por ele, já entra na sua equipe.</p>
    ${inv.sent.length ? `<h3>Esperando resposta</h3><div class="list">${inv.sent.map(x => `<div class="small">${x.type === "route" ? "🚚 Rota " + esc(x.routeName || "") + " · " : "👥 Equipe · "}${esc(x.toName || x.toEmail || "convite pelo WhatsApp")} · <button type="button" class="ghost sm" data-sync="cancelInvite" data-id="${esc(x.id)}" style="min-height:0;padding:0 4px">cancelar</button></div>`).join("")}</div>` : ""}`, "team");
}
async function inviteEmail() {
  const e = (document.getElementById("tmEmail")?.value || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return A().toast("Digite um e-mail válido.");
  if (e === user.email) return A().toast("Esse é o seu e-mail 🙂");
  if (inv.team.some(m => m.email === e)) return A().toast("Essa pessoa já está na sua equipe.");
  try {
    const reg = await getDoc(doc(db, "emails", e));
    const ref = doc(collection(db, "invites"));
    await setDoc(ref, { type: "team", from: user.uid, fromName: user.name, fromEmail: user.email, toEmail: e, toUid: reg.exists() ? reg.data().uid : null, toName: reg.exists() ? reg.data().name : null, status: "pending", created: Date.now() });
    if (reg.exists()) A().toast(`Convite enviado. ${reg.data().name} vai receber a notificação.`);
    else return whatsInvite(ref.id, `${e} ainda não usa o app. Mande o convite pelo WhatsApp:`);
    openTeam();
  } catch (er) { A().toast(errMsg(er)); }
}
async function inviteWhats() {
  try {
    const ref = doc(collection(db, "invites"));
    await setDoc(ref, { type: "team", from: user.uid, fromName: user.name, fromEmail: user.email, toEmail: null, toUid: null, toName: null, status: "pending", created: Date.now() });
    whatsInvite(ref.id);
  } catch (er) { A().toast(errMsg(er)); }
}
function whatsInvite(id, note) {
  const link = APP_URL + "?convite=" + id;
  const text = `Oi! Tenha a Rota Certa junto comigo 🚚📦\nÉ o app que eu uso para organizar as entregas: rota pelo endereço, carregamento do carro e entregas ao vivo.\nEntre por este link e crie sua conta, que você já entra na minha equipe:\n${link}`;
  show(`<h2>Convite pelo WhatsApp</h2>${note ? `<p class="muted small">${esc(note)}</p>` : ""}
    <div class="card flat" style="padding:12px;white-space:pre-wrap;font-size:.92rem">${esc(text)}</div>
    <a class="btn full" href="https://wa.me/?text=${encodeURIComponent(text)}" target="_blank" rel="noopener" style="background:#25d366;border-color:#25d366;color:#fff">Abrir o WhatsApp</a>
    <button type="button" class="full" data-sync="copyText" data-text="${esc(text)}">Copiar a mensagem</button>
    <button type="button" class="ghost full" data-sync="openTeam">Voltar para a equipe</button>`, "whats");
}
async function copyText(btn) { try { await navigator.clipboard.writeText(btn.dataset.text); A().toast("Mensagem copiada"); } catch { A().toast("Não consegui copiar: segure o texto para copiar."); } }
async function cancelInvite(btn) { try { await deleteDoc(doc(db, "invites", btn.dataset.id)); A().toast("Convite cancelado"); } catch (er) { A().toast(errMsg(er)); } }
async function removeMember(btn) {
  if (!btn.dataset.armed) { btn.dataset.armed = "1"; btn.textContent = "Confirmar"; return; }
  try { await updateDoc(doc(db, "invites", btn.dataset.id), { status: "removed" }); A().toast("Removido da equipe"); } catch (er) { A().toast(errMsg(er)); }
}

// Notificações: convites para a equipe e para rotas.
function openNotif() {
  show(`<h2>Convites</h2>${inv.got.length ? `<div class="list">${inv.got.map(x => `<div class="card flat" style="padding:12px;gap:8px">
      <b>${x.type === "route" ? `🚚 ${esc(x.fromName)} te chamou para a rota ${esc(x.routeName || "")}` : `👥 ${esc(x.fromName)} quer te adicionar como amigo/equipe`}</b>
      <span class="muted small">${x.type === "route" ? "Se aceitar, vocês veem e atualizam a mesma rota." : "Na equipe, vocês podem se chamar para rotas quando quiserem."}</span>
      <div class="row2"><button type="button" class="pri" data-sync="acceptInvite" data-id="${esc(x.id)}">${x.type === "route" ? "Entrar na rota" : "Aceitar"}</button><button type="button" data-sync="declineInvite" data-id="${esc(x.id)}">${x.type === "route" ? "Agora não" : "Recusar"}</button></div></div>`).join("")}</div>` : `<p class="muted">Nenhum convite agora.</p>`}`, "notif");
}
async function acceptInvite(btn, idArg) {
  const id = idArg || btn?.dataset?.id; if (!id) return;
  try {
    const ref = doc(db, "invites", id), snap = await getDoc(ref);
    if (!snap.exists()) return A().toast("Esse convite não existe mais.");
    const x = snap.data();
    if (x.from === user.uid) return A().toast("Esse convite é seu 🙂");
    if (x.status !== "pending") return A().toast(x.status === "accepted" ? "Convite já aceito." : "Esse convite foi cancelado.");
    await updateDoc(ref, { status: "accepted", toUid: user.uid, toName: user.name, toEmail: user.email, answered: Date.now() });
    if (x.type === "route") { await join({ dataset: { id: x.routeId } }); }
    else { A().closeSheet(); A().toast(`Você entrou na equipe de ${x.fromName} ✓`); }
  } catch (er) { A().toast(errMsg(er)); }
}
async function declineInvite(btn) {
  try { await updateDoc(doc(db, "invites", btn.dataset.id), { status: "declined", toUid: user.uid, answered: Date.now() }); A().toast("Convite recusado"); } catch (er) { A().toast(errMsg(er)); }
}
// Chegou pelo link do WhatsApp (?convite=ID): depois de entrar, aceita sozinho e já entra na equipe.
function takeLinkInvite() {
  try {
    const id = new URLSearchParams(location.search).get("convite");
    if (id) { localStorage.setItem("rc3:convite", id); history.replaceState(null, "", location.pathname + location.hash); }
  } catch {}
}
takeLinkInvite();
async function useLinkInvite() {
  let id = null; try { id = localStorage.getItem("rc3:convite"); } catch {}
  if (!id || !user) return;
  try { localStorage.removeItem("rc3:convite"); } catch {}
  await acceptInvite(null, id);
}

// Chamar alguém da equipe para a rota aberta (a pessoa aceita ou não).
async function openRouteTeam() {
  const R = A().R;
  if (!user) return openLogin();
  if (!R) return A().toast("Abra uma rota primeiro.");
  const t = remote.team || {}, now = Date.now();
  const online = uid => remote.presence[uid] && now - remote.presence[uid].t < 150000;
  const inRoute = uid => (t.members || []).includes(uid);
  const called = uid => inv.sent.some(x => x.type === "route" && x.routeId === R.shared && x.toUid === uid);
  show(`<div class="sheet-h"><span class="num">${(t.members || [user.uid]).length}</span><div><div class="addr">Equipe desta rota</div><div class="muted small">${esc(R.name)}</div></div><button type="button" class="x" data-close="1">✕</button></div>
    ${R.shared ? `<div class="list">${(t.members || []).map(uid => `<div class="small">${online(uid) ? "🟢" : "⚪"} <b>${esc(t.names?.[uid] || "?")}</b>${uid === user.uid ? " (você)" : ""} · ${online(uid) ? "online" : "offline"}</div>`).join("")}</div>` : `<p class="muted small">Esta rota ainda é só sua. Chame alguém da equipe para fazer junto.</p>`}
    <h3>Chamar da minha equipe</h3>
    <div class="list">${inv.team.map(m => `<div class="pkg" style="grid-template-columns:auto 1fr auto"><span class="num sm idle">${esc((m.name || "?")[0].toUpperCase())}</span><span><b>${esc(m.name || "")}</b><br><span class="muted small">${inRoute(m.uid) ? "já está na rota" : called(m.uid) ? "chamado, esperando aceitar" : esc(m.email || "")}</span></span>${inRoute(m.uid) || called(m.uid) ? "" : `<button type="button" class="pri sm" data-sync="callToRoute" data-uid="${esc(m.uid)}">Chamar</button>`}</div>`).join("") || `<p class="muted small">Sua equipe está vazia.</p>`}</div>
    <button type="button" class="full" data-sync="openTeam">Convidar alguém para a equipe</button>`, "rteam");
}
async function callToRoute(btn) {
  const m = inv.team.find(x => x.uid === btn.dataset.uid); if (!m) return;
  try {
    const R = A().R;
    if (!R.shared) await shareRoute();
    const rid = A().R.shared;
    await updateDoc(doc(db, "routes", rid), { invites: arrayUnion(m.email) });
    await setDoc(doc(collection(db, "invites")), { type: "route", from: user.uid, fromName: user.name, fromEmail: user.email, toEmail: m.email, toUid: m.uid, toName: m.name, routeId: rid, routeName: R.name, status: "pending", created: Date.now() });
    A().toast(`${m.name} foi chamado(a). Quando aceitar, entra na rota.`);
  } catch (er) { A().toast(errMsg(er)); }
}

// ---------- Comunidade ----------
// Perfil público com apelido (profiles/{uid}) e um chat geral (chat/{id}). No chat todo mundo aparece pelo apelido;
// o nome verdadeiro só aparece para quem é seu amigo (alguém que você adicionou e aceitou, ou que te adicionou e
// você aceitou: os mesmos convites da equipe). Do chat dá para tocar no apelido e mandar pedido de amizade.
const comm = { msgs: [], profiles: new Map(), unsub: null, el: null, online: 0, me: null, lastSend: 0 };
const defAlias = uid => "Entregador " + uid.slice(0, 4).toUpperCase();
const friendOf = uid => inv.team.find(m => m.uid === uid) || null;
async function loadMyProfile() {
  if (!user) return null;
  try {
    const s = await getDoc(doc(db, "profiles", user.uid));
    comm.me = s.exists() ? s.data() : { alias: defAlias(user.uid), city: "", vehicle: "", bio: "" };
    if (!s.exists()) await setDoc(doc(db, "profiles", user.uid), { ...comm.me, lastSeen: Date.now(), created: Date.now() });
  } catch { comm.me = comm.me || { alias: defAlias(user.uid) }; }
  return comm.me;
}
setInterval(() => { if (user && !document.hidden) updateDoc(doc(db, "profiles", user.uid), { lastSeen: Date.now() }).catch(() => {}); }, 60000);
async function profileOf(uid) {
  if (comm.profiles.has(uid)) return comm.profiles.get(uid);
  try { const s = await getDoc(doc(db, "profiles", uid)); const p = s.exists() ? s.data() : { alias: defAlias(uid) }; comm.profiles.set(uid, p); return p; } catch { return { alias: defAlias(uid) }; }
}
async function community(el) {
  if (!user) return openLogin();
  comm.el = el;
  if (!comm.me) await loadMyProfile();
  el.innerHTML = `<div class="comm-top"><div><h2>Comunidade</h2><span class="muted small" id="cmOnline">entregadores do Rota Certa</span></div>
      <div class="top-r"><button type="button" class="sm" data-sync="openFriends">Amigos ${inv.team.length ? `(${inv.team.length})` : ""}</button><button type="button" class="sm" data-sync="openProfile">Meu perfil</button></div></div>
    <p class="muted small comm-hint">Aqui você aparece como <b>${esc(comm.me?.alias || defAlias(user.uid))}</b>. Seu nome só aparece para quem é seu amigo.</p>
    <div class="chat" id="cmList"><p class="muted small" style="text-align:center">Carregando…</p></div>
    <form class="chat-in" id="cmForm"><input type="text" id="cmText" maxlength="500" placeholder="Escreva para a comunidade…" autocomplete="off"><button type="submit" class="pri sm">Enviar</button></form>`;
  $("cmForm").onsubmit = e => { e.preventDefault(); sendMsg(); };
  if (!comm.unsub) {
    comm.unsub = onSnapshot(query(collection(db, "chat"), orderBy("t", "desc"), qlimit(80)), s => {
      comm.msgs = s.docs.map(d => ({ id: d.id, ...d.data() })).reverse();
      drawChat();
    }, e => { if ($("cmList")) $("cmList").innerHTML = `<p class="muted small">${esc(errMsg(e))}</p>`; });
  } else drawChat();
  countOnline();
}
async function countOnline() {
  try {
    const s = await getDocs(query(collection(db, "profiles"), where("lastSeen", ">", Date.now() - 150000)));
    comm.online = s.size;
    if ($("cmOnline")) $("cmOnline").textContent = `${s.size} online agora`;
  } catch {}
}
setInterval(() => { if (comm.el && !document.hidden && $("cmOnline")) countOnline(); }, 60000);
function drawChat() {
  const box = $("cmList"); if (!box) return;
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
  box.innerHTML = comm.msgs.length ? comm.msgs.map(m => {
    const mine = m.uid === user?.uid, fr = friendOf(m.uid);
    const who = mine ? "Você" : fr ? `${fr.name} · ${m.alias}` : m.alias;
    return `<div class="msg${mine ? " me" : ""}"><button type="button" class="msg-who" data-sync="openPerson" data-uid="${esc(m.uid)}">${esc(who)}${fr && !mine ? " 🤝" : ""}</button>
      <div class="msg-t">${esc(m.text)}</div><span class="msg-h">${new Date(m.t).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}${mine ? ` · <button type="button" class="linkbtn" data-sync="delMsg" data-id="${esc(m.id)}">apagar</button>` : ""}</span></div>`;
  }).join("") : `<p class="muted small" style="text-align:center">Ninguém escreveu ainda. Puxe o assunto! 👋</p>`;
  if (nearBottom || !box.dataset.once) { box.scrollTop = box.scrollHeight; box.dataset.once = "1"; }
}
async function sendMsg() {
  const i = $("cmText"), text = (i?.value || "").trim();
  if (!text) return;
  if (Date.now() - comm.lastSend < 3000) return A().toast("Espere um pouquinho entre as mensagens.");
  comm.lastSend = Date.now(); i.value = "";
  try { await setDoc(doc(collection(db, "chat")), { uid: user.uid, alias: comm.me?.alias || defAlias(user.uid), text, t: Date.now() }); }
  catch (e) { A().toast(errMsg(e)); i.value = text; }
}
async function delMsg(btn) { try { await deleteDoc(doc(db, "chat", btn.dataset.id)); } catch (e) { A().toast(errMsg(e)); } }
function openProfile() {
  const p = comm.me || {};
  show(`<h2>Meu perfil</h2><p class="muted small">É o que a comunidade vê. Seu nome e e-mail só aparecem para amigos.</p>
    <label class="f">Apelido<input type="text" id="pfAlias" maxlength="30" value="${esc(p.alias || "")}"></label>
    <label class="f">Cidade<input type="text" id="pfCity" maxlength="40" value="${esc(p.city || "")}" placeholder="ex.: Campinas"></label>
    <label class="f">Veículo<input type="text" id="pfVeh" maxlength="40" value="${esc(p.vehicle || "")}" placeholder="ex.: VW Tera"></label>
    <label class="f">Sobre você<textarea id="pfBio" maxlength="200" placeholder="ex.: entrego Shopee e Mercado Livre na região do Cambuí">${esc(p.bio || "")}</textarea></label>
    <button type="button" class="pri full" data-sync="saveProfile">Salvar</button>`, "profile");
}
async function saveProfile() {
  const v = id => ($(id)?.value || "").trim();
  const p = { alias: v("pfAlias") || defAlias(user.uid), city: v("pfCity"), vehicle: v("pfVeh"), bio: v("pfBio"), lastSeen: Date.now() };
  try { await setDoc(doc(db, "profiles", user.uid), p, { merge: true }); comm.me = { ...comm.me, ...p }; A().closeSheet(); A().toast("Perfil salvo"); if (comm.el) community(comm.el); }
  catch (e) { A().toast(errMsg(e)); }
}
async function openPerson(btn) {
  const uid = btn.dataset.uid; if (!uid) return;
  if (uid === user.uid) return openProfile();
  const p = await profileOf(uid), fr = friendOf(uid);
  const asked = inv.sent.some(x => x.toUid === uid && x.type === "team");
  const askedMe = inv.got.find(x => x.from === uid && x.type === "team");
  show(`<div class="sheet-h"><span class="num">${esc((fr?.name || p.alias || "?")[0].toUpperCase())}</span><div><div class="addr">${esc(fr ? fr.name : p.alias)}</div><div class="muted small">${esc(fr ? p.alias + " · " + (fr.email || "") : "apelido na comunidade")}</div></div><button type="button" class="x" data-close="1">✕</button></div>
    ${[p.city && "📍 " + p.city, p.vehicle && "🚗 " + p.vehicle].filter(Boolean).map(x => `<span class="chip">${esc(x)}</span>`).join(" ")}
    ${p.bio ? `<p>${esc(p.bio)}</p>` : ""}
    ${fr ? `<p class="muted small">🤝 Vocês são amigos.</p>` : askedMe ? `<button type="button" class="pri full" data-sync="acceptInvite" data-id="${esc(askedMe.id)}">Aceitar pedido de amizade</button>` : asked ? `<p class="muted small">Pedido de amizade enviado. Esperando aceitar.</p>` : `<button type="button" class="pri full" data-sync="addFriend" data-uid="${esc(uid)}">Adicionar como amigo</button><p class="muted small">Quando a pessoa aceitar, vocês veem o nome um do outro e podem se chamar para rotas.</p>`}`, "person");
}
async function addFriend(btn) {
  const uid = btn.dataset.uid, p = await profileOf(uid);
  try {
    await setDoc(doc(collection(db, "invites")), { type: "team", from: user.uid, fromName: user.name, fromEmail: user.email, toEmail: null, toUid: uid, toName: p.alias || null, status: "pending", created: Date.now() });
    A().toast("Pedido de amizade enviado"); A().closeSheet();
  } catch (e) { A().toast(errMsg(e)); }
}
function openFriends() { openTeam(); }

window.RCSync = { openLogin, logout, share, invite: openRouteTeam, teamRoutes, join, claim, push, pushCar, remote,
  openTeam, openNotif, inviteEmail, inviteWhats, copyText, cancelInvite, removeMember, acceptInvite, declineInvite, callToRoute, openRouteTeam,
  community, openProfile, saveProfile, openPerson, addFriend, openFriends, delMsg,
  get notifCount() { return inv.got.length; }, get teamCount() { return inv.team.length; }, get user() { return user; }, get routeId() { return routeId; } };
const boot = () => { if (!A()) return setTimeout(boot, 50); A().remote = remote; A().user = user; A().onSave = push; A().onSaveCar = pushCar; checkAttach(); A().render(); };
boot();
