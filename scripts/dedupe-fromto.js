#!/usr/bin/env node
/**
 * dedupe-fromto.js — Deduplicate fromTo.json entries.
 *
 * fromTo entries are [from_fen, to_fen, from_source, to_source].
 * Duplicates occur when the same (from, to) pair is recorded multiple times,
 * typically from different parser runs. This script keeps the preferred
 * source (eco_tsv > named source > interpolated) and drops exact duplicates.
 *
 * Usage:
 *   node scripts/dedupe-fromto.js [path/to/fromTo.json]
 *
 * Requires --to-merge or an explicit path. No default — never touches the live eco.json repo.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const args = process.argv.slice(2);
const toMerge = args.includes("--to-merge");

const explicitPath = args.find((a) => !a.startsWith("--"));
if (!toMerge && !explicitPath) {
  console.error("ERROR: specify --to-merge or an explicit path to fromTo.json");
  console.error("  npm run dedupe-fromto -- --to-merge");
  console.error("  node scripts/dedupe-fromto.js path/to/fromTo.json");
  process.exit(1);
}

const fromToPath = toMerge
  ? path.resolve(ROOT, "output", "toMerge", "fromTo.json")
  : explicitPath;

if (!fs.existsSync(fromToPath)) {
  console.error(`ERROR: ${fromToPath} not found.`);
  process.exit(1);
}

// ── Source priority (higher = keep) ──────────────────────────────────────────

const SOURCE_PRIORITY = {
  eco_tsv: 10,
  eco_js: 5,
  scid: 5,
  eco_wikip: 5,
  "eco_wikip.g": 5,
  wiki_b: 5,
  ct: 5,
  chessGraph: 5,
  kentEco: 5,
  icsbot: 5,
  fics: 5,
  pgn: 3,
  interpolated: 1,
};

const priority = (src) => SOURCE_PRIORITY[src] ?? 0;

// ── Dedupe ───────────────────────────────────────────────────────────────────

const fromTos = JSON.parse(fs.readFileSync(fromToPath, "utf8"));

const seen = new Map(); // "from|to" → entry
let duplicates = 0;
let upgraded = 0;

for (const [from, to, fromSrc, toSrc] of fromTos) {
  const key = `${from}|${to}`;
  const existing = seen.get(key);
  if (existing) {
    duplicates++;
    // Upgrade if new entry has higher-priority source
    if (priority(fromSrc) > priority(existing[2]) || priority(toSrc) > priority(existing[3])) {
      seen.set(key, [from, to, fromSrc, toSrc]);
      upgraded++;
    }
  } else {
    seen.set(key, [from, to, fromSrc, toSrc]);
  }
}

const deduped = [...seen.values()];

console.log(`fromTo.json: ${fromTos.length} → ${deduped.length} entries`);
console.log(`  ${duplicates} duplicate(s) removed, ${upgraded} source(s) upgraded\n`);

// ── Write ────────────────────────────────────────────────────────────────────

fs.writeFileSync(fromToPath, JSON.stringify(deduped));
console.log(`✓ Written to ${fromToPath}`);
