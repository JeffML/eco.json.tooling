# PLAN-1 — Validate→Flag→Diff pilot on arasan

Status: **complete** ✅ (2026-07-10) — with scope evolution documented below
Created: 2026-07-10
Scope: Step 0 + Step 1 only. Builds the validate→flag→diff loop end-to-end on one deterministic local-file parser (arasan) to prove the pattern before extending to other parsers or wiki cleanup.

---

## Background & motivation

The eco.json.tooling pipeline is fragile and ad-hoc. Three concrete failures drove this plan:

1. **Patches are lost.** `input/` and `output/` are gitignored, so manually-edited `opening.json` files disappear on the next parse. Provenance survives only via the `src` tag — if at all.
2. **`check-sources` conflates "source changed" with "we have data ready."** It reported wiki as CHANGED (revision 2026-04-04 > last-parsed 2025-08-04), but no crawl output existed — `input/opening.json` was a hand-authored 1-record placeholder. Nothing flagged this.
3. **Validation silently drops bad records.** `steps/incoming.js` `validate()` catches `loadPgn` failures, logs to stderr, returns `true`, sets `fen=undefined`; `filterIncoming` then `if (!fen) continue;` — silent loss, no structured record.

The goal: one command produces a structured diff (additions/modifications/deletions per FEN, per source) with all failures collected and counted. Manual review becomes optional, not blocking. Auto-fix is deferred — flag first.

## Pilot choice: arasan (not wiki)

