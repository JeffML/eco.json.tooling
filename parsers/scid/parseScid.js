import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ChessPGN } from "@chess-pgn/chess-pgn";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const chess = new ChessPGN();

const SCID_URL = "https://sourceforge.net/p/scid/code/ci/v4.3/tree/scid.eco?format=raw";

console.log(`Fetching scid.eco from ${SCID_URL}...`);
const res = await fetch(SCID_URL);
if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
const text = await res.text();
console.log(`Fetched ${text.length.toLocaleString()} bytes.`);

// Format: ECOcode "Name" moves *  OR  ECOcode "Name" (moves on next line)
// OR  moves * (continuation, full 1. sequence)  OR  N. ... (tail, skip)
const headerRe = /^([A-E]\d{2}[a-z]?\d?)\s+"([^"]+)"\s+(.+?)\s*\*\s*$/;
const headerNoMovesRe = /^([A-E]\d{2}[a-z]?\d?)\s+"([^"]+)"\s*\*?\s*$/;
const contRe = /^(.+?)\s*\*\s*$/;
const partialRe = /^(1\..+)$/; // full move sequence without trailing *
const openings = [{ src: "scid", url: SCID_URL }];

let parsed = 0;
let skipped = 0;
let tailsProcessed = 0;
let currentEco = "";
let currentName = "";
let currentFullMoves = "";
let pendingMoves = "";
let expectingTail = false; // true after headerNoMovesRe, cleared on tail splice

for (const line of text.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;

  const clean = (m) =>
    m
      .replace(/0-0-0/gi, "O-O-O")
      .replace(/0-0/gi, "O-O")
      .replace(/(\d+)\.(\w)/g, "$1. $2")
      .trim();

  // Try header line first (ECO + name + moves on same line)
  let m = trimmed.match(headerRe);
  if (m) {
    currentEco = m[1];
    currentName = m[2];
    currentFullMoves = clean(m[3]);
    openings.push({ eco: currentEco, name: currentName, moves: currentFullMoves });
    parsed++;
    expectingTail = false;
    continue;
  }

  // Try header without moves (moves on next line)
  m = trimmed.match(headerNoMovesRe);
  if (m) {
    currentEco = m[1];
    currentName = m[2];
    currentFullMoves = "";
    expectingTail = true;
    continue;
  }

  // Try partial moves (no trailing *) — stash for tail completion
  m = trimmed.match(partialRe);
  if (m && expectingTail) {
    pendingMoves = clean(m[1]);
    continue;
  }

  // Try continuation line (with trailing *)
  m = trimmed.match(contRe);
  if (m && currentEco) {
    const rawMoves = m[1];
    // Full sequence from start — complete (with *) or partial (awaiting tail)
    if (/^1\./.test(rawMoves)) {
      const cleaned = clean(rawMoves);
      if (!trimmed.endsWith("*")) {
        pendingMoves = cleaned;
        continue;
      }
      currentFullMoves = cleaned;
      openings.push({ eco: currentEco, name: currentName, moves: currentFullMoves });
      parsed++;
      continue;
    }
    // Tail continuation — splice into pendingMoves
    if (pendingMoves) {
      try {
        chess.loadPgn(pendingMoves);
        const tailNum = parseInt(rawMoves);
        const undos = chess.history().length - (tailNum - 1) * 2;
        for (let u = 0; u < undos; u++) chess.undo();
        const tailMoves = rawMoves.replace(/^\d+\.\s*/, "").split(/\s+/);
        for (const mv of tailMoves) {
          if (/^\d+\.?$/.test(mv)) continue;
          chess.move(mv, { sloppy: true });
        }
        currentFullMoves = chess
          .pgn()
          .split("\n")
          .at(-1)
          .replace(/\s*\*?\s*$/, "");
        const tailName = currentName + ", " + rawMoves.replace(/\s*\*?\s*$/, "");
        openings.push({ eco: currentEco, name: tailName, moves: currentFullMoves });
        tailsProcessed++;
        pendingMoves = "";
        expectingTail = false;
        continue;
      } catch {
        /* fall through to skip */
      }
    }
  }

  skipped++;
}

const outDir = path.resolve(__dirname, "output");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "opening.json"), JSON.stringify(openings, null, 2));
console.log(`Parsed ${parsed} openings, ${tailsProcessed} tails, skipped ${skipped} lines.`);
console.log(`Wrote to output/opening.json`);
