// Rota Certa: funciona sem internet depois da primeira visita.
// Rede primeiro para o app (sempre a versão mais nova quando há sinal); cópia guardada quando não há.
const CACHE = "rota-certa-v2";
const SHELL = ["./", "./index.html", "./app.js", "../rota-certa/core.js", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {})); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const appFile = url.origin === location.origin;
  const lib = /cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|fonts\.(googleapis|gstatic)\.com/.test(url.host);
  if (!appFile && !lib) return; // mapas, CEP, buscas: sempre direto da rede
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: appFile }).then(r => r || caches.match("./")))
  );
});
