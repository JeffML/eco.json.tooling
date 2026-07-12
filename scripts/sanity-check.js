#!/usr/bin/env node
/**
 * sanity-check.js — Post-generation integrity checks on eco.json output.
 *
 * Usage:
 *   node scripts/sanity-check.js [path/to/output]
 *
 * If no path given, checks the local eco.json data files (ecoA-E.json,
 * eco_interpolated.json, fromTo.json) in the parent eco.json repo.
 *
 * Checks:
 *   1. FEN uniqueness — no FEN in both ecoA-E and eco_interpolated
 *   2. ECO prefix match — ecoA.json entries start with A, etc.
 *   3. Interpolated isolation — "interpolated" src only in eco_interpolated
 *   4. fromTo referential integrity — every from/to FEN exists in openings
 *   5. No duplicate fromTo — no repeated (from, to) pairs
 *   6. Valid sources — every src, rootSrc, aliases key is a known source
 *   7. rootSrc on interpolated — every interpolated entry has rootSrc
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ── Known sources ────────────────────────────────────────────────────────────

const KNOWN_SOURCES = new Set([
  "eco_tsv",
  "eco_js",
  "scid",
  "eco_wikip",
  "eco_wikip.g",
  "wiki_b",
  "fics",
  "ct",
  "chessGraph",
  "chronos",
  "icsbot",
  "pgn",
  "interpolated",
]);

// ── Helpers ──────────────────────────────────────────────────────────────────

let errors = 0;
let warnings = 0;

const fail = (check, msg) => {
  console.error(`  FAIL [${check}]: ${msg}`);
  errors++;
};
const warn = (check, msg) => {
  console.warn(`  WARN [${check}]: ${msg}`);
  warnings++;
};

const loadJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));

const ecoCategory = (eco) => (eco && /^[A-E]/.test(eco) ? eco[0] : null);

// ── Check implementations ────────────────────────────────────────────────────

/** 1. FEN uniqueness across ecoA-E and eco_interpolated */
const checkFenUniqueness = (ecoFiles, interpolated) => {
  const ecoFens = new Set();
  for (const [file, data] of Object.entries(ecoFiles)) {
    for (const fen of Object.keys(data)) {
      if (ecoFens.has(fen)) fail("fen-unique", `Duplicate FEN in eco files: ${fen.slice(0, 40)}...`);
      ecoFens.add(fen);
    }
  }
  for (const fen of Object.keys(interpolated)) {
    if (ecoFens.has(fen)) fail("fen-unique", `FEN in both eco and interpolated: ${fen.slice(0, 40)}...`);
  }
  if (errors === 0)
    console.log(
      `  ✓ fen-unique: ${ecoFens.size} unique in ecoA-E, ${Object.keys(interpolated).length} in interpolated, 0 overlaps`,
    );
};

/** 2. ECO category prefix matches file */
const checkEcoPrefix = (ecoFiles) => {
  for (const [file, data] of Object.entries(ecoFiles)) {
    const expected = file.replace("eco", "").replace(".json", "");
    for (const [fen, entry] of Object.entries(data)) {
      const cat = ecoCategory(entry.eco);
      if (cat !== expected) {
        fail("eco-prefix", `${file}: FEN ${fen.slice(0, 30)}... has eco ${entry.eco}, expected ${expected}*`);
      }
    }
  }
  if (errors === 0) console.log(`  ✓ eco-prefix: all entries match their category file`);
};

/** 3. No interpolated src in ecoA-E files */
const checkInterpolatedIsolation = (ecoFiles, interpolated) => {
  for (const [file, data] of Object.entries(ecoFiles)) {
    for (const [fen, entry] of Object.entries(data)) {
      if (entry.src === "interpolated") {
        fail("interp-isolation", `${file}: ${fen.slice(0, 30)}... has src=interpolated`);
      }
    }
  }
  for (const [fen, entry] of Object.entries(interpolated)) {
    if (entry.src !== "interpolated") {
      fail("interp-isolation", `eco_interpolated: ${fen.slice(0, 30)}... has src=${entry.src}, expected interpolated`);
    }
  }
  if (errors === 0) console.log(`  ✓ interp-isolation: interpolated entries correctly separated`);
};

