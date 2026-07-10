import fs from "fs";
import path from "path";

/**
 * ErrorCollector — structured failure collection for the eco.json.tooling pipeline.
 *
 * Replaces the ad-hoc console.error-and-continue pattern in steps/incoming.js.
 * Each stage (validate, parse, etc.) records failures with the offending input
 * and a reason; the collector writes one JSON file per stage to errors/.
 *
 * Default behavior is fail-closed: any failure count > 0 causes run-parser.js
 * to exit non-zero unless --lenient is passed.
 */
export class ErrorCollector {
    constructor() {
        /** @type {Record<string, Array<{input: unknown, reason: string, raw?: string}>>} */
        this.stages = {};
    }

    /**
     * Record a failure for a given stage.
     * @param {string} stage — e.g. "validate", "parse"
     * @param {unknown} input — the offending record (opening object, line, etc.)
     * @param {string} reason — machine-readable reason code, e.g. "loadPgn_failed"
     * @param {string} [raw] — optional raw detail (exception message, etc.)
     */
    add(stage, input, reason, raw) {
        if (!this.stages[stage]) this.stages[stage] = [];
        const entry = { input, reason };
        if (raw !== undefined) entry.raw = raw;
        this.stages[stage].push(entry);
    }

    /** Number of failures recorded for a stage. */
    count(stage) {
        return this.stages[stage]?.length ?? 0;
    }

    /** Total failures across all stages. */
    get total() {
        return Object.values(this.stages).reduce((n, arr) => n + arr.length, 0);
    }

    /** True if any failures were recorded. */
    hasFailures() {
        return this.total > 0;
    }

    /** JSON-serializable object for a single stage. */
    toJSON(stage) {
        const failures = this.stages[stage] ?? [];
        return { stage, total: failures.length, failures };
    }

    /**
     * Write one JSON file per stage that has failures into the given directory.
     * Creates the directory if needed.
     * @param {string} dir — absolute path to errors/ directory
     * @returns {string[]} paths written
     */
    writeAll(dir) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        const written = [];
        for (const stage of Object.keys(this.stages)) {
            const failures = this.stages[stage];
            if (!failures || failures.length === 0) continue;
            const file = path.join(dir, `${stage}.json`);
            fs.writeFileSync(file, JSON.stringify(this.toJSON(stage), null, 2));
            written.push(file);
        }
        return written;
    }

    /** Print a one-line summary per stage to stdout. */
    printSummary() {
        for (const stage of Object.keys(this.stages)) {
            const n = this.stages[stage].length;
            if (n > 0) {
                console.log(`  ${stage}: ${n} failure(s) — see errors/${stage}.json`);
            }
        }
    }
}
