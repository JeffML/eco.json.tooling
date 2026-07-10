#!/usr/bin/env node
/**
 * run-parser.js — thin orchestrator for a single parser.
 *
 *   node scripts/run-parser.js <name> [--force]
 *
 * Flow:
 *   1. Look up source in check-sources SOURCES registry.
 *   2. Unless --force: refuse if source status is "unchanged".
 *   3. Run the parser script (parsers/<name>/<main>.js) as a subprocess.
 *   4. Standardize output: copy the parser's opening.json to
 *      parsers/<name>/output/opening.json (fixes parsers like arasan that
 *      write to cwd).
 *   5. Copy to input/opening.json.
 *   6. Print record count + next-step hint.
 *
 * Does NOT run validate or the full pipeline — that's generatePullRequest.js.
 * The parser adapter refactor (PLAN-2) will replace the subprocess call with
 * a uniform `parse()` import; for now we invoke the existing script as-is.
 */

import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import {
    SOURCES,
    getSourceStatus,
    loadCache,
} from "./check-sources.js";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);

// Map source name → parser entry script (relative to parsers/<name>/).
// In PLAN-2 this becomes parsers/<name>/index.js exporting parse().
const PARSER_ENTRY = {
    arasan: "arasan.js",
    icsbot: "icsparser.js",
    lichess: "parseLichess.js",
    // others TBD
};

function usage() {
    console.error("Usage: node scripts/run-parser.js <name> [--force]");
    console.error("Known parsers:", Object.keys(PARSER_ENTRY).join(", "));
    process.exit(1);
}

function main() {
    const args = process.argv.slice(2);
    const force = args.includes("--force");
    const name = args.find((a) => !a.startsWith("--"));

    if (!name) usage();

    const entry = PARSER_ENTRY[name];
    if (!entry) {
        console.error(
            `No entry script registered for parser "${name}". Known: ${Object.keys(PARSER_ENTRY).join(", ")}`
        );
        console.error("(Add it to PARSER_ENTRY in scripts/run-parser.js.)");
        process.exit(1);
    }

    // 1-2. Source status gate
    const source = SOURCES.find((s) => s.name === name);
    if (!source) {
        console.error(`Unknown source: ${name}`);
        process.exit(1);
    }

    const cache = loadCache();
    // getSourceStatus is async (remote/mediawiki probes); for local-file
    // sources it resolves immediately. Await to keep behavior uniform.
    getSourceStatus(source, cache).then((status) => {
        if (status.state === "unchanged" && !force) {
            console.error(
                `${name}: source unchanged since ${cache[name]?.lastParsed}. Use --force to run anyway.`
            );
            process.exit(1);
        }
        if (status.state === "missing") {
            console.error(`${name}: ${status.message}`);
            process.exit(1);
        }
        runParser(name, entry);
    });
}

function runParser(name, entry) {
    const parserDir = path.join(ROOT, "parsers", name);
    const entryPath = path.join(parserDir, entry);
    if (!fs.existsSync(entryPath)) {
        console.error(`Parser entry not found: ${entryPath}`);
        process.exit(1);
    }

    console.log(`Running parser: ${name} (${entry})`);
    try {
        // Run with cwd = parser dir so scripts that write relative paths
        // (e.g. arasan.js writes "opening.json") land inside the parser dir.
        execFileSync(process.execPath, [entry], {
            cwd: parserDir,
            stdio: "inherit",
        });
    } catch (e) {
        console.error(`Parser ${name} failed: ${e.message}`);
        process.exit(1);
    }

    // 4. Standardize output location
    const parserOutput = path.join(parserDir, "opening.json");
    if (!fs.existsSync(parserOutput)) {
        console.error(
            `Parser did not produce opening.json at ${parserOutput}. Check the parser script's output path.`
        );
        process.exit(1);
    }

    const stdDir = path.join(parserDir, "output");
    if (!fs.existsSync(stdDir)) fs.mkdirSync(stdDir, { recursive: true });
    const stdPath = path.join(stdDir, "opening.json");
    fs.copyFileSync(parserOutput, stdPath);
    console.log(`Standardized output: ${path.relative(ROOT, stdPath)}`);

    // 5. Copy to input/opening.json
    const inputPath = path.join(ROOT, "input", "opening.json");
    if (!fs.existsSync(path.dirname(inputPath))) {
        fs.mkdirSync(path.dirname(inputPath), { recursive: true });
    }
    fs.copyFileSync(stdPath, inputPath);

    // 6. Report
    let count = 0;
    try {
        const data = JSON.parse(fs.readFileSync(inputPath, "utf-8"));
        count = Array.isArray(data) ? data.length - 1 : 0;
    } catch {
        console.error("Warning: could not parse opening.json to count records.");
    }

    console.log(`\n${name}: ${count} record(s) written to input/opening.json`);
    console.log(
        "Next: node generatePullRequest.js --dry-run   # produce the diff report"
    );
}

main();
