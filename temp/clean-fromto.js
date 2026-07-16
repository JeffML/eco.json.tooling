/**
 * One-time script: clean stale fromTo transitions that reference FENs
 * not present in ecoA-E.json or eco_interpolated.json.
 *
 * Usage:
 *   node temp/clean-fromto.js
 *
 * Reads from eco.json repo, writes fixed fromTo.json to temp/.
 */

import fs from "fs";
import path from "path";

const ECO_DIR = path.resolve(process.argv[2] || "../eco.json");

console.log(`Reading eco.json data from ${ECO_DIR}...`);

// Load all openings
const allFens = new Set();
for (const cat of ["A", "B", "C", "D", "E"]) {
  const fp = path.join(ECO_DIR, `eco${cat}.json`);
  if (fs.existsSync(fp)) {
    const data = JSON.parse(fs.readFileSync(fp, "utf8"));
    for (const fen of Object.keys(data)) allFens.add(fen);
    console.log(`  eco${cat}.json: ${Object.keys(data).length} entries`);
  }
}

const interpPath = path.join(ECO_DIR, "eco_interpolated.json");
if (fs.existsSync(interpPath)) {
  const interp = JSON.parse(fs.readFileSync(interpPath, "utf8"));
  for (const fen of Object.keys(interp)) allFens.add(fen);
  console.log(`  eco_interpolated.json: ${Object.keys(interp).length} entries`);
}

console.log(`Total unique FENs: ${allFens.size}`);

// Load and clean fromTo
const ftPath = path.join(ECO_DIR, "fromTo.json");
const fromTos = JSON.parse(fs.readFileSync(ftPath, "utf8"));
console.log(`\nfromTo transitions: ${fromTos.length}`);

let removed = 0;
const brokenFrom = new Map();
const brokenTo = new Map();

const cleaned = fromTos.filter(([fromFen, toFen]) => {
  if (!allFens.has(fromFen)) {
    brokenFrom.set(fromFen, (brokenFrom.get(fromFen) || 0) + 1);
    removed++;
    return false;
  }
  if (!allFens.has(toFen)) {
    brokenTo.set(toFen, (brokenTo.get(toFen) || 0) + 1);
    removed++;
    return false;
  }
  return true;
});

console.log(`Removed ${removed} stale transitions.`);
console.log(`  Broken 'from' FENs: ${brokenFrom.size}`);
console.log(`  Broken 'to' FENs:   ${brokenTo.size}`);
console.log(`Remaining: ${cleaned.length}`);

// Write cleaned file
const outDir = path.resolve("temp");
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "fromTo.json");
fs.writeFileSync(outPath, JSON.stringify(cleaned));
console.log(`\nWrote cleaned fromTo.json → ${outPath}`);
console.log("Copy this to your eco.json repo and re-run sanity-check.");
