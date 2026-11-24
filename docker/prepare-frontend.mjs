// Bereitet das Frontend für den Produktions-Build im Container vor.
// Wird nur im Docker-Build ausgeführt – die Dateien im Repo bleiben unverändert,
// damit der Emergent-Editor weiter funktioniert.
//
// 1. Entfernt die Emergent-Entwicklungspakete (werden nur für den Dev-Server
//    gebraucht und von assets.emergent.sh geladen).
// 2. Entfernt aus index.html das Emergent-Skript und das PostHog-Tracking
//    (Session-Recording an ap.emergent.sh) und setzt einen passenden Titel.
import { readFileSync, writeFileSync } from "node:fs";

const title = process.env.APP_TITLE || "MittwochsPizza";

const pkgPath = "package.json";
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
for (const name of Object.keys(pkg.devDependencies ?? {})) {
  if (name.startsWith("@emergentbase/")) delete pkg.devDependencies[name];
}
delete pkg.packageManager; // kein Corepack-Download im Build
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

const htmlPath = "public/index.html";
let html = readFileSync(htmlPath, "utf8");
html = html.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/g, (tag, body) => {
  if (/emergent\.sh/.test(tag) || /posthog/i.test(body)) return "";
  return tag;
});
html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${title}</title>`);
html = html.replace(
  /<meta name="description" content="[^"]*"\s*\/?>/,
  `<meta name="description" content="${title} – Pizza bestellen" />`,
);
if (/emergent\.sh|posthog/i.test(html)) {
  console.error("prepare-frontend: Emergent/PostHog-Reste in index.html gefunden – Abbruch.");
  process.exit(1);
}
writeFileSync(htmlPath, html);
console.log("prepare-frontend: package.json und index.html bereinigt.");
