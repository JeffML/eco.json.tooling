import fs from "fs";
import path from "path";
import { ChessPGN } from "@chess-pgn/chess-pgn";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

// Corrections from tracked data file (survives re-crawls)
const corrections = JSON.parse(fs.readFileSync(new URL("./corrections.json", import.meta.url), "utf-8"));
const correctedUrls = corrections.urlCorrections;

const chess = new ChessPGN();

// Crawlee writes output to ./storage/datasets/default/ relative to this dir.
// __dirname ensures the path works regardless of where the script is invoked.
const __dirname = new URL(".", import.meta.url).pathname;
const storageDir = path.join(__dirname, "storage", "datasets", "default");

// ── Pre-flight check ────────────────────────────────────────────────────────

if (!fs.existsSync(storageDir)) {
  console.error(`Storage directory not found: ${storageDir}`);
  console.error("Run the crawl first: cd parsers/wikiChessOpeningTheoryCrawler && npm start");
  process.exit(1);
}

const files = fs.readdirSync(storageDir);
if (files.length === 0) {
  console.error(`Storage directory is empty: ${storageDir}`);
  console.error("Run the crawl first: cd parsers/wikiChessOpeningTheoryCrawler && npm start");
  process.exit(1);
}
console.log(`Found ${files.length} dataset files in ${storageDir}`);

// ── URL → moves parser ──────────────────────────────────────────────────────

const moveList = (url) => {
  url = correctedUrls[url] || url;
  const idx = url.indexOf("1._");
  if (idx === -1) return null;
  const raw = url.substring(idx);
  const pass1 = raw.replaceAll(/(\d{1,2}\.)_([a-zA-Z0-9\-]*)\/?/g, "$1 $2 ");
  const pass2 = pass1.replaceAll(/(\d{1,2}\.{3})([a-zA-Z0-9\-]*)\/?/g, " $2 ");
  const pass3 = pass2
    .replaceAll("%2B", "")
    .replaceAll("%3F", "")
    .replaceAll("!", "")
    .replaceAll("/", " ")
    .replaceAll(/([\s-])0/g, "$1O");
  return pass3.trim();
};

// ── Process dataset files ────────────────────────────────────────────────────

const data = {};

files.forEach((file) => {
  const filePath = path.join(storageDir, file);
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    console.error(`Skipping unreadable file: ${file}`);
    return;
  }
  const url = raw.url;
  const name = raw.text;
  if (!url || !name) return;

  const moves = moveList(url);
  if (!moves) return;

  data[url] = { name, moves };
});

console.log(`Extracted ${Object.keys(data).length} opening(s) from crawl data.`);

// Write output
fs.writeFileSync("openingMinusEco.json", JSON.stringify(data, null, 2));
console.log("Wrote openingMinusEco.json");
