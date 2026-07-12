/**
 * assignEcoCodes.js — Post-crawl ECO assignment for the wiki parser.
 *
 * Reads openingMinusEco.json (produced by genPartialOpeningData.js), replays
 * each move sequence through chessPGN, and looks up the resulting FEN in
 * eco.json. If no exact match, walks backward through move history to find
 * the nearest ancestor opening.
 *
 * Outputs:
 *   - parsers/wikiChessOpeningTheoryCrawler/output/opening.json (standard format)
 *   - errors/wiki_b/eco_assignment.json (openings assigned '??')
 *
 * Usage:
 *   node parsers/wikiChessOpeningTheoryCrawler/assignEcoCodes.js
 */

import fs from "fs";
import path from "path";
import { ChessPGN } from "@chess-pgn/chess-pgn";
import { getLatestEcoJson, book } from "../../utils.js";

const __dirname = new URL(".", import.meta.url).pathname;
const DATA_DIR = __dirname;
const OPENINGS_FILE = path.join(DATA_DIR, "openingMinusEco.json");
const OUTPUT_DIR = path.join(DATA_DIR, "output");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "opening.json");
const ERRORS_DIR = path.resolve(__dirname, "..", "..", "errors", "wiki_b");

// ── Name synonym map ─────────────────────────────────────────────────────────
// Load known wiki→eco.json name equivalences. When a wiki entry's name
// (after parent-name prefixing) is a synonym of its parent opening, the
// entry is skipped — it adds no new naming information. The map keys
// are wiki sub-names (bare, without root prefix); values are unused
// (lookup is key existence against the wiki suffix).
const SYNONYMS_FILE = path.join(DATA_DIR, "name-synonyms.json");
let synonymKeys = new Set();
try {
  const syn = JSON.parse(fs.readFileSync(SYNONYMS_FILE, "utf-8"));
  synonymKeys = new Set(Object.keys(syn.synonyms ?? {}));
} catch {
  // file missing or malformed — no synonyms active
}

// ── ECO lookup ───────────────────────────────────────────────────────────────

/**
 * Find the nearest ECO code and parent opening name for a move sequence
 * by replaying moves and walking backward through move history.
 *
 * @param {string} moves - PGN move text
 * @param {object} openings - eco.json opening collection (FEN → opening)
 * @returns {{ eco: string, fen: string, name: string|null, movesBack: number }}
 *   ECO code, resolved FEN, inherited parent name (null when exact match),
 *   and how many half-moves back the parent is
 */
