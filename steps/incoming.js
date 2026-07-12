import { ChessPGN } from "@chess-pgn/chess-pgn";
import fs from "fs";
import path from "path";
import leven from "leven";
import { book } from "../utils.js";
import { validate as validateStructured, shouldAbort } from "./validate.js";

let allOpenings = book;

const isRedundant = (existingName, name) => {
  if (leven(existingName, name) < 5) return true;
  // One is a prefix of the other (e.g. "King's Indian Attack" ⊂ "King's Indian Attack, with Bf5")
  if (existingName.length > name.length && existingName.startsWith(name)) return true;
  if (name.length > existingName.length && name.startsWith(existingName)) return true;
  return false;
};

/**
 * Synonym map: canonical eco_tsv name → [variant names from other sources].
 * Used to normalize names before comparison so "Reti: KIA" matches
 * "King's Indian Attack", etc.
 */
const SYNONYMS = {
  "King's Indian Attack": ["Reti: KIA", "KIA", "King's Indian Attack (KIA)"],
  // Add more as discovered
};

/** Normalize an opening name to its canonical form for comparison. */
const normalizeName = (() => {
  const toCanonical = new Map();
  for (const [canon, variants] of Object.entries(SYNONYMS)) {
    toCanonical.set(canon.toLowerCase(), canon);
    for (const v of variants) toCanonical.set(v.toLowerCase(), canon);
  }
  return (name) => toCanonical.get(name?.toLowerCase()) ?? name;
})();

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
 * Look up an opening by its move sequence, using FEN-based matching with
 * position-only fallback. Handles transpositions (different move orders
 * reaching the same position).
 * @returns {object|undefined} The book or added entry, or undefined.
 */
const lookupByMoves = (() => {
  const chess = new ChessPGN();
  return (movesStr, book, added) => {
    try {
      chess.loadPgn(movesStr);
      const fen = chess.fen();
      // Exact FEN match first
      if (book[fen]) return book[fen];
      for (const [af, a] of Object.entries(added)) {
        if (af === fen) return a;
      }
      // Position-only fallback
      const posOnly = fen.split(" ")[0];
      const key = Object.keys(book).find((k) => k.split(" ")[0] === posOnly);
      if (key) return book[key];
      for (const [af, a] of Object.entries(added)) {
        if (af.split(" ")[0] === posOnly) return a;
      }
    } catch {
      // If loadPgn fails (shouldn't happen for validated entries), fall
      // through to undefined.
    }
    return undefined;
  };
})();

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
      const redundant = isRedundant(normalizeName(existingEntry.name), normalizeName(name));

      if (existingEntry.src === src) {
        // Same source already has this FEN. For eco_tsv (the authoritative
        // source), allow name changes when lichess renames an opening.
        // For all other sources, names are never modified — aliases handle
        // varied names.
        if (src === "eco_tsv" && !redundant) {
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
        // eco_tsv supersedes all other sources. Never mutate the book
        // in-place — clone first so diffReport.js can detect changes.
        const aliases = { ...(existingEntry.aliases ?? {}) };
        aliases[existingEntry.src] = existingEntry.name;
        aliases[src] = undefined;
        modified[fen] = { ...existingEntry, src, name, aliases };
      } else if (!redundant && (!existingEntry.aliases || !existingEntry.aliases[src])) {
        // Clone aliases — never mutate the existing book entry in-place.
        // The book object is shared with diffReport.js, which needs the
        // original state to detect what actually changed.
        const aliases = { ...(existingEntry.aliases ?? {}) };
        aliases[src] = name;
        modified[fen] = { ...existingEntry, aliases };
      } else {
        excluded++;
      }
    } else {
      // Skip anonymous continuations: if the parent position (one move back)
      // has the same name, this is just a sub-variation with no new naming
      // knowledge. The fromTo graph will interpolate gaps as needed.
      //
      // Uses FEN-based parent lookup (not moves-based) to handle
      // transpositions — e.g. 1.Nf3 d5 vs 1.c4 e6 reaching the same position.
      const movesArr = moves.split(" ");
      if (movesArr.length > 2) {
        const parentMoves = movesArr.slice(0, -2).join(" ");
        const parentEntry = lookupByMoves(parentMoves, allOpenings, added);
        let checkEntry = parentEntry;
        // scid/wiki_b continuation names append move notation to the root
        // name, e.g. "..., 5...O-O 6.b3 c5" (black) or "..., 5.Qa4+ Nbd7"
        // (white). A digit-then-dot pattern in the name signals this.
        const isContinuationName = (n) => /\d+\./.test(n);
        if (checkEntry?.name && isContinuationName(checkEntry.name)) {
          const undoChess = new ChessPGN();
          undoChess.loadPgn(moves);
          while (checkEntry?.name && isContinuationName(checkEntry.name)) {
            const prev = undoChess.undo();
            if (!prev) break;
            const prevFen = undoChess.fen();
            const prevPos = prevFen.split(" ")[0];
            let ancestor = book[prevFen];
            if (!ancestor) {
              const key = Object.keys(book).find((k) => k.split(" ")[0] === prevPos);
              if (key) ancestor = book[key];
            }
            if (!ancestor) {
              for (const [af, a] of Object.entries(added)) {
                if (af.split(" ")[0] === prevPos) { ancestor = a; break; }
              }
            }
            if (ancestor) checkEntry = ancestor;
            else break;
          }
        }
        // Exact match, prefix/suffix variant, or synonym (e.g. "Reti: KIA" ≈ "King's Indian Attack")
        const normCheck = normalizeName(checkEntry?.name);
        const normIncoming = normalizeName(name);
        if (normCheck && normIncoming && (normCheck === normIncoming || isRedundant(normCheck, normIncoming) || isRedundant(normIncoming, normCheck))) {
          excluded++;
          continue;
        }
      }
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
