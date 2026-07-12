import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

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

const results = parseGambitPage();

const outDir = path.resolve(__dirname, "output");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "opening.json"), JSON.stringify(results, null, 2));
