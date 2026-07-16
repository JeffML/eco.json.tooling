import { ChessPGN } from "@chess-pgn/chess-pgn";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { book } from "../../utils.js";
import leven from "leven";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const chess = new ChessPGN();

const ECO_URL = "https://www.cs.kent.ac.uk/people/staff/djb/pgn-extract/eco.pgn";

console.log(`Fetching eco.pgn from ${ECO_URL}...`);
const response = await fetch(ECO_URL);
if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
const pgn = await response.text();
console.log(`Fetched ${pgn.length.toLocaleString()} bytes.`);

const openings = [{ src: "kent-eco", url: ECO_URL }];

for (const game of pgn.split(/\*|1-0|0-1/)) {
  try {
    chess.loadPgn(game);
  } catch {
    continue;
  }
  const fen = chess.fen();
  const obEntry = book[fen];
  if (!obEntry) {
    process.stdout.write("+");
    continue;
  }

  const h = chess.header();
  const pgnName = [h.Opening, h.Variation].filter(Boolean).join(": ") || "";
  const ecoTag = h.ECO || "";
  const obName = obEntry.name;

  if (pgnName && obName && leven(obName, pgnName) > 3) {
    const moves = game.substring(game.indexOf("1. "));
    openings.push({ src: "kent-eco", name: pgnName, moves, eco: ecoTag, fen });
  }
}

const outDir = path.resolve(__dirname, "output");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "opening.json"), JSON.stringify(openings, null, 2));
console.log(`Wrote ${openings.length - 1} openings to output/opening.json`);
