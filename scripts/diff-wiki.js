#!/usr/bin/env node

/**
 * diff-wiki.js — Parses changed wiki pages and reports opening variations
 * not yet in eco.json.
 *
 * Usage:
 *   node scripts/diff-wiki.js                    Use cached list from last --detail run
 *   node scripts/diff-wiki.js --fetch             Fetch fresh list from wiki
 *   node scripts/diff-wiki.js - < urls.txt        Read URLs from stdin
 */

import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { ChessPGN } from "@chess-pgn/chess-pgn";
import { book } from "../utils.js";

const require = createRequire(import.meta.url);
const __dirname = new URL(".", import.meta.url).pathname;
const ROOT = path.resolve(__dirname, "..");

// ── URL corrections (from shared corrections.json) ───────────────────────────

const corrections = JSON.parse(
  fs.readFileSync(path.join(ROOT, "parsers", "wikiChessOpeningTheoryCrawler", "corrections.json"), "utf-8"),
);
import { findEcoCode } from "../parsers/wikiChessOpeningTheoryCrawler/assignEcoCodes.js";

const correctedUrls = corrections.urlCorrections;

// ── URL → Move list (from genPartialOpeningData.js) ──────────────────────────

const moveList = (url) => {
  // Normalize: encodeURI produces %20, but parser expects _
  url = decodeURIComponent(url).replace(/ /g, "_");
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

// ── FEN derivation ───────────────────────────────────────────────────────────

const fenFromMoves = (moves) => {
  const game = new ChessPGN();
  try {
    game.loadPgn(moves);
    return game.fen();
  } catch {
    return null;
  }
};

// ── Write input/opening.json for pipeline ─────────────────────────────────────

const writeInputFile = (newOpenings, src) => {
  const data = [
    {
      src,
      url: "https://en.wikibooks.org/wiki/Chess_Opening_Theory",
    },
  ];

  for (const o of newOpenings) {
    data.push({
      name: `Wiki opening (edit me)`,
      eco: o.eco || "??",
      moves: o.moves,
    });
  }

  const filePath = path.join(ROOT, "input", "opening.json");
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
  console.log(`Wrote ${newOpenings.length} opening(s) to input/opening.json`);
  console.log("Edit the name and eco fields before running generatePullRequest.js");
};

// ── Get URLs ─────────────────────────────────────────────────────────────────

async function getUrls(args) {
  if (args.includes("-")) {
    // Read from stdin
    const stdin = fs.readFileSync(0, "utf-8");
    return [...stdin.matchAll(/https:\/\/en\.wikibooks\.org\/wiki\/[^\s]+/g)].map((m) => m[0]);
  }

  // Fetch fresh from wiki API
  const { default: fetch } = await import("node-fetch");

  console.log("Fetching recent changes from Wikibooks...");
  const params = new URLSearchParams({
    action: "query",
    list: "recentchanges",
    rcnamespace: "0",
    rclimit: "500",
    rcprop: "title",
    rctype: "edit",
    format: "json",
  });

  const res = await fetch("https://en.wikibooks.org/w/api.php?" + params.toString());
  const data = await res.json();
  const changes = data?.query?.recentchanges || [];

  const seen = new Set();
  const urls = [];
  for (const r of changes) {
    if (!r.title.startsWith("Chess Opening Theory")) continue;
    // Skip the root index page (no moves)
    if (r.title === "Chess Opening Theory") continue;
    if (seen.has(r.title)) continue;
    seen.add(r.title);
    urls.push("https://en.wikibooks.org/wiki/" + encodeURI(r.title));
  }

  return urls;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  const urls = await getUrls(args);
  console.log(`Found ${urls.length} unique wiki pages. Parsing for new openings...\n`);

  const newOpenings = [];
  let parseFailures = 0;

  for (const url of urls) {
    const moves = moveList(url);
    if (!moves) {
      parseFailures++;
      continue;
    }

    const fen = fenFromMoves(moves);
    if (!fen) {
      parseFailures++;
      continue;
    }

    // Check if this FEN is already in eco.json
    if (book[fen]) continue;

    // Also check position-only (ignore turn/castling/en passant)
    const posOnly = fen.split(" ")[0];
    const existsByPos = Object.keys(book).some((k) => k.split(" ")[0] === posOnly);
    if (existsByPos) continue;

    newOpenings.push({ moves, fen, url });
  }

  const toInput = args.includes("--to-input");
  const src = "wiki_crawler";

  if (toInput) {
    // Look up ECO codes by truncating moves to find parent in eco.json
    console.log("Looking up ECO codes...");
    for (const o of newOpenings) {
      o.eco = findEcoCode(o.moves, book).eco;
      console.log(`  ${o.eco}  ${o.moves}`);
    }
  }

  console.log(
    `\n${newOpenings.length} new opening variations found (${parseFailures} parse failures, ${urls.length - newOpenings.length - parseFailures} already in eco.json)`,
  );

  if (newOpenings.length === 0) {
    console.log("\nNothing new to report.");
    return;
  }

  if (toInput) {
    writeInputFile(newOpenings, src);
  } else {
    console.log("");
    for (const o of newOpenings) {
      console.log(`  ${o.moves}`);
      console.log(`  fen: ${o.fen}`);
      console.log(`  ${o.url}\n`);
    }
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
