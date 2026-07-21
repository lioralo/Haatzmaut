const CACHE_NAME = "haatzmaut-v1";
const ASSETS = [
  "/", "/index.html", "/styles.css", "/display.html", "/display.css", "/display.js", "/accessibility.html",
  "/src/main.js", "/src/core/constants.js", "/src/core/utils.js", "/src/core/store.js", "/src/core/session.js", "/src/core/index.js",
  "/src/calendar/state.js", "/src/calendar/render.js", "/src/calendar/events.js",
  "/src/staff/state.js", "/src/staff/render.js", "/src/staff/events.js",
  "/src/meetings/state.js", "/src/meetings/render.js", "/src/meetings/events.js",
  "/src/issues/state.js", "/src/issues/render.js", "/src/issues/events.js",
  "/src/resources/state.js", "/src/resources/render.js", "/src/resources/events.js", "/src/resources/db.js"
];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS))); });
self.addEventListener("fetch", e => { e.respondWith(caches.match(e.request).then(r => r || fetch(e.request))); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))); });
