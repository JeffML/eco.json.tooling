import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CSV_URL = "https://raw.githubusercontent.com/Destaq/chess-graph/master/elo_reading/openings_sheet.csv";

console.log(`Fetching chess-graph CSV from ${CSV_URL}...`);
const response = await fetch(CSV_URL);
if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
const csv = await response.text();
console.log(`Fetched ${csv.length.toLocaleString()} bytes.`);

const lines = csv.split("\n");

let lineCt = 0;
let parseCt = 0;

const regex = /^([ABCDE]\d{2}),("?.*"?),(.*)$/;
const regex2 = /^([ABCDE]\d{2}),[ABCDE]\d{2},(.*)$/;

let lastName;

const pass1 = [];

for (const rawLine of lines) {
  const line = rawLine.trim();
  if (!line) continue;

  let [, eco, name, plies] = line.match(regex) ?? [];
  if (eco) {
    const cleaned = name.replaceAll('"', "").trim();
    if (cleaned) lastName = cleaned;
  } else {
    [, eco, plies] = line.match(regex2) ?? [];
  }

  lineCt++;
  if (!eco) console.log("!", line);
  else if (!lastName) {
    /* skip — no name set yet */
  } else {
    pass1.push({ eco, name: lastName, plies });
    parseCt++;
  }
}

console.log({ linesRead: lineCt, linesParsed: parseCt });

pass2(pass1);

function pass2(pass1) {
  // Group by moves — same position may have multiple names across rows
  const byMoves = new Map();

  for (const { eco, name, plies } of pass1) {
    if (!name) continue; // skip continuation rows with no name set
    let moves = "";
    let moveNum = 1;

    for (const ply of plies.split(" ")) {
      if (moveNum % 2 === 1) moves += " " + Math.ceil(moveNum / 2) + ".";
      moves += " " + ply;
      moveNum++;
    }
    moves = moves.substring(1);

    // Clean name: strip trailing ECO codes like " A05" or "; A05"
    let clean = name.replace(/[\s;]*[ABCDE]\d{2}[a-z]?\s*$/, "").trim();

    if (byMoves.has(moves)) {
      const existing = byMoves.get(moves);
      if (clean !== existing.name) {
        existing.name += "; " + clean;
      }
    } else {
      byMoves.set(moves, { eco, name: clean, moves });
    }
  }

  const openings = [
    {
      src: "chessGraph",
      url: CSV_URL,
    },
  ];

  for (const [, entry] of byMoves) {
    openings.push(entry);
  }

  const outDir = path.resolve(__dirname, "output");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "opening.json"), JSON.stringify(openings, null, 2));
  console.log(`Wrote ${openings.length - 1} openings to output/opening.json`);
}
