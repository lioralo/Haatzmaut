import * as esbuild from "esbuild";

const isProd = process.argv.includes("--prod");
const buildId = isProd ? Date.now().toString(36) : "dev";

await esbuild.build({
  entryPoints: ["src/main.js"],
  bundle: true,
  outfile: "dist/app.min.js",
  minify: isProd,
  sourcemap: !isProd,
  target: "es2022",
  legalComments: "none",
  format: "esm",
  define: {
    "__PROD__": isProd ? "true" : "false",
    "__BUILD_ID__": JSON.stringify(buildId)
  }
});

function buildServiceWorkerScript(cacheName) {
  return `
const CACHE_NAME = ${JSON.stringify(cacheName)};
const ASSETS = ["/", "/index.html", "/styles.css", "/display.html", "/display.css", "/display.js", "/app.min.js"];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(key => key.startsWith("haatzmaut-") && key !== CACHE_NAME)
        .map(key => caches.delete(key))
    );
    await self.clients.claim();
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    clients.forEach(client => client.postMessage({ type: "CACHE_UPDATED", cacheName: CACHE_NAME }));
  })());
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  const req = event.request;
  const url = new URL(req.url);
  const isSameOrigin = url.origin === self.location.origin;
  if (!isSameOrigin) return;
  const isAppCodeAsset =
    url.pathname.startsWith("/src/") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".html");

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req, { cache: "no-store" })
        .then(response => {
          caches.open(CACHE_NAME).then(cache => cache.put(req, response.clone())).catch(() => {});
          return response;
        })
        .catch(() => caches.match("/index.html"))
    );
    return;
  }

  if (isAppCodeAsset) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(req, { cache: "no-store" });
        if (response && response.status === 200) {
          cache.put(req, response.clone()).catch(() => {});
        }
        return response;
      } catch {
        return cache.match(req, { ignoreSearch: false });
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req, { ignoreSearch: false });
    if (cached) return cached;
    const response = await fetch(req);
    if (response && response.status === 200) {
      cache.put(req, response.clone()).catch(() => {});
    }
    return response;
  })());
});
`.trim();
}

if (isProd) {
  const { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } = await import("node:fs");
  const cacheBuster = buildId;
  mkdirSync("dist/templates", { recursive: true });

  const indexHtml = readFileSync("index.html", "utf8")
    .replace('src="src/main.js"', `src="app.min.js?v=${cacheBuster}"`)
    .replace(/styles\.css\?v=\d+/g, `styles.css?v=${cacheBuster}`)
    .replace(/display\.html\?v=\d+/g, `display.html?v=${cacheBuster}`)
    .replace(/display\.css\?v=\d+/g, `display.css?v=${cacheBuster}`);
  writeFileSync("dist/index.html", indexHtml);

  const displayHtml = readFileSync("display.html", "utf8")
    .replace(/display\.css\?v=\d+/g, `display.css?v=${cacheBuster}`)
    .replace(/display\.js\?v=\d+/g, `display.js?v=${cacheBuster}`);
  writeFileSync("dist/display.html", displayHtml);

  copyFileSync("display.js", "dist/display.js");
  copyFileSync("styles.css", "dist/styles.css");
  copyFileSync("display.css", "dist/display.css");
  copyFileSync("accessibility.html", "dist/accessibility.html");

  writeFileSync("dist/sw.js", buildServiceWorkerScript(`haatzmaut-${cacheBuster}`));

  for (const f of readdirSync("templates")) {
    copyFileSync(`templates/${f}`, `dist/templates/${f}`);
  }
}

console.log(isProd ? "Production build complete → dist/" : "Dev build complete → dist/");
