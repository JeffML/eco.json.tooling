import { Chess } from "chess.js";
import { ErrorCollector } from "../utils/errors.js";

const ECO_RE = /^[A-E]\d{2}[a-z]?$/;

/**
 * Validate and enrich incoming openings.
 *
 * For each opening (after the src descriptor at index 0):
 *   1. Field check — name, eco, moves present and non-empty.
 *   2. ECO format — /^[A-E]\d{2}[a-z]?$/ (flag, don't skip — arasan's regex
 *      allows B00 but not B00a; we want to know about the mismatch).
 *   3. chess.loadPgn(moves) — catches malformed AND illegal moves.
 *   4. On success: attach opening.fen = chess.fen().
 *
 * Failures are recorded in the ErrorCollector under the "validate" stage and
 * the offending opening is skipped (no fen attached). Does NOT throw on
 * failures — the caller decides via failClosed / --lenient.
 *
 * @param {Array} incoming — array with src descriptor at index 0
 * @param {ErrorCollector} collector
 * @returns {{valid: number, failed: number}} counts
 */
export function validate(incoming, collector) {
    const chess = new Chess();
    const source = incoming[0]?.src;
    if (!source) {
        collector.add("validate", incoming[0], "missing_src_descriptor");
        return { valid: 0, failed: 1 };
    }

    let valid = 0;
    let failed = 0;

    for (const opening of incoming.slice(1)) {
        const { name, eco, moves } = opening;

        // 1. Field check
        if (!name || !eco || !moves) {
            collector.add("validate", opening, "missing_fields", "name|eco|moves required");
            failed++;
            continue;
        }

        // 2. ECO format (flag only — don't skip; a non-conforming ECO may still
        //    produce a valid FEN and be worth keeping once the code is fixed)
        if (!ECO_RE.test(eco)) {
            collector.add("validate", opening, "eco_format", `eco="${eco}"`);
            // fall through — still attempt loadPgn
        }

        // 3. loadPgn — rejects both malformed notation and illegal moves
        try {
            // chess.js loadPgn mutates the instance; reset to avoid carryover
            chess.reset();
            chess.loadPgn(moves);
            opening.fen = chess.fen();
            valid++;
        } catch (e) {
            collector.add("validate", opening, "loadPgn_failed", e.message);
            failed++;
        }
    }

    return { valid, failed };
}

/**
 * Fail-closed helper: returns true if the run should abort.
 *
 * @param {ErrorCollector} collector
 * @param {boolean} lenient — if true, never abort (continue past failures)
 * @returns {boolean}
 */
export function shouldAbort(collector, lenient) {
    if (lenient) return false;
    return collector.count("validate") > 0;
}
