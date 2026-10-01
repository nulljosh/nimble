// Offline shell: network first so deploys show up immediately, cache as the fallback.
// ponytail: same-origin GETs only; the answer sources are cross-origin and need the network anyway.
const CACHE = "nimble-v1";
self.addEventListener("install", e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c => c.addAll(["./", "engine.js?v=offline", "tokens.css", "devices.css", "suggestions.json", "icon.svg", "manifest.webmanifest"]))); });
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", e => {
  const r = e.request;
  if (r.method !== "GET" || new URL(r.url).origin !== location.origin) return;
  e.respondWith(fetch(r).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(r, copy)); return res; })
    .catch(() => caches.match(r, {ignoreSearch: r.mode === "navigate"})));
});
