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

// ── URL corrections (from genPartialOpeningData.js) ──────────────────────────

const correctedUrls = {
    "https://en.wikibooks.org/wiki/Chess_Opening_Theory/1._e4/1...e5/2._Nf3/2...Nc6/3._Bb5/3...a6/4._Ba4/4...Nf6/5._d3/6._Bb3":
        "https://en.wikibooks.org/wiki/Chess_Opening_Theory/1._e4/1...e5/2._Nf3/2...Nc6/3._Bb5/3...a6/4._Ba4/4...Nf6/5._d3/5...b5/6._Bb3",
    "https://en.wikibooks.org/wiki/Chess_Opening_Theory/1._e4/1...e6/2._d4/2...d5/3._Nd2/3...Nf6/4.e5/4....Nfd7/5.Bd3":
        "https://en.wikibooks.org/wiki/Chess_Opening_Theory/1._e4/1...e6/2._d4/2...d5/3._Nd2/3...Nf6/4._e5/4...Nfd7/5._Bd3",
    "https://en.wikibooks.org/wiki/Chess_Opening_Theory/1._e4/1...e6/2._d4/2...d5/3._Nd2/3...Nf6/4.e5/4....Nfd7/5.Bd3/5....c5":
        "https://en.wikibooks.org/wiki/Chess_Opening_Theory/1._e4/1...e6/2._d4/2...d5/3._Nd2/3...Nf6/4._e5/4...Nfd7/5._Bd3/5...c5",
    "https://en.wikibooks.org/wiki/Chess_Opening_Theory/1._e4/1...Nc6/2._d4/2...d5/3._Nc3/3..._dxe4":
        "https://en.wikibooks.org/wiki/Chess_Opening_Theory/1._e4/1...Nc6/2._d4/2...d5/3._Nc3/3...dxe4",
    "https://en.wikibooks.org/wiki/Chess_Opening_Theory/1._e4/1...Nc6/2._d4/2...d5/3._Nc3/3..._a6":
        "https://en.wikibooks.org/wiki/Chess_Opening_Theory/1._e4/1...Nc6/2._d4/2...d5/3._Nc3/3...a6",
    "https://en.wikibooks.org/wiki/Chess_Opening_Theory/1._d4/1...Nf6/2._Bf4/2...e6/3._e3/3...d5/4._Nd2/4...c5/5._c3/5...Nc6/6._Nf3":
        "https://en.wikibooks.org/wiki/Chess_Opening_Theory/1._d4/1...Nf6/2._Bf4/2...e6/3._e3/3...d5/4._Nd2/4...c5/5._c3/5...Nc6/6._Ngf3",
    "https://en.wikibooks.org/wiki/Chess_Opening_Theory/1._e4/1...c6/2._d4/2...d5/3._e5/3...Bf5/4._Nf3/4...e6/5._Be2/5...Nd7/6._O-O/6...Ne7/7._Nh4/7...Bg6/8._Nd2/8...c5/9_.c3":
        "https://en.wikibooks.org/wiki/Chess_Opening_Theory/1._d4/1...Nf6/2._Bf4/2...e6/3._e3/3...d5/4._Nd2/4...c5/5._c3/5...Nc6/6._Ngf3",
    "https://en.wikibooks.org/wiki/Chess_Opening_Theory/1._e4/1...e6/2._d4/2...d5/3._Nd2/3...Nf6/4.e5/4....Nfd7/5.Bd3/5....c5/6.c3":
        "https://en.wikibooks.org/wiki/Chess_Opening_Theory/1._e4/1...e6/2._d4/2...d5/3._Nd2/3...Nf6/4._e5/4...Nfd7/5._Bd3/5...c5/6._c3",
};

// ── URL → Move list (from genPartialOpeningData.js) ──────────────────────────

const moveList = (url) => {
    // Normalize: encodeURI produces %20, but parser expects _
    url = decodeURIComponent(url).replace(/ /g, "_");
    url = correctedUrls[url] || url;
    const idx = url.indexOf("1._");
    if (idx === -1) return null;
    const raw = url.substring(idx);
    const pass1 = raw.replaceAll(/(\d{1,2}\.)_([a-zA-Z0-9\-]*)\/?/g, "$1 $2 ");
    const pass2 = pass1.replaceAll(
        /(\d{1,2}\.{3})([a-zA-Z0-9\-]*)\/?/g,
        " $2 "
    );
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

// ── Get URLs ─────────────────────────────────────────────────────────────────

async function getUrls(args) {
    if (args.includes("-")) {
        // Read from stdin
        const stdin = fs.readFileSync(0, "utf-8");
        return [...stdin.matchAll(/https:\/\/en\.wikibooks\.org\/wiki\/[^\s]+/g)]
            .map((m) => m[0]);
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

    const res = await fetch(
        "https://en.wikibooks.org/w/api.php?" + params.toString()
    );
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
        urls.push(
            "https://en.wikibooks.org/wiki/" + encodeURI(r.title)
        );
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
        const existsByPos = Object.keys(book).some(
            (k) => k.split(" ")[0] === posOnly
        );
        if (existsByPos) continue;

        newOpenings.push({ moves, fen, url });
    }

    console.log(
        `${newOpenings.length} new opening variations found (${parseFailures} parse failures, ${urls.length - newOpenings.length - parseFailures} already in eco.json)\n`
    );

    if (newOpenings.length === 0) {
        console.log("Nothing new to report.");
    } else {
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
