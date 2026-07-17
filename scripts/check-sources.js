#!/usr/bin/env node

/**
 * check-sources.js — Reports which parser sources have been modified since
 * they were last parsed into eco.json.
 *
 * Seeds last-parsed dates from known eco.json merge history. For local files,
 * compares against the source file's last git commit date. For remote sources
 * (lichess), compares against the HTTP Last-Modified header.
 *
 * Usage:
 *   node scripts/check-sources.js                Check all sources
 *   node scripts/check-sources.js --update-all    Update cache after processing
 *   node scripts/check-sources.js --update arasan  Update a single parser
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const __dirname = new URL(".", import.meta.url).pathname;
const ROOT = path.resolve(__dirname, "..");
const CACHE_FILE = path.join(ROOT, "parsers", ".source-cache.json");

// ── Known last-parsed dates (seeded from eco.json merge history) ─────────────

const SEED_DATES = {
  wikiGambits: "2025-05-31", // tooling git: parsers/wikiGambits/output/opening.json committed
  lichess: "2025-06-08", // eco.json commit: "latest eco_tsv"
  arasan: "2025-06-15", // tooling git: parsers/arasan/added.json committed
  chessGraph: "2025-06-15", // eco.json commit: "chessGraph"
  "kent-eco": "2025-06-15", // eco.json commit: "kent-eco eco.pgn"
  icsbot: "2025-06-16", // eco.json commit: "icsbot data"
  wikiCrawler: "2025-08-04", // tooling git: parsers/wikiChessOpeningTheoryCrawler/aliases.txt committed
  scid: "2025-06-15", // eco.json commit: scid eco data
};

// ── Source registry ──────────────────────────────────────────────────────────

const SOURCES = [
  {
    name: "arasan",
    method: "file",
    inputFiles: ["parsers/arasan/arasan.txt"],
  },
  {
    name: "icsbot",
    method: "remote",
    urls: ["https://raw.githubusercontent.com/seberg/icsbot/master/misc/eco.txt"],
  },
  {
    name: "chessGraph",
    method: "remote",
    urls: ["https://raw.githubusercontent.com/Destaq/chess-graph/master/elo_reading/openings_sheet.csv"],
  },
  {
    name: "chessTempo",
    method: "remote",
    urls: ["https://chesstempo.com/json/openings-list.vers1.js"],
  },
  {
    name: "kent-eco",
    method: "remote",
    urls: ["https://www.cs.kent.ac.uk/people/staff/djb/pgn-extract/eco.pgn"],
  },
  {
    name: "wikiGambits",
    method: "file",
    inputFiles: ["parsers/wikiGambits/input/List of chess gambits - Wikipedia.html"],
  },
  {
    name: "wikiCrawler",
    method: "mediawiki",
    apiUrl:
      "https://en.wikibooks.org/w/api.php?action=query&titles=Chess_Opening_Theory&prop=revisions&rvlimit=1&format=json",
  },
  {
    name: "scid",
    method: "remote",
    urls: ["https://sourceforge.net/p/scid/code/ci/v4.3/tree/scid.eco?format=raw"],
  },
  {
    name: "lichess",
    method: "remote",
    urls: [
      "https://raw.githubusercontent.com/lichess-org/chess-openings/master/a.tsv",
      "https://raw.githubusercontent.com/lichess-org/chess-openings/master/b.tsv",
      "https://raw.githubusercontent.com/lichess-org/chess-openings/master/c.tsv",
      "https://raw.githubusercontent.com/lichess-org/chess-openings/master/d.tsv",
      "https://raw.githubusercontent.com/lichess-org/chess-openings/master/e.tsv",
    ],
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function getGitDate(filePath) {
  try {
    const ts = execSync(`git log -1 --format=%ct -- "${filePath}"`, { cwd: ROOT, encoding: "utf-8" }).trim();
    return ts ? new Date(Number(ts) * 1000).toISOString().slice(0, 10) : null;
  } catch {
    return null;
  }
}

function getLatestGitDate(filePaths) {
  let latest = null;
  for (const relPath of filePaths) {
    const d = getGitDate(relPath);
    if (d && (!latest || d > latest)) latest = d;
  }
  return latest;
}

async function getRemoteEtag(urls) {
  let fetch;
  try {
    fetch = (await import("node-fetch")).default;
  } catch {
    return { skipped: true, reason: "node-fetch not available" };
  }

  const etags = [];
  for (const url of urls) {
    try {
      const res = await fetch(url, { method: "HEAD" });
      if (!res.ok) {
        etags.push(`HTTP ${res.status}`);
      } else {
        etags.push(res.headers.get("etag") || "no-etag");
      }
    } catch {
      etags.push("ERROR");
    }
  }
  const combinedEtag = etags.join("|");
  return { etag: combinedEtag };
}

async function getMediaWikiDate(apiUrl) {
  let fetch;
  try {
    fetch = (await import("node-fetch")).default;
  } catch {
    return { skipped: true, reason: "node-fetch not available" };
  }

  try {
    const res = await fetch(apiUrl);
    const data = await res.json();
    const pages = data?.query?.pages;
    if (!pages) return { date: null };
    // Get the first (and only) page's last revision timestamp
    const page = Object.values(pages)[0];
    const timestamp = page?.revisions?.[0]?.timestamp;
    if (timestamp) {
      return { date: timestamp.slice(0, 10) };
    }
    return { date: null };
  } catch (e) {
    return { date: null, error: e.message };
  }
}

function loadCache() {
  let cache;
  try {
    cache = JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8"));
  } catch {
    cache = {};
  }

  // Seed known dates for entries that don't have lastParsed yet
  let seeded = false;
  for (const source of SOURCES) {
    if (cache[source.name]?.lastParsed) continue;
    if (SEED_DATES[source.name]) {
      if (!cache[source.name]) cache[source.name] = {};
      cache[source.name].lastParsed = SEED_DATES[source.name];
      seeded = true;
    }
  }

  if (seeded) saveCache(cache);
  return cache;
}

function saveCache(cache) {
  const dir = path.dirname(CACHE_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2) + "\n");
}

// ── Per-source status ────────────────────────────────────────────────────────
//
// Extracted so run-parser.js can query a single source's status without
// re-implementing the probe logic. Returns a plain object; callers print.

async function getSourceStatus(source, cache) {
  const cached = cache[source.name];
  const lastParsed = cached?.lastParsed;

  if (source.method === "remote") {
    const result = await getRemoteEtag(source.urls);
    if (result.skipped) {
      return { state: "skipped", message: `SKIPPED (${result.reason})`, source };
    }
    const storedEtag = cached?.sourceEtag;
    if (!lastParsed) {
      return {
        state: "new",
        message: `NEVER PARSED (etag: ${result.etag.slice(0, 40)}...)`,
        etag: result.etag,
        source,
      };
    }
    if (storedEtag && storedEtag !== result.etag) {
      return {
        state: "changed",
        message: `CHANGED — etag differs, last parsed ${lastParsed}`,
        etag: result.etag,
        source,
      };
    }
    if (!storedEtag) {
      // Has lastParsed but no stored etag (first run after seed)
      return {
        state: "unchanged",
        message: `FIRST CHECK (last parsed: ${lastParsed}, etag: ${result.etag.slice(0, 40)}...)`,
        etag: result.etag,
        source,
      };
    }
    return { state: "unchanged", message: `unchanged (last parsed: ${lastParsed})`, source };
  }

  if (source.method === "mediawiki") {
    const result = await getMediaWikiDate(source.apiUrl);
    if (result.skipped) {
      return { state: "skipped", message: `SKIPPED (${result.reason})`, source };
    }
    if (!result.date) {
      return { state: "unreachable", message: `UNREACHABLE (${result.error || "no revision data"})`, source };
    }
    if (!lastParsed) {
      return { state: "new", message: `NEVER PARSED (last wiki revision: ${result.date})`, date: result.date, source };
    }
    if (result.date > lastParsed) {
      return {
        state: "changed",
        message: `CHANGED — wiki revised ${result.date}, last parsed ${lastParsed}`,
        date: result.date,
        source,
      };
    }
    return {
      state: "unchanged",
      message: `unchanged (last parsed: ${lastParsed}, wiki revision: ${result.date})`,
      source,
    };
  }

  // Local file source
  const sourceDate = getLatestGitDate(source.inputFiles);
  if (!sourceDate) {
    const missingFile = source.inputFiles.find((f) => !fs.existsSync(path.join(ROOT, f)));
    return { state: "missing", message: `MISSING FILE — ${missingFile || source.inputFiles[0]}`, source };
  }
  if (!lastParsed) {
    return { state: "new", message: `NEVER PARSED (source date: ${sourceDate})`, sourceDate, source };
  }
  if (sourceDate > lastParsed) {
    return {
      state: "changed",
      message: `CHANGED — source modified ${sourceDate}, last parsed ${lastParsed}`,
      sourceDate,
      source,
    };
  }
  return {
    state: "unchanged",
    message: `unchanged (last parsed: ${lastParsed}, source: ${sourceDate})`,
    sourceDate,
    source,
  };
}

// ── Output readiness (for --verify-output) ──────────────────────────────────
//
// For CHANGED/NEW sources, confirm a parsed opening.json exists and is newer
// than the source-change signal. Catches the "source changed but nobody
// re-parsed" situation (e.g. wiki reported CHANGED with only a placeholder
// input/opening.json on disk).

function verifyOutput(status) {
  const outputFile = path.join(ROOT, "parsers", status.source.name, "output", "opening.json");
  if (!fs.existsSync(outputFile)) {
    return { outputState: "not_parsed", message: "not parsed" };
  }
  const outStat = fs.statSync(outputFile);
  const outDate = outStat.mtime.toISOString().slice(0, 10);
  const refDate = status.sourceDate || status.date || null;
  if (refDate && outDate < refDate) {
    return { outputState: "stale", message: `output stale (output ${outDate} < source ${refDate})` };
  }
  return { outputState: "ready", message: `output ready (${outDate})` };
}

// ── Check ────────────────────────────────────────────────────────────────────

async function checkAll(cache, verifyOutputFlag) {
  let changed = 0,
    unchanged = 0,
    new_ = 0,
    missing = 0,
    skipped = 0,
    unreachable = 0;

  for (const source of SOURCES) {
    const status = await getSourceStatus(source, cache);
    let line = `  ${source.name}: ${status.message}`;

    if (verifyOutputFlag && (status.state === "changed" || status.state === "new")) {
      const out = verifyOutput(status);
      line += ` — ${out.message}`;
    }
    console.log(line);

    switch (status.state) {
      case "changed":
        changed++;
        break;
      case "new":
        new_++;
        break;
      case "unchanged":
        unchanged++;
        break;
      case "missing":
        missing++;
        break;
      case "unreachable":
        missing++;
        break;
      case "skipped":
        skipped++;
        break;
    }
  }

  console.log(
    `\nSummary: ${changed} changed, ${new_} new, ${unchanged} unchanged, ${missing} missing/unreachable, ${skipped} skipped`,
  );
}

// ── Update ───────────────────────────────────────────────────────────────────

async function updateCache(names) {
  const cache = loadCache();
  const now = new Date().toISOString().slice(0, 10);

  for (const name of names) {
    const source = SOURCES.find((s) => s.name === name);
    if (!source) {
      console.error(`Unknown source: ${name}`);
      continue;
    }

    cache[name] = {
      ...cache[name],
      lastParsed: now,
    };

    // For remote sources, also snapshot the current ETag
    if (source.method === "remote") {
      const result = await getRemoteEtag(source.urls);
      if (!result.skipped) {
        cache[name].sourceEtag = result.etag;
      }
    }

    console.log(`Updated ${name}: lastParsed=${now}`);
  }

  saveCache(cache);
}

// ── Detail: Wiki Crawler ─────────────────────────────────────────────────────

async function detailWikiCrawler(cache) {
  const lastParsed = cache?.wikiCrawler?.lastParsed;
  if (!lastParsed) {
    console.log("wikiCrawler: no lastParsed date — run check-sources first");
    return;
  }

  let fetch;
  try {
    fetch = (await import("node-fetch")).default;
  } catch {
    console.log("wikiCrawler: node-fetch not available");
    return;
  }

  // Use recentchanges API to get all recent edits in main namespace,
  // then filter to Chess Opening Theory pages client-side.
  // This avoids hitting rate limits with individual page queries.
  console.log("Fetching recent changes from Wikibooks...");

  const params = new URLSearchParams({
    action: "query",
    list: "recentchanges",
    rcnamespace: "0",
    rclimit: "500",
    rcprop: "title|timestamp",
    rctype: "edit",
    format: "json",
  });

  const res = await fetch("https://en.wikibooks.org/w/api.php?" + params.toString());
  const data = await res.json();
  const changes = data?.query?.recentchanges || [];

  // Filter to Chess Opening Theory pages, deduplicate by title (keep newest)
  const seen = new Map();
  for (const r of changes) {
    if (!r.title.startsWith("Chess Opening Theory")) continue;
    const existing = seen.get(r.title);
    if (!existing || r.timestamp > existing.timestamp) {
      seen.set(r.title, r.timestamp);
    }
  }

  const modified = [...seen.entries()]
    .filter(([, ts]) => ts.slice(0, 10) > lastParsed)
    .sort((a, b) => b[1].localeCompare(a[1]));

  console.log(
    `Found ${changes.length} recent edits, ${seen.size} unique Chess Opening Theory pages, ${modified.length} modified since ${lastParsed}\n`,
  );

  if (modified.length === 0) {
    console.log("No pages modified since last parse.");
  } else {
    for (const [title, ts] of modified) {
      const url = "https://en.wikibooks.org/wiki/" + encodeURI(title);
      console.log(`  ${ts.slice(0, 10)}  ${url}`);
    }
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--update-all")) {
    const names = SOURCES.map((s) => s.name);
    await updateCache(names);
    return;
  }

  if (args.includes("--update")) {
    const idx = args.indexOf("--update");
    const names = args[idx + 1]
      ?.split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!names || names.length === 0) {
      console.error("Usage: node scripts/check-sources.js --update <name>[,<name>...]");
      process.exit(1);
    }
    await updateCache(names);
    return;
  }

  if (args.includes("--detail")) {
    const idx = args.indexOf("--detail");
    const name = args[idx + 1];
    if (!name) {
      console.error("Usage: node scripts/check-sources.js --detail <name>");
      process.exit(1);
    }
    const cache = loadCache();
    if (name === "wikiCrawler") {
      await detailWikiCrawler(cache);
    } else {
      console.error(`No detail view available for: ${name}`);
      process.exit(1);
    }
    return;
  }

  // Default: check all
  const verifyOutputFlag = args.includes("--verify-output");
  const cache = loadCache();
  console.log("Checking sources for modifications since last parsed...\n");
  await checkAll(cache, verifyOutputFlag);
}

// ── Exports (for run-parser.js) ──────────────────────────────────────────────

export { SOURCES, getSourceStatus, verifyOutput, loadCache };

// Run main() only when invoked directly, not when imported.
const invokedAs = process.argv[1] || "";
if (invokedAs.endsWith("check-sources.js")) {
  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