export function findEcoCode(moves, openings) {
  const game = new ChessPGN();
  try {
    game.loadPgn(moves);
  } catch {
    return { eco: "??", fen: null, name: null, movesBack: -1 };
  }

  const fen = game.fen();

  // Check exact match first
  const exactEntry = openings[fen];
  if (exactEntry && exactEntry.eco && exactEntry.eco !== "??") {
    return { eco: exactEntry.eco, fen, name: exactEntry.name || null, movesBack: 0 };
  }

  // Position-only fallback: same position, different game state
  // (matches fensterchess's findOpening behavior via positionBook)
  const posOnly = fen.split(" ")[0];
  const posMatch = Object.keys(openings).find(
    (k) => k.split(" ")[0] === posOnly && openings[k].eco && openings[k].eco !== "??",
  );
  if (posMatch) {
    const entry = openings[posMatch];
    return { eco: entry.eco, fen: posMatch, name: entry.name || null, movesBack: 0 };
  }

  // Walk backward through move history to find parent opening
  const history = game.history({ verbose: true });
  for (let i = history.length - 1; i >= 0; i--) {
    game.undo();
    const parentFen = game.fen();
    const entry = openings[parentFen];
    if (entry && entry.eco && entry.eco !== "??") {
      return { eco: entry.eco, fen: parentFen, name: entry.name || null, movesBack: history.length - i };
    }
  }

  return { eco: "??", fen, name: null, movesBack: -1 };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!fs.existsSync(OPENINGS_FILE)) {
    console.error(`Input file not found: ${OPENINGS_FILE}`);
    console.error("Run genPartialOpeningData.js first.");
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(OPENINGS_FILE, "utf-8"));
  const entries = Object.entries(raw);
  console.log(`Loaded ${entries.length} wiki openings from openingMinusEco.json`);

  // Load eco.json
  console.log("Loading eco.json for ECO lookup...");
  const existing = await getLatestEcoJson();
  const allOpenings = book; // populated by getLatestEcoJson

  // Assign ECO codes
  const output = [
    {
      src: "wiki_b",
      url: "https://en.wikibooks.org/wiki/Chess_Opening_Theory",
    },
  ];

  let assigned = 0;
  let unknown = 0;
  let skipped = 0;
  const unknowns = [];

  for (const [url, { name, moves }] of entries) {
    if (!moves) {
      skipped++;
      continue;
    }

    const { eco, fen, name: parentName, movesBack } = findEcoCode(moves, allOpenings);

    if (eco === "??") {
      unknown++;
      unknowns.push({ url, name, moves });
    } else {
      assigned++;
    }

    // Clean up wiki names: inheriting from the parent opening removes
    // raw page-title noise ("Chess Opening Theory/1. e4/...") and
    // pure move-notation names ("8. Bg3", "8...b5").
    // But names with sub-variation markers (·, —, :) after the move
    // carry real naming information and are preserved.
    const isRawPageTitle = /^Chess Opening Theory\//.test(name);
    const isMoveNumber = /^\d+\.\.?\.{0,3}\s*[a-zA-Z]/.test(name);
    const hasSubName = /[·—]/.test(name);
    let resolvedName =
      (isRawPageTitle || (isMoveNumber && !hasSubName)) && parentName ? parentName : isRawPageTitle ? "TBD" : name;

    // Strip move-number prefix from · sub-names unconditionally:
    //   "2. exf5 · Duras gambit accepted" → "Duras gambit accepted"
    if (hasSubName) {
      const dotIdx = resolvedName.indexOf("·");
      if (dotIdx !== -1) {
        resolvedName = resolvedName.substring(dotIdx + 1).trim();
      }
    }

    // Prepend parent name for sub-variations that lack context.
    // Wiki names like "Kobo-Steinberg Variation" or "Mengarini
    // Variation" need their root opening prepended ("Sicilian Defense:
    // Najdorf Variation: Kobo-Steinberg Variation").
    // Skip prefixing when the wiki name already embeds the parent
    // context (e.g. "Vienna Countergambit" already implies Vienna).
    // Applies to both exact matches (movesBack === 0) and walked-back
    // matches (movesBack > 0) — in both cases the wiki name may be a
    // bare sub-variation name without its root opening.
    if (parentName && resolvedName !== parentName) {
      const norm = (s) =>
        s
          .toLowerCase()
          .replace(/defence/g, "defense")
          .replace(/[·—:,]/g, " ");
      const pWords = new Set(
        norm(parentName)
          .split(/\s+/)
          .filter((w) => w.length > 2),
      );
      const wWords = norm(resolvedName)
        .split(/\s+/)
        .filter((w) => w.length > 2);
      const overlap = wWords.filter((w) => pWords.has(w)).length;
      const pContainsW = norm(parentName).includes(norm(resolvedName));
      const wContainsP = norm(resolvedName).includes(norm(parentName));
      const allWikiWordsInParent = overlap === wWords.length;
      // More than half the wiki words appear in the parent → shared,
      // BUT if the parent is significantly more specific (2+ more words),
      // the wiki name is a generic label — still prefix.
      const majorityOverlap = wWords.length > 0 && overlap / wWords.length > 0.5 && pWords.size <= wWords.length + 1;
      const sharedContext = pContainsW || wContainsP || allWikiWordsInParent || majorityOverlap;

      if (!sharedContext) {
        let subName = resolvedName;
        // Strip word-prefix overlap with parent:
        //   parent "Latvian Gambit: Poisoned Pawn Variation"
        //   sub    "Latvian Gambit: Mayet Attack"
        //   → strip "Latvian Gambit" → "Mayet Attack"
        // Guardrails: need ≥2 common words AND ≥2 words remaining
        // after stripping. Prevents "French"→"Defence, Winawer" and
        // "Caro-Kann Panov-Botvinnik"→"Attack".
        const subNorm = subName
          .toLowerCase()
          .replace(/defence/g, "defense")
          .replace(/[·—:,]/g, " ");
        const parentNorm = parentName
          .toLowerCase()
          .replace(/defence/g, "defense")
          .replace(/[·—:,]/g, " ");
        const subWords = subNorm.split(/\s+/).filter((w) => w.length > 0);
        const parWords = parentNorm.split(/\s+/).filter((w) => w.length > 0);
        let commonPrefixLen = 0;
        while (
          commonPrefixLen < subWords.length &&
          commonPrefixLen < parWords.length &&
          subWords[commonPrefixLen] === parWords[commonPrefixLen]
        ) {
          commonPrefixLen++;
        }
        const remainingAfterStrip = subWords.length - commonPrefixLen;
        if (commonPrefixLen >= 2 && remainingAfterStrip >= 2) {
          let stripped = subName;
          for (let i = 0; i < commonPrefixLen; i++) stripped = stripped.replace(/^\S+\s*/, "");
          // Also strip a leading "Defence," or "Defense," if it's just
          // a classifier left dangling after the real opening name.
          stripped = stripped.replace(/^Defen[cs]e,?\s*/i, "");
          if (stripped.trim()) subName = stripped.trim();
        }
        // Use comma for sub-variations (parent already has a colon),
        // colon for variations (parent is just the opening name).
        const sep = parentName.includes(":") ? ", " : ": ";
        resolvedName = parentName + sep + subName;
      } else if (allWikiWordsInParent && parentName.length > resolvedName.length) {
        // Wiki name is a proper subset of the parent ("Mengarini Variation"
        // within "Sicilian Defense: Mengarini Variation"). Inherit the
        // more specific parent name.
        resolvedName = parentName;
      }
    }

    // Anonymous continuations: positions whose name equals the parent
    // opening's name and required walking backward to classify. These
    // add zero naming information — the interpolation pipeline already
    // handles gaps between named openings.
    // Uses synonym normalization so "Queen's Pawn Opening" matches
    // "Queen's Pawn Game" and "Defence" matches "Defense".
    // Also checks the name-synonyms.json map: "Schliemann Defence
    // Accepted" is a synonym of "Ruy Lopez: Schliemann Defense,
    // Jaenisch Gambit Accepted" and should be skipped.
    const normSyn = (s) =>
      s
        .toLowerCase()
        .replace(/defence/g, "defense")
        .replace(/\bopening\b/g, "game");
    const isAnonymousContinuation =
      (movesBack > 0 && parentName && normSyn(resolvedName) === normSyn(parentName)) ||
      (parentName && synonymKeys.has(name));

    // Only include if we have a valid FEN (moves parsed successfully)
    if (fen && !isAnonymousContinuation) {
      output.push({ name: resolvedName, eco, moves, fen });
    } else if (fen) {
      skipped++;
    } else {
      skipped++;
    }
  }

  console.log(`ECO assignment: ${assigned} matched, ${unknown} unknown (??), ${skipped} skipped`);

  // Write standard-format opening.json
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log(`Wrote ${output.length - 1} opening(s) to ${OUTPUT_FILE}`);

  // Write unknowns for manual review
  if (unknowns.length > 0) {
    if (!fs.existsSync(ERRORS_DIR)) {
      fs.mkdirSync(ERRORS_DIR, { recursive: true });
    }
    fs.writeFileSync(
      path.join(ERRORS_DIR, "eco_assignment.json"),
      JSON.stringify({ total: unknowns.length, openings: unknowns }, null, 2),
    );
    console.log(`${unknowns.length} opening(s) with unknown ECO — see ${ERRORS_DIR}/eco_assignment.json`);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
