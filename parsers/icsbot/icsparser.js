import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ecox = /^[A-E]\d{2}/;

const ECO_URL = "https://raw.githubusercontent.com/seberg/icsbot/master/misc/eco.txt";

console.log(`Fetching icsbot eco.txt from ${ECO_URL}...`);
const res = await fetch(ECO_URL);
if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
const text = await res.text();
console.log(`Fetched ${text.length.toLocaleString()} bytes.`);

const opening = [{ src: "icsbot", url: "https://github.com/seberg/icsbot/blob/master/misc/eco.txt" }];

for (const line of text.split("\n")) {
  try {
    if (line && line.trim().length) {
      const [eco, name, moves] = line.split(/\t+/);
      if (!eco.match(ecox)) continue; // skip malformed lines
      const ecoRepeat = name.match(ecox);
      if (!ecoRepeat) opening.push({ eco, name, moves });
    }
  } catch (e) {
    console.error(line.substring(0, 60), e.message);
  }
}

const outDir = path.resolve(__dirname, "output");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  path.join(outDir, "opening.json"),
  JSON.stringify(
    opening.filter((o) => o.name !== ""),
    null,
    2,
  ),
);
console.log(`Wrote ${opening.length - 1} openings to output/opening.json`);
