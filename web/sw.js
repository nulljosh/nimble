// ponytail: cache-first over a fixed file list. Bump CACHE to ship an update.
const CACHE = "nimble-v1";
const FILES = ["/app/", "/app/index.html", "/app/tokens.css", "/app/icon.svg", "/app/manifest.webmanifest"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  // Same-origin GETs only; the answer APIs are cross-origin and stay network-only.
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request)));
});
