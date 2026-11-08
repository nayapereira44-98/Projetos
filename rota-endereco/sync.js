// Rota Certa: rota em equipe (Firebase). Login com Google ou e-mail/senha, convite por e-mail e tudo ao vivo:
// entregas, anotações, "Pego esta", onde cada pacote está no carro de cada um e quem está online.
// O app continua funcionando sem internet e sem login: este módulo só liga a sincronização quando a rota é
// compartilhada. Conversa com o app pelo objeto window.RCApp (definido em app.js).
import { initializeApp } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js";
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import { initializeFirestore, persistentLocalCache, doc, collection, setDoc, updateDoc, getDoc, getDocs, onSnapshot, query, where, arrayUnion, writeBatch, deleteDoc } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";

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
onAuthStateChanged(auth, u => {
  user = u ? { uid: u.uid, email: (u.email || "").toLowerCase(), name: nameOf(u) } : null;
  if (!A()) return;
  A().user = user;
  if (!user) detach();
  else checkAttach();
  A().render();
});
function openLogin() {
  A().openSheet(`<h2>Entrar</h2><p class="muted small">Com login você convida outra pessoa para a sua rota e tudo atualiza ao vivo para os dois.</p>
    <button type="button" class="full" id="lgGoogle"><b>G</b>&nbsp; Entrar com Google</button>
    <div class="muted small" style="text-align:center">ou</div>
    <input type="text" id="lgEmail" placeholder="E-mail" autocomplete="email" inputmode="email" autocapitalize="off">
    <input type="text" id="lgPass" placeholder="Senha (mínimo 6)" autocomplete="current-password" style="-webkit-text-security:disc">
    <input type="text" id="lgName" placeholder="Seu nome (só para criar conta)" autocomplete="given-name" hidden>
    <div class="row2"><button type="button" class="pri" id="lgIn">Entrar</button><button type="button" id="lgNew">Criar conta</button></div>
    <button type="button" class="ghost full sm" id="lgForgot">Esqueci a senha</button>
    <p class="small" id="lgMsg" style="color:var(--bad)"></p>`, "login");
  const msg = t => ($("lgMsg").textContent = t);
  $("lgGoogle").onclick = async () => { try { await signInWithPopup(auth, new GoogleAuthProvider()); A().closeSheet(); A().toast("Conectada ✓"); } catch (e) { msg(errMsg(e)); } };
  $("lgIn").onclick = async () => { try { await signInWithEmailAndPassword(auth, $("lgEmail").value.trim(), $("lgPass").value); A().closeSheet(); A().toast("Conectada ✓"); } catch (e) { msg(errMsg(e)); } };
  $("lgNew").onclick = async () => {
    if ($("lgName").hidden) { $("lgName").hidden = false; $("lgName").focus(); return msg("Digite seu nome e toque de novo em Criar conta."); }
    try {
      const c = await createUserWithEmailAndPassword(auth, $("lgEmail").value.trim(), $("lgPass").value);
      const nm = $("lgName").value.trim(); if (nm) await updateProfile(c.user, { displayName: nm });
      user = { uid: c.user.uid, email: (c.user.email || "").toLowerCase(), name: nm || nameOf(c.user) }; A().user = user;
      A().closeSheet(); A().toast("Conta criada ✓"); checkAttach(); A().render();
    } catch (e) { msg(errMsg(e)); }
  };
  $("lgForgot").onclick = async () => { const e = $("lgEmail").value.trim(); if (!e) return msg("Digite seu e-mail acima."); try { await sendPasswordResetEmail(auth, e); msg("Enviamos um e-mail para trocar a senha."); } catch (er) { msg(errMsg(er)); } };
}
const $ = id => document.getElementById(id);
async function logout() { detach(); A().closeSheet(); await signOut(auth); A().toast("Você saiu da conta"); A().render(); }

// ---------- compartilhar e convidar ----------
async function share() {
  const R = A().R;
  if (!user) return openLogin();
  if (!R) return A().toast("Abra uma rota primeiro.");
  if (R.shared) return openInvite();
  const id = R.id;
  try {
    await setDoc(doc(db, "routes", id), { owner: user.uid, members: [user.uid], invites: [], names: { [user.uid]: user.name }, emails: { [user.uid]: user.email }, name: R.name, created: R.created, pkgs: clean(R.pkgs), order: clean(R.order || []), updated: Date.now() });
    // Entregas e anotações que já existem.
    let b = writeBatch(db), n = 0;
    const flush = async () => { if (n) { await b.commit(); b = writeBatch(db); n = 0; } };
    for (const [tn, s] of Object.entries(R.st || {})) { b.set(doc(db, "routes", id, "st", kid(tn)), clean({ ...s, by: s.by || user.uid, byName: s.byName || user.name })); if (++n >= 400) await flush(); }
    for (const [k, v] of Object.entries(R.notes || {})) { b.set(doc(db, "routes", id, "notes", kid(k)), { v }); if (++n >= 400) await flush(); }
    await flush();
    R.shared = id; A().saveLocal(); attach(id);
    openInvite();
  } catch (e) { A().toast(errMsg(e)); }
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

window.RCSync = { openLogin, logout, share, invite: openInvite, teamRoutes, join, claim, push, pushCar, remote, get user() { return user; }, get routeId() { return routeId; } };
const boot = () => { if (!A()) return setTimeout(boot, 50); A().remote = remote; A().user = user; A().onSave = push; A().onSaveCar = pushCar; checkAttach(); A().render(); };
boot();
