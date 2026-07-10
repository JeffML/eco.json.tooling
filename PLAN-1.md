# PLAN-1 — Validate→Flag→Diff pilot on arasan

Status: **planned** (not yet implemented)
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

Wiki was the natural candidate (it's the only CHANGED source) but is the *hardest* to start with:
- Docker-dependent crawl; storage lives in `/my_crawler/storage/datasets/default`
- `genPartialOpeningData.js` has a latent path bug (`filePath` uses `process.cwd()/storage/...`, per-file read uses absolute `/my_crawler/storage/...`)
- Surviving corrections are scattered: `aliases.txt` (4,244 lines NDJSON, tracked), `correctedUrls` (8 entries, hardcoded in JS), `moveList()` regex normalization (inline)

**arasan** is a better pilot: local file, no Docker, real tracked source (`arasan.txt`), "unchanged" per check-sources (ideal — empty expected diff proves the loop works). `--force` lets us run it anyway.

icsbot (plain TSV) is the cleaner baseline alternative; arasan's regex fragility makes it a better stress-test of the error collector.

---

## Files touched

| File | Status | Purpose |
|---|---|---|
| `scripts/check-sources.js` | edit | add `--verify-output`, `--force` |
| `scripts/run-parser.js` | new | thin runner: check-sources gate → parser → validate → copy to `input/opening.json` |
| `utils/errors.js` | new | `ErrorCollector` class |
| `steps/validate.js` | new | structured validation returning `{valid, failures}` |
| `steps/diffReport.js` | new | consolidate intermediates → `output/diff-report.{json,md}` |
| `generatePullRequest.js` | edit | wire new `validate`, add `--lenient`/`--dry-run`/`--yes` flags |
| `errors/` | new dir | runtime output (gitignored like `output/`) |
| `.gitignore` | edit | add `errors/` |

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
4. **Material-balance check** on resulting FEN: parse position field, count pieces per side. Violations (>8 pawns, >9 queens, >2 kings — see Open Question 1) → collect `{reason: 'material_imbalance'}`, skip.
5. On success: attach `opening.fen = chess.fen()`.

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

## Open questions (resolve before implementing)

1. **Material-balance thresholds** — listed `>8 pawns, >9 queens, >2 kings` as violations. Sound right, or stricter (e.g. flag 3 knights, which *is* possible via promotion)? Default proposed: only flag strictly-impossible counts; promotion-possible counts are flagged as warnings, not errors.
2. **`--dry-run` default** — should the *default* `generatePullRequest.js` run be dry-run (safe), with `--apply` required to write `toMerge/`? Or keep current behavior (writes by default) and require `--dry-run` to opt out? Proposed: safe-by-default given the fragility.
3. **diff-report location** — `output/diff-report.{json,md}` (gitignored, ephemeral) or a tracked `diff-report/` so PRs can reference them? Given patches were lost precisely *because* output was untracked, consider tracking these. Proposed: tracked `diff-report/` for the report itself, `output/` stays gitignored for intermediates.

---

## Follow-on plans (not in scope here)

- **PLAN-2** — parser adapter interface (`parsers/<name>/index.js` exporting `parse() → {openings, errors, meta}`), `run-parser.js` unified, per-parser smoke test (10-record pre-validation).
- **PLAN-3** — wiki cleanup: `corrections.json`, dual-path fix, Docker pre-flight, `--verify-output` wiring.
- **PLAN-4** — auto-fix (opt-in, logged): `normalizeMoves()`, externalized `data/name-corrections.json`, material-balance as warning vs error.
- **PLAN-5** — single deterministic pipeline (`npm run sync`): check sources → parse changed → validate → diff → optional merge.
