import { ChessPGN } from "@chess-pgn/chess-pgn";
import fs from "fs";
import path from "path";
import leven from "leven";
import { book } from "../utils.js";
import { validate as validateStructured, shouldAbort } from "./validate.js";

let allOpenings = book;

const isRedundant = (existingName, name) => {
  if (leven(existingName, name) < 5) return true;
  if (name.length < existingName.length && existingName.startsWith(name)) return true;
  return false;
};

/**
 * Look up a FEN in the opening book with position-only fallback.
 * Matches fensterchess's findOpening() behavior.
 */
const findInBook = (fen, book) => {
  const exact = book[fen];
  if (exact) return exact;
  // Position-only fallback
  const posOnly = fen.split(" ")[0];
  const key = Object.keys(book).find((k) => k.split(" ")[0] === posOnly);
  return key ? book[key] : undefined;
};

/**
 * Filters incoming openings, removing those already present and preparing lists
 * for addition, modification, or removal.
 *
 * Note that eco_tsv is the preferred source for openings: it will override any other and move them
 * to aliases
 *
 * @param {Array} incoming - Array of incoming opening objects (first element is the src descriptor).
 * @returns {Object} { added, modified, excluded, toRemove }
 */
const filterIncoming = (incoming) => {
  if (!Array.isArray(incoming) || incoming.length === 0) {
    throw new Error("Invalid incoming data: Must be a non-empty array.");
  }

  const src = incoming[0].src;

  let excluded = 0;
  const added = {};
  const modified = {};
  const toRemove = [];

  for (const inc of incoming.slice(1)) {
    // skip the src descriptor
    const { fen, name, moves, eco } = inc;

    if (!fen) continue; // error has already been reported

    const existingEntry = findInBook(fen, allOpenings);

    if (existingEntry) {
      const redundant = isRedundant(existingEntry.name, name);

      if (existingEntry.src === src) {
        if (!redundant) {
          modified[fen] = { ...existingEntry, name, moves, eco };
        } else {
          excluded++;
        }
      } else if (existingEntry.src === "interpolated") {
        if (redundant) {
          // Same name — wiki confirms the interpolated entry, no change needed
          excluded++;
        } else {
          // Different name — promote interpolated to named with wiki's name
          delete existingEntry.rootSrc;
          added[fen] = { ...existingEntry, src, name, moves, eco };
          toRemove.push(fen);
        }
      } else if (src === "eco_tsv" && existingEntry.src !== "eco_tsv") {
        const aliases = existingEntry.aliases ?? {};
        aliases[existingEntry.src] = existingEntry.name;
        aliases[src] = undefined;
        existingEntry.src = src;
        existingEntry.name = name;
        modified[fen] = { ...existingEntry, aliases };
      } else if (!redundant && (!existingEntry.aliases || !existingEntry.aliases[src])) {
        const aliases = existingEntry.aliases ?? {};
        aliases[src] = name;
        modified[fen] = { ...existingEntry, aliases };
      } else {
        excluded++;
      }
    } else {
      added[fen] = { ...inc, src };
    }
  }

  return { added, modified, excluded, toRemove };
};

/**
 * Validates the structure and content of incoming openings.
 * @deprecated Use steps/validate.js `validate(incoming, collector)` for
 *   structured failure collection. This wrapper is kept for backward
 *   compatibility and returns a boolean (logs failures to console only).
 * @param {Array} incoming - Array of incoming opening objects.
 * @returns {boolean} True if no loadPgn/structural failures, false otherwise.
 */
const validate = (incoming) => {
  const chess = new ChessPGN();
  const source = incoming[0]?.src;
  if (!source) {
    console.error("Missing src component");
    return false;
  }

  let failed = false;
  for (const opening of incoming.slice(1)) {
    const { name, eco, moves } = opening;
    if (!(name || eco || moves)) {
      console.error(`Invalid opening: Missing required fields (name, eco, or moves) - ${JSON.stringify(opening)}`);
      failed = true;
      continue;
    }
    try {
      chess.loadPgn(opening.moves);
      opening.fen = chess.fen();
    } catch (e) {
      // FEN failure; this will result in a single "undefined" FEN that needs to be handled in a later step
      console.error(`Error processing opening (skipped): ${JSON.stringify(opening)} - ${e.message}`);
      failed = true;
    }
  }
  return !failed;
};

export { validateStructured, shouldAbort };

/**
 * Loads and validates the opening.json file from disk.
 * @param {object} [opts]
 * @param {ErrorCollector} [opts.collector] - if provided, records failures
 *   structurally and does NOT exit on failure (caller decides via shouldAbort).
 *   If omitted, falls back to the legacy boolean validate() and exits on failure.
 * @returns {Array} Parsed and validated openings array.
 */
const getIncomingOpenings = (opts = {}) => {
  const filePath = path.resolve(process.cwd(), "input/opening.json");
  const text = fs.readFileSync(filePath, "utf-8");
  const json = JSON.parse(text);

  if (opts.collector) {
    validateStructured(json, opts.collector);
    return json;
  }
  // legacy path
  if (!validate(json)) process.exit(-1);
  return json;
};

export { validate, getIncomingOpenings, filterIncoming, allOpenings };
