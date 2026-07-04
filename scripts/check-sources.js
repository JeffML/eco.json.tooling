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
    chronos: "2025-06-15", // eco.json commit: "chronos eco.pgn"
    icsbot: "2025-06-16", // eco.json commit: "icsbot data"
    wikiCrawler: "2025-08-04", // tooling git: parsers/wikiChessOpeningTheoryCrawler/aliases.txt committed
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
        method: "file",
        inputFiles: ["parsers/icsbot/eco.txt"],
    },
    {
        name: "chessGraph",
        method: "file",
        inputFiles: ["parsers/chessGraph/chess-graph.csv"],
    },
    {
        name: "chessTempo",
        method: "file",
        inputFiles: ["parsers/chessTempo/input/chessTempo.json"],
    },
    {
        name: "chronos",
        method: "file",
        inputFiles: ["parsers/chronos/chronos.pgn"],
    },
    {
        name: "wikiGambits",
        method: "file",
        inputFiles: [
            "parsers/wikiGambits/input/List of chess gambits - Wikipedia.html",
        ],
    },
    {
        name: "wikiCrawler",
        method: "mediawiki",
        apiUrl:
            "https://en.wikibooks.org/w/api.php?action=query&titles=Chess_Opening_Theory&prop=revisions&rvlimit=1&format=json",
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
        const ts = execSync(
            `git log -1 --format=%ct -- "${filePath}"`,
            { cwd: ROOT, encoding: "utf-8" }
        ).trim();
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

// ── Check ────────────────────────────────────────────────────────────────────

async function checkAll(cache) {
    let changed = 0,
        unchanged = 0,
        new_ = 0,
        missing = 0,
        skipped = 0;

    for (const source of SOURCES) {
        const cached = cache[source.name];
        const lastParsed = cached?.lastParsed;

        if (source.method === "remote") {
            const result = await getRemoteEtag(source.urls);
            if (result.skipped) {
                console.log(`  ${source.name}: SKIPPED (${result.reason})`);
                skipped++;
                continue;
            }

            const storedEtag = cached?.sourceEtag;

            if (!lastParsed) {
                console.log(`  ${source.name}: NEVER PARSED (etag: ${result.etag.slice(0, 40)}...)`);
                new_++;
            } else if (storedEtag && storedEtag !== result.etag) {
                console.log(`  ${source.name}: CHANGED — etag differs, last parsed ${lastParsed}`);
                changed++;
            } else if (!storedEtag) {
                // Has lastParsed but no stored etag (first run after seed)
                console.log(`  ${source.name}: FIRST CHECK (last parsed: ${lastParsed}, etag: ${result.etag.slice(0, 40)}...)`);
                unchanged++;
            } else {
                console.log(`  ${source.name}: unchanged (last parsed: ${lastParsed})`);
                unchanged++;
            }
        } else if (source.method === "mediawiki") {
            const result = await getMediaWikiDate(source.apiUrl);
            if (result.skipped) {
                console.log(`  ${source.name}: SKIPPED (${result.reason})`);
                skipped++;
                continue;
            }
            if (!result.date) {
                console.log(`  ${source.name}: UNREACHABLE (${result.error || "no revision data"})`);
                missing++;
                continue;
            }

            if (!lastParsed) {
                console.log(`  ${source.name}: NEVER PARSED (last wiki revision: ${result.date})`);
                new_++;
            } else if (result.date > lastParsed) {
                console.log(`  ${source.name}: CHANGED — wiki revised ${result.date}, last parsed ${lastParsed}`);
                changed++;
            } else {
                console.log(`  ${source.name}: unchanged (last parsed: ${lastParsed}, wiki revision: ${result.date})`);
                unchanged++;
            }
        } else {
            // Local file source
            const sourceDate = getLatestGitDate(source.inputFiles);
            if (!sourceDate) {
                const missingFile = source.inputFiles.find(
                    (f) => !fs.existsSync(path.join(ROOT, f))
                );
                console.log(
                    `  ${source.name}: MISSING FILE — ${missingFile || source.inputFiles[0]}`
                );
                missing++;
                continue;
            }

            if (!lastParsed) {
                console.log(`  ${source.name}: NEVER PARSED (source date: ${sourceDate})`);
                new_++;
            } else if (sourceDate > lastParsed) {
                console.log(`  ${source.name}: CHANGED — source modified ${sourceDate}, last parsed ${lastParsed}`);
                changed++;
            } else {
                console.log(`  ${source.name}: unchanged (last parsed: ${lastParsed}, source: ${sourceDate})`);
                unchanged++;
            }
        }
    }

    console.log(
        `\nSummary: ${changed} changed, ${new_} new, ${unchanged} unchanged, ${missing} missing files, ${skipped} skipped`
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

    const res = await fetch(
        "https://en.wikibooks.org/w/api.php?" + params.toString()
    );
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
        `Found ${changes.length} recent edits, ${seen.size} unique Chess Opening Theory pages, ${modified.length} modified since ${lastParsed}\n`
    );

    if (modified.length === 0) {
        console.log("No pages modified since last parse.");
    } else {
        for (const [title, ts] of modified) {
            console.log(`  ${ts.slice(0, 10)}  ${title}`);
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
            console.error(
                "Usage: node scripts/check-sources.js --update <name>[,<name>...]"
            );
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
    const cache = loadCache();
    console.log("Checking sources for modifications since last parsed...\n");
    await checkAll(cache);
}

main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
});
