import { Chess } from "chess.js";
import { ErrorCollector } from "../utils/errors.js";

const ECO_RE = /^[A-E]\d{2}[a-z]?$/;

/**
 * Normalize move text with deterministic, safe transformations.
 *
 * Applied BEFORE loadPgn. Every correction is recorded in the collector
 * under the "normalize" stage so the change is auditable (before→after).
 *
 * Currently handles:
 *   - Castling notation: `0-0-0` → `O-O-O`, `0-0` → `O-O`
 *   - Bare move numbers: `1 c4` → `1. c4` (add missing period)
 *
 * Deliberately NOT handled (needs chess context, ambiguous):
 *   - Lowercase pawn captures missing 'x': `bc3` → `bxc3` (could be a
 *     malformed `Bc3` bishop move; only the position disambiguates)
 *
 * @param {string} moves
 * @param {ErrorCollector} [collector] - if provided, records each correction
 * @param {object} [ctx] - { name?, eco? } for audit traceability
 * @returns {string} normalized moves
 */
export function normalizeMoves(moves, collector, ctx) {
    let out = moves;
    const corrections = [];

    // 1. Castling: 0-0-0 before 0-0 to avoid partial match
    if (/\b0-0-0\b/.test(out)) {
        const before = out;
        out = out.replace(/\b0-0-0\b/g, "O-O-O");
        corrections.push({ from: before, to: out, rule: "castling_000" });
    }
    if (/\b0-0\b/.test(out)) {
        const before = out;
        out = out.replace(/\b0-0\b/g, "O-O");
        corrections.push({ from: before, to: out, rule: "castling_00" });
    }

    // 2. Bare move numbers: a standalone number (preceded by start-of-string
    //    or whitespace) not followed by a period, then whitespace and a
    //    letter. The (^|\s) prefix ensures we don't match digits inside move
    //    tokens like d4, e4, c5 (those are preceded by a letter, not space).
    //    After castling fix, the only standalone digits in PGN move text are
    //    move numbers.
    if (/(?:^|\s)\d+(?!\.)\s+[a-zA-Z]/.test(out)) {
        const before = out;
        out = out.replace(/(^|\s)(\d+)(?!\.)\s+([a-zA-Z])/g, "$1$2. $3");
        corrections.push({ from: before, to: out, rule: "bare_move_number" });
    }

    if (corrections.length && collector) {
        for (const c of corrections) {
            collector.add("normalize", ctx ?? {}, c.rule, `${c.from} → ${c.to}`);
        }
    }

    return out;
}

/**
 * Validate and enrich incoming openings.
 *
 * For each opening (after the src descriptor at index 0):
 *   1. Field check — name, eco, moves present and non-empty.
 *   2. ECO format — /^[A-E]\d{2}[a-z]?$/ (flag, don't skip — arasan's regex
 *      allows B00 but not B00a; we want to know about the mismatch).
 *   3. normalizeMoves() — deterministic corrections (castling, bare move
 *      numbers); logged to the collector under "normalize".
 *   4. chess.loadPgn(moves) — catches malformed AND illegal moves. Retried
 *      after normalization.
 *   5. On success: attach opening.fen = chess.fen().
 *
 * Failures are recorded in the ErrorCollector under the "validate" stage and
 * the offending opening is skipped (no fen attached). Does NOT throw on
 * failures — the caller decides via failClosed / --lenient.
 *
 * @param {Array} incoming — array with src descriptor at index 0
 * @param {ErrorCollector} collector
 * @param {object} [opts]
 * @param {boolean} [opts.normalize=true] - apply normalizeMoves before loadPgn
 * @returns {{valid: number, failed: number}} counts
 */
export function validate(incoming, collector, opts = {}) {
    const { normalize = true } = opts;
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

        // 3. Normalize (deterministic, auditable)
        let moveText = moves;
        if (normalize) {
            moveText = normalizeMoves(moves, collector, { name, eco });
            if (moveText !== moves) {
                opening.moves = moveText; // persist the correction
            }
        }

        // 4. loadPgn — rejects both malformed notation and illegal moves
        try {
            // chess.js loadPgn mutates the instance; reset to avoid carryover
            chess.reset();
            chess.loadPgn(moveText);
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
 * Note: "normalize" corrections are NOT failures — they are successful
 * auto-fixes. Only "validate" stage entries abort (unless --lenient).
 *
 * @param {ErrorCollector} collector
 * @param {boolean} lenient — if true, never abort (continue past failures)
 * @returns {boolean}
 */
export function shouldAbort(collector, lenient) {
    if (lenient) return false;
    return collector.count("validate") > 0;
}