Wiki was the natural candidate (it's the only CHANGED source) but is the _hardest_ to start with:

- Docker-dependent crawl; storage lives in `/my_crawler/storage/datasets/default`
- `genPartialOpeningData.js` has a latent path bug (`filePath` uses `process.cwd()/storage/...`, per-file read uses absolute `/my_crawler/storage/...`)
- Surviving corrections are scattered: `aliases.txt` (4,244 lines NDJSON, tracked), `correctedUrls` (8 entries, hardcoded in JS), `moveList()` regex normalization (inline)

**arasan** is a better pilot: local file, no Docker, real tracked source (`arasan.txt`), "unchanged" per check-sources (ideal — empty expected diff proves the loop works). `--force` lets us run it anyway.

icsbot (plain TSV) is the cleaner baseline alternative; arasan's regex fragility makes it a better stress-test of the error collector.

---

## Files touched

| File                       | Status  | Purpose                                                                            |
| -------------------------- | ------- | ---------------------------------------------------------------------------------- |
| `scripts/check-sources.js` | edit    | add `--verify-output`, `--force`                                                   |
| `scripts/run-parser.js`    | new     | thin runner: check-sources gate → parser → validate → copy to `input/opening.json` |
| `utils/errors.js`          | new     | `ErrorCollector` class                                                             |
| `steps/validate.js`        | new     | structured validation returning `{valid, failures}`                                |
| `steps/diffReport.js`      | new     | consolidate intermediates → `output/diff-report.{json,md}`                         |
| `generatePullRequest.js`   | edit    | wire new `validate`, add `--lenient`/`--dry-run`/`--yes` flags                     |
| `errors/`                  | new dir | runtime output (gitignored like `output/`)                                         |
| `.gitignore`               | edit    | add `errors/`                                                                      |

---

## Step 0 — check-sources ↔ parse-readiness gap

### `check-sources.js` additions

1. **`--verify-output` flag.** After computing each source's status, for any "CHANGED" source additionally checks `parsers/<name>/output/opening.json`:
   - missing → status becomes `CHANGED (not parsed)`
   - present but older than source mtime → `CHANGED (output stale)`
   - present and newer → `CHANGED (output ready)`
2. **`--force` flag.** `run-parser.js` (Step 1) refuses to run on "unchanged" sources; `--force` overrides. Enables the arasan pilot.
3. No change to existing default behavior or cache.

### Acceptance

- `node scripts/check-sources.js --verify-output` reports wiki as `CHANGED (not parsed)` and arasan as `unchanged`.
- `node scripts/run-parser.js arasan --force` proceeds.

---

## Step 1 — validate→flag→diff loop on arasan

### `utils/errors.js` — `ErrorCollector`

- `add(stage, input, reason, raw?)`
- `toJSON()` → `{stage, total, failures: [{input, reason, raw}]}`
- `write(path)`
- `get count`
- Stage-keyed (one collector instance serves the whole run, writing `errors/<stage>.json`)

### `steps/validate.js` — replaces boolean `validate()` in `steps/incoming.js`

For each opening (after the src descriptor):

1. **Field check:** `name`, `eco`, `moves` all present and non-empty. Missing → collect, skip.
2. **ECO format:** `/^[A-E]\d{2}[a-z]?$/`. Mismatch → collect (flag, don't skip — arasan's regex `[A-E]\d{2}` allows `B00` but not `B00a`; we want to know).
3. **`chess.loadPgn(moves)`** in try/catch. Failure → collect `{input: opening, reason: 'loadPgn_failed', raw: e.message}`, skip.
4. On success: attach `opening.fen = chess.fen()`.

> Material-balance check dropped (Open Question 1): promotion-possible anomalies are rare and not worth the processing. `loadPgn` already rejects strictly illegal positions.

Returns `{valid: <count of successful>, failed: <count>}`.

**Fail-closed default:** if `failed > 0` and not `--lenient`, `run-parser.js` exits non-zero after writing `errors/validate.json`.

### `steps/diffReport.js`

Reads the intermediate files the pipeline already writes:

- `output/added.json`, `modified.json`, `formerlyInterpolated.json`, `continuations.json`, `orphanRoots.json`, `linesOfDescent.json`, `moreFromTos.json`

Consolidates into `output/diff-report.json`:

```json
{
  "source": "arasan",
  "summary": {"additions": N, "modifications": N, "deletions": N, "interpolations": N, "fromToChanges": N},
  "additions": [{"fen","name","eco","src","moves"}],
  "modifications": [{"fen","before","after","fieldsChanged","src"}],
  "deletions": [{"fen","wasInterpolated":true,"replacedBy"}],
  "interpolations": [...],
  "fromToChanges": [...]
}
```

Also writes `output/diff-report.md` — PR-ready text grouped by ECO category + source.

Safe to run in `--dry-run` (before `writeNew()`), so the diff is available before merge files are written.

### `generatePullRequest.js` edits

- Parse argv: `--yes` (skip `confirmStep`), `--lenient` (don't exit on validation failures), `--dry-run` (skip final `writeNew()`).
- Replace `getIncomingOpenings()` call's internal `validate()` with new `steps/validate.js`, passing the `ErrorCollector`.
- Replace boolean check (`if (!validate(json)) process.exit(-1)`) with: collect failures, print summary, exit non-zero unless `--lenient`.
- After Step 2 (`filterIncoming`), call `diffReport()` to emit the report early — so even if you bail at the Step 3 review prompt, the diff is already in hand.
- `--dry-run` skips Step 8 (`writeNew`).

### `scripts/run-parser.js` — new orchestrator

```
node scripts/run-parser.js arasan [--force]
```

1. Look up source in `check-sources` SOURCES registry.
2. Unless `--force`: if source status is "unchanged", refuse with message.
3. Run `parsers/arasan/arasan.js` body (initially via `child_process`/dynamic import — adapter refactor is deferred to PLAN-2).
4. Copy `parsers/arasan/opening.json` → `parsers/arasan/output/opening.json` (standardize path; fixes the cwd-write bug).
5. Copy to `input/opening.json`.
6. Print: record count, output path, and "run `node generatePullRequest.js --dry-run` for the diff report."

---

## Expected pilot outcome (arasan)

- `arasan.js` runs, produces ~N records (whatever's in `arasan.txt`).
- `errors/validate.json` ideally empty; if not, the flags reveal real-world failure modes (arasan's `0` vs `O` castling, the `smove.indexOf('"')` heuristic, etc.).
- `output/diff-report.json` for arasan: expected empty/near-empty since source is "unchanged" and was last parsed 2025-06-15. **A non-empty diff here is a finding** — it means either (a) arasan parsing is non-deterministic, or (b) eco.json has drifted from the last arasan merge. Either way, the diff report makes it visible instead of silent.

---

## What this pilot deliberately does NOT do

- No parser adapter refactor (deferred) — `run-parser.js` calls `arasan.js` as-is.
- No move/name auto-correction — flag only, never auto-fix (yet).
- No multi-source aggregation — single source at a time.
- No wiki cleanup — separate track (PLAN-3): externalize `correctedUrls` + `aliases.txt` into `corrections.json`, fix the dual-path bug, add Docker pre-flight check.

---

## Open questions — RESOLVED 2026-07-10

1. **Material-balance thresholds** — DROPPED. Not worth the processing; `loadPgn` already catches illegal positions.
2. **`--dry-run` default** — CONFIRMED. `generatePullRequest.js` is dry-run by default; `--apply` required to write `toMerge/`.
3. **diff-report location** — CONFIRMED. Tracked `diff-report/` for the report; `output/` stays gitignored for intermediates.

---

## Follow-on plans — RE-EVALUATED 2026-07-10

- **PLAN-2** — parser adapter interface. **Still valid.** `run-parser.js` works via subprocess for arasan+icsbot but other parsers (lichess, chessGraph, kent-eco) need their entry scripts verified. Adapter would unify. Priority: medium (not blocking).

- **PLAN-3** — wiki cleanup. **Still valid, highest priority.** Wiki is the only CHANGED source per check-sources. Docker dependency + path bug need fixing first. `--verify-output` correctly reports it as "CHANGED (not parsed)".

- **PLAN-4** — ~~auto-fix~~ → **corrections overlay.** **Reduced scope.** The normalizeMoves() step with 5 auto-fix rules already covers deterministic fixes (bare move numbers, castling, pawn captures, compact numbers, doubled numbers). What remains: externalize parser-specific corrections (arasan's bad lines, icsbot's illegal moves) into tracked `parsers/<name>/corrections.json` files.

- **PLAN-5** — single `npm run sync` pipeline. **Still valid but lower priority.** `run-parser.js` + `generatePullRequest.js` is 2 commands away from a single command. A thin `scripts/sync.js` wrapping both would close the gap. Priority: low.

## Deviation log

| Plan said                             | Actually happened                                                                      | Reason                                                                             |
| ------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Flag only, no auto-fix                | 5 auto-fix rules (bare number, castling, pawn capture, compact number, doubled number) | User pushed for deterministic fixes; each proven safe by chessPGN loadPgn re-check |
| diff-report in `output/` (gitignored) | diff-report in `diff-report/` (tracked)                                                | Open Question 3: user wanted survivable reports                                    |
| errors in flat `errors/`              | namespaced `errors/<source>/`                                                          | Prevented clobbering between parser runs (found during icsbot pilot)               |
| chess.js                              | chessPGN                                                                               | User's package, stricter validation caught 286 silent drops chess.js missed        |
| arasan only                           | arasan + icsbot                                                                        | User pushed to confirm generalization; both clean                                  |
| 8-step pipeline with prompts          | 3-phase, 0 prompt dry-run                                                              | PLAN-1b consolidation: steps 4-7 had no decision points                            |
| arasan diff expected empty            | 880 additions, 936 modifications                                                       | eco.json may have drifted since last arasan merge (finding, not failure)           |
