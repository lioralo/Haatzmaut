import * as esbuild from "esbuild";

const isProd = process.argv.includes("--prod");

await esbuild.build({
  entryPoints: ["src/main.js"],
  bundle: true,
  outfile: "dist/app.min.js",
  minify: isProd,
  sourcemap: !isProd,
  target: "es2020",
  legalComments: "none",
  format: "esm",
  define: { "__PROD__": isProd ? "true" : "false" }
});

if (isProd) {
  const { copyFileSync, mkdirSync, readdirSync } = await import("node:fs");
  mkdirSync("dist/templates", { recursive: true });
  copyFileSync("index.html", "dist/index.html");
  copyFileSync("display.html", "dist/display.html");
  copyFileSync("accessibility.html", "dist/accessibility.html");
  copyFileSync("display.js", "dist/display.js");
  copyFileSync("styles.css", "dist/styles.css");
  copyFileSync("display.css", "dist/display.css");
  for (const f of readdirSync("templates")) {
    copyFileSync(`templates/${f}`, `dist/templates/${f}`);
  }
}

console.log(isProd ? "Production build complete → dist/" : "Dev build complete → dist/");
