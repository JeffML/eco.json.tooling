import { ChessPGN } from "@chess-pgn/chess-pgn";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CT_URL = "https://chesstempo.com/json/openings-list.vers1.js";

console.log(`Fetching chessTempo openings from ${CT_URL}...`);
const res = await fetch(CT_URL);
if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
const data = await res.json();
console.log(`Fetched, version ${data.version}`);

const chess = new ChessPGN();

const parsed = [];
const plies = [];

function parseEntries(entries) {
  for (const [key, value] of entries) {
    if (key === "version") continue;
    if (key === "length") continue;
    if (key === "error") continue;

    if (key === "opening") {
      // chessTempo uses range codes like "B90-99" — strip to "B90"
      const eco = value.eco.length > 3 ? value.eco.slice(0, 3) : value.eco;
      parsed.push([value.name, [...plies], eco]);
    } else {
      plies.push(key);
      if (typeof value === "object" && !Array.isArray(value)) {
        parseEntries(Object.entries(value));
      }
    }
  }
  plies.pop();
}

parseEntries(Object.entries(data.response));

console.log(`Parsed ${parsed.length} entries from tree.`);

const formatted = parsed
  .map(([name, moveList, eco]) => {
    // "Alekhine Defense:Balogh Variation::" → "Alekhine Defense, Balogh Variation"
    const cleanName = name.replace(/:+$/, "").replace(/:/g, ", ");

    for (const move of moveList) {
      try {
        chess.move(move, { sloppy: true });
      } catch (e) {
        console.error(`Bad move ${move} in "${cleanName}": ${e.message}`);
        chess.reset();
        return null;
      }
    }

    const pgn = chess.pgn();
    const moves = pgn
      .split(/\n/)
      .at(-1)
      .replace(/\s*\*?\s*$/, "");
    chess.reset();

    return { src: "ct", name: cleanName, moves, eco };
  })
  .filter(Boolean);

const output = [{ src: "ct", url: CT_URL }, ...formatted];

const outDir = path.resolve(__dirname, "output");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "opening.json"), JSON.stringify(output, null, 2));
console.log(`Wrote ${formatted.length} openings to output/opening.json`);
