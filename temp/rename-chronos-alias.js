/**
 * One-time script: rename aliases key "chronos" → "kent-eco" across all
 * live eco.json data files. Fetches from GitHub to ensure current data.
 *
 * Output: writes to temp/ directory. Copy to eco.json repo and PR from there.
 *
 * Usage:
 *   node temp/rename-chronos-alias.js
 */

const ECO_JSON_ROOT = "https://raw.githubusercontent.com/JeffML/eco.json/master/";
const FILES = ["ecoA.json", "ecoB.json", "ecoC.json", "ecoD.json", "ecoE.json", "eco_interpolated.json"];

const fs = await import("fs");
const path = await import("path");

const outDir = new URL(".", import.meta.url).pathname;
fs.mkdirSync(outDir, { recursive: true });

let totalRenamed = 0;
let totalOpenings = 0;

for (const file of FILES) {
  const url = ECO_JSON_ROOT + file;
  console.log(`Fetching ${url}...`);
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`  FAILED: HTTP ${res.status}`);
    continue;
  }

  /** @type {Record<string, object>} */
  const data = await res.json();
  const entries = Object.entries(data);
  let renamed = 0;

  for (const [fen, opening] of entries) {
    if (opening.aliases && opening.aliases.chronos) {
      opening.aliases["kent-eco"] = opening.aliases.chronos;
      delete opening.aliases.chronos;
      renamed++;
    }
  }

  totalRenamed += renamed;
  totalOpenings += entries.length;

  const outPath = path.join(outDir, file);
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
  console.log(`  ${entries.length} openings, ${renamed} aliases renamed → ${outPath}`);
}

console.log(`\nDone. ${totalRenamed} aliases renamed across ${totalOpenings} openings.`);
console.log(`Files written to ${outDir}`);
console.log("Copy these to your eco.json fork and submit a PR.");
