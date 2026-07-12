import { readJsonFile } from "../../utils.js";
import { ChessPGN } from "@chess-pgn/chess-pgn";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const chess = new ChessPGN();

// readJsonFile resolves from the project root, so pass a relative path
const json = readJsonFile("parsers/chessTempo/input/chessTempo.json");

let parsed = [];
const plies = [];

// recursive
const parseEntries = (entries) => {
  for (const [key, value] of entries) {
    if (key === "version") continue;
    else if (key === "length") continue;
    else if (key === "opening") {
      // chessTempo uses range codes like "B90-99" — strip to "B90"
      const eco = value.eco.length > 3 ? value.eco.slice(0, 3) : value.eco;
      parsed.push([value.name, [...plies], eco]);
    } else {
      plies.push(key);
      parseEntries(Object.entries(value));
    }
  }

  plies.pop();
};

const formatEntries = (parsed) => {
  const formatted = parsed.map(([opening, moveList, eco]) => {
    // chessTempo names use ":" as separator with trailing ":" or "::"
    // e.g. "Alekhine Defense:Balogh Variation::" → "Alekhine Defense, Balogh Variation"
    const name = opening.replace(/:+$/, "").replace(/:/g, ", ");
    try {
      for (let move of moveList) {
        chess.move(move);
      }
    } catch (e) {
      console.error(e);
      process.exit(-1);
    }
    const data = {
      src: "ct",
      name,
      moves: chess.pgn().split(/\n/).at(-1).slice(0, -2),
      eco,
    };
    chess.reset();
    return data;
  });

  return [{ src: "ct" }, ...formatted];
};

parseEntries(Object.entries(json.response));

const formatted = formatEntries(parsed);

fs.writeFileSync(path.resolve(__dirname, "output/opening.json"), JSON.stringify(formatted, null, 2));
