import * as esbuild from "esbuild";

const isProd = process.argv.includes("--prod");

await esbuild.build({
  entryPoints: ["src/main.js"],
  bundle: true,
  outfile: "dist/app.min.js",
  minify: isProd,
  sourcemap: !isProd,
  target: "es2022",
  legalComments: "none",
  format: "esm",
  define: { "__PROD__": isProd ? "true" : "false" }
});

await esbuild.build({
  entryPoints: ["display.js"],
  bundle: true,
  outfile: "dist/display.js",
  minify: isProd,
  sourcemap: !isProd,
  target: "es2022",
  legalComments: "none",
  format: "esm",
  define: { "__PROD__": isProd ? "true" : "false" }
});

if (isProd) {
  const { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } = await import("node:fs");
  const cacheBuster = Date.now().toString(36);
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

  copyFileSync("styles.css", "dist/styles.css");
  copyFileSync("display.css", "dist/display.css");
  copyFileSync("accessibility.html", "dist/accessibility.html");

  writeFileSync("dist/sw.js", `const CACHE_NAME="haatzmaut-${cacheBuster}";const ASSETS=["/","/index.html","/styles.css","/display.html","/display.css","/display.js","/app.min.js"];self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()))});self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});self.addEventListener("fetch",e=>{e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)))})`);

  for (const f of readdirSync("templates")) {
    copyFileSync(`templates/${f}`, `dist/templates/${f}`);
  }
}

console.log(isProd ? "Production build complete → dist/" : "Dev build complete → dist/");
