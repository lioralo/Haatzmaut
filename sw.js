const CACHE_NAME = "haatzmaut-dev-shell-v3";
const ASSETS = [
  "/", "/index.html", "/styles.css", "/display.html", "/display.css", "/display.js", "/accessibility.html",
  "/src/main.js", "/src/core/constants.js", "/src/core/utils.js", "/src/core/store.js", "/src/core/session.js", "/src/core/index.js",
  "/src/calendar/state.js", "/src/calendar/render.js", "/src/calendar/events.js",
  "/src/staff/state.js", "/src/staff/render.js", "/src/staff/events.js",
  "/src/meetings/state.js", "/src/meetings/render.js", "/src/meetings/events.js",
  "/src/issues/state.js", "/src/issues/render.js", "/src/issues/events.js",
  "/src/resources/state.js", "/src/resources/render.js", "/src/resources/events.js", "/src/resources/db.js"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(k => k.startsWith("haatzmaut-") && k !== CACHE_NAME)
        .map(k => caches.delete(k))
    );
    await self.clients.claim();
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    clients.forEach(client => client.postMessage({ type: "CACHE_UPDATED", cacheName: CACHE_NAME }));
  })());
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;

  const url = new URL(e.request.url);
  const isAppCodeAsset = url.origin === self.location.origin && (
    url.pathname.startsWith("/src/") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".html")
  );

  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request, { cache: "no-store" })
        .then(response => {
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, response.clone())).catch(() => {});
          return response;
        })
        .catch(() => caches.match("/index.html"))
    );
    return;
  }

  if (isAppCodeAsset) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(e.request, { cache: "no-store" });
        if (response && response.status === 200) {
          cache.put(e.request, response.clone()).catch(() => {});
        }
        return response;
      } catch {
        return cache.match(e.request, { ignoreSearch: false });
      }
    })());
    return;
  }

  e.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(e.request, { ignoreSearch: false });
    if (cached) return cached;
    const response = await fetch(e.request);
    if (response && response.status === 200) {
      cache.put(e.request, response.clone()).catch(() => {});
    }
    return response;
  })());
});
