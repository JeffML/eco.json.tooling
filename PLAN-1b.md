# PLAN-1b — 3-phase consolidation of generatePullRequest.js

Status: **complete** ✅ (2026-07-10)
Scope: Consolidate the 8 interactive `confirmStep` prompts into 3 logical phases with 1 prompt. Pure refactor of orchestration — no logic changes to the step modules themselves.

---

## Current state: 8 steps, 8 prompts

| Step                           | Module                           | Prompt? | Decision point?                                                              |
| ------------------------------ | -------------------------------- | ------- | ---------------------------------------------------------------------------- |
| 1 Validate                     | `getIncomingOpenings`            | yes     | no (just "ready to start")                                                   |
| 2 Filter                       | `filterIncoming`                 | yes     | no                                                                           |
| 3 Write intermediates + review | `updateInterpolated` + fs writes | yes ×2  | **redundant** — early diff report (emitted after Step 2) replaces the review |
| 4 Continuations                | `addedContinuations`             | yes     | no                                                                           |
| 5 Orphans + roots              | `findOrphans`/`findRoots`        | yes     | no                                                                           |
| 6 Line of descent              | `lineOfDescent`                  | yes     | no                                                                           |
| 7 Link fromTo                  | `moreFromTos`                    | yes     | no                                                                           |
| 8 Write merge files            | `applyData`/`writeNew`           | yes     | **yes** — "commit to writing?" (now gated by `--apply`)                      |

Steps 4–7 are four sequential computations with no human decision between them — each writes an intermediate file immediately consumed by the next. The prompts are speed bumps, not reviews.

## Ordering bug found (fix as part of consolidation)

The early diff report is currently emitted **after Step 2 (`filterIncoming`) but before Step 3's `updateInterpolated()`**. `updateInterpolated()` mutates `modified` (adds entries for interpolated continuations whose root was promoted). So the early diff report is missing those modified entries — it's inaccurate.

**Fix:** move `updateInterpolated()` into Phase 1 (before the diff report), so the report reflects the final classification. The intermediate file writes (`added.json`/`modified.json`/`formerlyInterpolated.json`) also move after `updateInterpolated()` for the same reason. This matches the current Step 3 ordering (updateInterpolated runs before the writes) — only the diff report timing changes.

## Proposed: 3 phases, 1 prompt

### Phase 1 — Validate + filter + diff

Combines current steps 1, 2, 3. One summary print, no prompt (in `--yes` mode).

```
1. getIncomingOpenings({ collector })       // validate, derive FENs
2. filterIncoming(incomingOpenings)          // classify added/modified/excluded/formerInterpolated
3. updateInterpolated(formerInterpolated, added, modified, existing)  // mutate modified
4. write intermediate files (added.json, modified.json, formerlyInterpolated.json)
5. writeDiffReport({ added, modified, formerInterpolated, excluded, source })  // early diff report — now ACCURATE
6. print summary: "N valid, N failed, N corrections, N added, N modified, N excluded, N formerly interpolated. Diff report: <path>"
```

### Phase 2 — Wire up graph

Combines current steps 4, 5, 6, 7. **No prompts.** All four computations run sequentially; intermediate files still written for debugging. One summary print at the end.

```
1. newContinuations = addedContinuations(added)               // write continuuations.json
2. newFromTos = canonicalFromTos(newContinuations)
3. newOrphans = findOrphans(added, [...existing.FT.json, ...newFromTos])
4. { unattached, noRoots } = findRoots(newOrphans)            // write orphanRoots.json
5. linesOfDescent = noRoots.map(fen => lineOfDescent(fen, added))  // write linesOfDescent.json
6. mft = moreFromTos(linesOfDescent)                          // write moreFromTos.json
7. print summary: "N continuations, N orphans (N unattached, N interpolated), N fromTo links"
```

### Phase 3 — Write merge files

Current step 8. One prompt (or `--apply`/`--yes` to skip).

```
1. newExisting = applyData(existing, added, newFromTos, mft, formerInterpolated, modified)
2. if DRY_RUN: print "skipping writeNew (use --apply)"
   else: writeNew(newExisting)
3. writeDiffReport({ ..., interpolations: linesOfDescent, fromToChanges: [...newFromTos, ...mft] })  // final, complete diff report
4. print "Done. Merge files in ./output/toMerge. Diff report: <path>"
```

## Prompt reduction

- **Before:** 8 `confirmStep` prompts (10 if counting Step 3's double prompt).
- **After:** 1 `confirmStep` prompt (Phase 3 "write merge files?"), skippable via `--yes` or bypassed via `--apply`.
- `--yes` mode: 0 prompts (prints summaries, proceeds straight through).
- Default (no `--yes`): 1 prompt before writing merge files.

## What stays the same

- All step modules (`filterIncoming`, `updateInterpolated`, `addedContinuations`, `findOrphans`, `findRoots`, `lineOfDescent`, `moreFromTos`, `applyData`, `writeNew`) — untouched.
- All intermediate file writes (`output/*.json`) — still written, just not gated by prompts.
- The early diff report + final diff report — both still written (early now accurate; final still complete).
- The `--apply`/`--dry-run`/`--yes`/`--lenient` flags — unchanged.
- `errors/` writes — unchanged.

## Risks

1. **`createEcoJsonFiles.js` fromTo crash** (pre-existing, failure point #6) still blocks Phase 3 `--apply` from completing. Out of scope for this consolidation — the dry-run path works, and the crash is a separate fix. The consolidation doesn't make this worse.
2. **Lost review checkpoint** — the Step 3 "Have you completed your review" prompt is removed. Mitigation: the early diff report (now accurate after the `updateInterpolated` move) is the review artifact, written before Phase 2 runs. A user can run `--dry-run`, inspect `diff-report/diff-report.md`, and decide whether to `--apply`. The checkpoint was redundant with this.
3. **Phase 2 is opaque** — four computations with no prompts could hide a failure. Mitigation: the summary print at the end of Phase 2 shows counts; intermediate files are written for inspection. If a step throws, the stack trace still surfaces.

## README update

Update the README's process description from 4 phases to 3, matching the new structure:

1. **Parse + validate + classify** → diff report (Phase 1)
2. **Generate interpolations + build fromTo** (Phase 2)
3. **Generate merge files** (Phase 3, `--apply`)

Drop the "at each step the tool will explain what the step is and give an option to continue or stop" language — replaced by `--yes`/`--apply` flags and summary prints.

## Acceptance

- `node generatePullRequest.js --yes --dry-run` completes Phases 1+2 and prints both summaries, writes early diff report, skips Phase 3 write with a message. **No prompts.**
- `node generatePullRequest.js --yes --apply` (once the fromTo crash is fixed) completes all 3 phases with no prompts.
- `node generatePullRequest.js --dry-run` (no `--yes`) prompts exactly once... actually 0 times in dry-run (Phase 3 write is skipped). So: default dry-run = 0 prompts; default apply = 1 prompt before write.
- Early diff report now includes `updateInterpolated` modifications (accuracy fix).
- All `output/*.json` intermediate files still written.
