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

  copyFileSync("styles.css", "dist/styles.css");
  copyFileSync("display.css", "dist/display.css");
  copyFileSync("accessibility.html", "dist/accessibility.html");

  writeFileSync("dist/sw.js", buildServiceWorkerScript(`haatzmaut-${cacheBuster}`));

  for (const f of readdirSync("templates")) {
    copyFileSync(`templates/${f}`, `dist/templates/${f}`);
  }
}

console.log(isProd ? "Production build complete → dist/" : "Dev build complete → dist/");
