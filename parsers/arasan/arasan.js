const ecox = /[A-E]\d{2}/;
const namex = /".*"/;

import fs from "fs";
import readline from "readline";

const fileStream = fs.createReadStream("arasan.txt");

const rl = readline.createInterface({
  input: fileStream,
  crlfDelay: Infinity,
});

const opening = [{ src: "arasan", url: "https://github.com/jdart1/arasan-chess/blob/master/book/eco" }];

rl.on("line", (line) => {
  try {
    if (line && line.length) {
      const ecoMatch = line.match(ecox);
      if (!ecoMatch) return;
      const eco = ecoMatch[0];
      const nameMatch = line.match(namex);
      const name = nameMatch ? nameMatch[0].replaceAll('"', "") : "";
      // Moves are everything after the ECO code, minus the quoted name.
      // Works regardless of spacing between ECO and moves (the old
      // split(/\s{5}/) only matched lines with 5+ spaces, dropping
      // single-space lines to empty moves).
      const afterEco = line.slice(ecoMatch.index + eco.length);
      const moves = nameMatch ? afterEco.replace(namex, "").trim() : afterEco.trim();
      if (name) {
        opening.push({ eco, name, moves });
      }
    }
  } catch (e) {
    console.error(line, e);
  }
});

rl.on("close", () => {
  console.log("Finished reading file");
  fs.writeFileSync(
    "opening.json",
    JSON.stringify(
      opening.filter((o) => o.name !== ""),
      null,
      2,
    ),
  );
});
