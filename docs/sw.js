// Offline shell: network first so deploys show up immediately, cache as the fallback.
// ponytail: same-origin GETs only; the answer sources are cross-origin and need the network anyway.
const CACHE = "nimble-v8";
self.addEventListener("install", e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c => c.addAll(["./", "app", "brand", "icon-512.png", "icon-64.png", "engine.js?v=offline", "courses.js?v=1", "i18n.js", "locales/en.json", "locales/fr.json", "locales/es.json", "locales/zh.json", "locales/pa.json", "locales/de.json", "locales/pt.json", "locales/hi.json", "locales/ja.json", "locales/it.json", "locales/ko.json", "locales/ru.json", "locales/nl.json", "locales/tr.json", "locales/pl.json", "tokens.css", "devices.css", "fonts/NimbleSans-Regular.woff2", "fonts/NimbleSans-Medium.woff2", "fonts/NimbleSans-SemiBold.woff2", "fonts/NimbleSans-Bold.woff2", "suggestions.json", "hamlet-16x9.jpg", "icon.svg", "mascot/flit.svg", "mascot/nim-wave.svg", "mascot/nim-think.svg", "mascot/nim-cheer.svg", "mascot/nim-doze.svg", "mascot/fen.svg", "og-1200x630.png", "manifest.webmanifest"]))); });
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", e => {
  const r = e.request;
  if (r.method !== "GET" || new URL(r.url).origin !== location.origin) return;
  // The offline pack is a multi-megabyte download the user asks for; it lives in IndexedDB, not in this cache.
  if (new URL(r.url).pathname.startsWith("/pack/")) return;
  e.respondWith(fetch(r).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(r, copy)); return res; })
    .catch(() => caches.match(r, {ignoreSearch: r.mode === "navigate"})));
});
