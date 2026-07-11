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
 *   - errors/wiki_crawler/eco_assignment.json (openings assigned '??')
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
const ERRORS_DIR = path.resolve(__dirname, "..", "..", "errors", "wiki_crawler");

// ── ECO lookup ───────────────────────────────────────────────────────────────

/**
 * Find the nearest ECO code for a move sequence by replaying moves and
 * walking backward through the move history to find a parent opening in
 * eco.json.
 *
 * @param {string} moves - PGN move text
 * @param {object} openings - eco.json opening collection (FEN → opening)
 * @returns {{ eco: string, fen: string, movesBack: number }} ECO code and metadata
 */
export function findEcoCode(moves, openings) {
  const game = new ChessPGN();
  try {
    game.loadPgn(moves);
  } catch {
    return { eco: "??", fen: null, movesBack: -1 };
  }

  const fen = game.fen();

  // Check exact match first
  const exactEntry = openings[fen];
  if (exactEntry && exactEntry.eco && exactEntry.eco !== "??") {
    return { eco: exactEntry.eco, fen, movesBack: 0 };
  }

  // Position-only fallback: same position, different game state
  // (matches fensterchess's findOpening behavior via positionBook)
  const posOnly = fen.split(" ")[0];
  const posMatch = Object.keys(openings).find(
    (k) => k.split(" ")[0] === posOnly && openings[k].eco && openings[k].eco !== "??"
  );
  if (posMatch) {
    return { eco: openings[posMatch].eco, fen: posMatch, movesBack: 0 };
  }

  // Walk backward through move history to find parent opening
  const history = game.history({ verbose: true });
  for (let i = history.length - 1; i >= 0; i--) {
    game.undo();
    const parentFen = game.fen();
    const entry = openings[parentFen];
    if (entry && entry.eco && entry.eco !== "??") {
      return { eco: entry.eco, fen: parentFen, movesBack: history.length - i };
    }
  }

  return { eco: "??", fen, movesBack: -1 };
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
      src: "wiki_crawler",
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

    const { eco, fen, movesBack } = findEcoCode(moves, allOpenings);

    if (eco === "??") {
      unknown++;
      unknowns.push({ url, name, moves });
    } else {
      assigned++;
    }

    // Only include if we have a valid FEN (moves parsed successfully)
    if (fen) {
      output.push({ name, eco, moves, fen });
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