/** 4. fromTo referential integrity */
const checkFromToIntegrity = (fromTos, allFens) => {
  for (const [from, to] of fromTos) {
    if (!allFens.has(from)) fail("fromto-ref", `fromTo "from" FEN not found: ${from.slice(0, 40)}...`);
    if (!allFens.has(to)) fail("fromto-ref", `fromTo "to" FEN not found:   ${to.slice(0, 40)}...`);
  }
  if (errors === 0) console.log(`  ✓ fromto-ref: all ${fromTos.length} transitions reference existing FENs`);
};

/** 5. No duplicate fromTo entries */
const checkDuplicateFromTo = (fromTos) => {
  const seen = new Set();
  for (const [from, to] of fromTos) {
    const key = `${from}|${to}`;
    if (seen.has(key)) fail("fromto-dup", `Duplicate fromTo: ${from.slice(0, 30)}... → ${to.slice(0, 30)}...`);
    seen.add(key);
  }
  if (errors === 0) console.log(`  ✓ fromto-dup: no duplicate transitions`);
};

/** 6. Valid OpeningSource values */
const checkValidSources = (ecoFiles, interpolated) => {
  const allData = { ...Object.values(ecoFiles).reduce((a, b) => ({ ...a, ...b }), {}), ...interpolated };
  for (const [fen, entry] of Object.entries(allData)) {
    if (!KNOWN_SOURCES.has(entry.src)) {
      fail("valid-src", `Unknown src "${entry.src}" for ${fen.slice(0, 30)}...`);
    }
    if (entry.rootSrc && !KNOWN_SOURCES.has(entry.rootSrc)) {
      fail("valid-src", `Unknown rootSrc "${entry.rootSrc}" for ${fen.slice(0, 30)}...`);
    }
    if (entry.aliases) {
      for (const aliasSrc of Object.keys(entry.aliases)) {
        if (!KNOWN_SOURCES.has(aliasSrc)) {
          fail("valid-src", `Unknown alias source "${aliasSrc}" for ${fen.slice(0, 30)}...`);
        }
      }
    }
  }
  if (errors === 0) console.log(`  ✓ valid-src: all source identifiers are valid OpeningSource values`);
};

/** 7. Interpolated entries have rootSrc */
const checkRootSrc = (interpolated) => {
  for (const [fen, entry] of Object.entries(interpolated)) {
    if (!entry.rootSrc) {
      fail("rootsrc", `Interpolated entry missing rootSrc: ${fen.slice(0, 40)}...`);
    }
    if (entry.rootSrc === "TBD") {
      fail("rootsrc", `Interpolated entry has unresolved rootSrc "TBD": ${fen.slice(0, 40)}...`);
    }
  }
  if (errors === 0)
    console.log(`  ✓ rootsrc: all ${Object.keys(interpolated).length} interpolated entries have rootSrc`);
};

// ── Main ─────────────────────────────────────────────────────────────────────

const main = () => {
  const targetDir = process.argv[2] || path.resolve(ROOT, "..", "eco.json");

  console.log(`Sanity-checking eco.json data in: ${targetDir}\n`);

  const ecoFiles = {};
  let interpolated = {};
  let fromTos = [];

  for (const cat of ["A", "B", "C", "D", "E"]) {
    const fp = path.join(targetDir, `eco${cat}.json`);
    if (fs.existsSync(fp)) ecoFiles[`eco${cat}.json`] = loadJson(fp);
  }

  const interpPath = path.join(targetDir, "eco_interpolated.json");
  if (fs.existsSync(interpPath)) interpolated = loadJson(interpPath);

  const ftPath = path.join(targetDir, "fromTo.json");
  if (fs.existsSync(ftPath)) fromTos = loadJson(ftPath);

  const allFens = new Set([...Object.values(ecoFiles).flatMap((d) => Object.keys(d)), ...Object.keys(interpolated)]);

  console.log(`Data loaded: ${allFens.size} total FENs, ${fromTos.length} fromTo transitions\n`);

  checkFenUniqueness(ecoFiles, interpolated);
  checkEcoPrefix(ecoFiles);
  checkInterpolatedIsolation(ecoFiles, interpolated);
  checkFromToIntegrity(fromTos, allFens);
  checkDuplicateFromTo(fromTos);
  checkValidSources(ecoFiles, interpolated);
  checkRootSrc(interpolated);

  console.log(
    `\n${errors === 0 ? "✓ All checks passed" : `✗ ${errors} failure(s)`}${warnings > 0 ? `, ${warnings} warning(s)` : ""}`,
  );
  process.exit(errors > 0 ? 1 : 0);
};

main();
