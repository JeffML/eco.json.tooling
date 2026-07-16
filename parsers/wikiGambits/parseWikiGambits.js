import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ChessPGN } from "@chess-pgn/chess-pgn";
import { getLatestEcoJson, book } from "../../utils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SEP = "&#8211;";
const regex = new RegExp(/li>([\w\s]+)&#8211;\s([A-E]\d{2})\s&#8211;\s(.*\s?)<sup/g);

function parseGambitPage() {
  // downloaded from https://en.wikipedia.org/wiki/List_of_chess_gambits
  const html = fs.readFileSync(path.resolve(__dirname, "input/List of chess gambits - Wikipedia.html"), "utf8");

  const results = [{ src: "eco_wikip.g" }];

  for (;;) {
    let match = regex.exec(html);
    if (match) {
      const [name, eco, moves] = match.slice(1, 4);
      const fixedMoves = moves
        .replace(/0-0|0-O|o-o/gi, "O-O")
        .replace(/-0\b/g, "-O")
        .replace(/(\d+)\.(\w)/g, "$1. $2"); // 1.e4 → 1. e4
      results.push({ src: "eco_wikip.g", name: name.trim(), eco, moves: fixedMoves });
    } else break;
  }

  return results;
}

// ── Name enrichment: prepend parent opening context ─────────────────────────

function findParentOpening(moves, openings) {
  const game = new ChessPGN();
  try {
    game.loadPgn(moves);
  } catch {
    return { name: null, eco: null };
  }

  const history = game.history({ verbose: true });
  const fen = game.fen();
  const exact = openings[fen];
  if (exact && exact.name && exact.eco && exact.eco !== "??") {
    return { name: exact.name, eco: exact.eco };
  }

  for (let i = history.length - 1; i >= 0; i--) {
    game.undo();
    const parentFen = game.fen();
    const entry = openings[parentFen];
    if (entry && entry.name && entry.eco && entry.eco !== "??") {
      return { name: entry.name, eco: entry.eco };
    }
  }

  return { name: null, eco: null };
}

function hasContext(gambitName, parentName) {
  if (!parentName) return false;
  const norm = (s) =>
    s
      .toLowerCase()
      .replace(/defence/g, "defense")
      .replace(/[·—:,]/g, " ");
  const pNorm = norm(parentName);
  const gNorm = norm(gambitName);
  if (pNorm.includes(gNorm)) return true;
  if (gNorm.includes(pNorm)) return true;
  const pWords = new Set(pNorm.split(/\s+/).filter((w) => w.length > 2));
  const gWords = gNorm.split(/\s+/).filter((w) => w.length > 2);
  const overlap = gWords.filter((w) => pWords.has(w)).length;
  return (gWords.length > 0 && overlap / gWords.length > 0.5) || overlap === gWords.length;
}

function qualifyName(gambitName, parentName) {
  const pNorm = parentName.toLowerCase().replace(/defence/g, "defense");
  const gNorm = gambitName.toLowerCase().replace(/defence/g, "defense");
  const pWords = pNorm.split(/\s+/).filter((w) => w.length > 0);
  const gWords = gNorm.split(/\s+/).filter((w) => w.length > 0);

  let commonPrefixLen = 0;
  while (
    commonPrefixLen < pWords.length &&
    commonPrefixLen < gWords.length &&
    pWords[commonPrefixLen] === gWords[commonPrefixLen]
  ) {
    commonPrefixLen++;
  }

  let subName = gambitName;
  if (commonPrefixLen >= 2 && gWords.length - commonPrefixLen >= 2) {
    for (let i = 0; i < commonPrefixLen; i++) subName = subName.replace(/^\S+\s*/, "");
    subName = subName.replace(/^Defen[cs]e,?\s*/i, "");
    if (!subName.trim()) subName = gambitName;
  }

  const sep = parentName.includes(":") ? ", " : ": ";
  return parentName + sep + subName.trim();
}

function enrichGambits(gambits, openings) {
  let enriched = 0, unchanged = 0, noParent = 0;
  const output = [{ src: "eco_wikip.g" }];

  for (const g of gambits) {
    if (!g.moves) {
      output.push(g);
      continue;
    }

    const parent = findParentOpening(g.moves, openings);

    if (!parent.name) {
      noParent++;
      output.push(g);
      continue;
    }

    if (hasContext(g.name, parent.name)) {
      unchanged++;
      output.push({ ...g, name: parent.name, eco: parent.eco || g.eco });
      continue;
    }

    enriched++;
    output.push({ ...g, name: qualifyName(g.name, parent.name), eco: parent.eco || g.eco });
  }

  console.log(`  Enriched (parent prepended): ${enriched}`);
  console.log(`  Used parent name (already had context): ${unchanged}`);
  console.log(`  No parent found: ${noParent}`);
  return output;
}

// ── Main ─────────────────────────────────────────────────────────────────────

const results = parseGambitPage();
const gambits = results.filter((r) => r.moves);
console.log(`Parsed ${gambits.length} gambits from Wikipedia.`);

console.log("Loading eco.json for parent lookup...");
const existing = await getLatestEcoJson();
const openings = book;
console.log(`Loaded ${Object.keys(openings).length} openings.`);

const enriched = enrichGambits(gambits, openings);

const outDir = path.resolve(__dirname, "output");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "opening.json"), JSON.stringify(enriched, null, 2));
console.log(`Wrote ${enriched.length - 1} enriched openings to output/opening.json`);
