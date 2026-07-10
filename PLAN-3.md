# PLAN-3 — Wiki crawler cleanup + ECO assignment

Status: **planned** (not yet implemented)
Created: 2026-07-10
Depends on: PLAN-1 (complete) — uses validate.js, ErrorCollector, chessPGN

---

## Background

Wiki is the **only CHANGED source** per `check-sources` (wiki revised 2026-04-04, last parsed 2025-08-04). But running it requires Docker, has three known code bugs, and produces output with **no ECO codes** — making it the hardest parser to integrate into the pipeline.

The wiki flow is fundamentally different from arasan/icsbot:

```
Docker crawl → /storage/datasets/default/*.json   (user runs manually)
  ↓
genPartialOpeningData.js → openingMinusEco.json   (no ECO codes, URL-keyed)
  ↓
ECO assignment step → input/opening.json           (MISSING — to be built)
  ↓
generatePullRequest.js                             (standard pipeline)
```

## Known bugs (3 to fix)

### Bug 1: Dual-path mismatch (genPartialOpeningData.js, lines 31, 53-55)

```js
const filePath = path.join(wdir, "/storage/datasets/default");  // process.cwd()/storage/...
// ...
fs.readdirSync(filePath).forEach((file) => {
    const { url, text: name } = readJsonFile(
        path.resolve("/my_crawler/storage/datasets/default", file)  // Docker absolute path
    );
```

`filePath` is relative to cwd; `readJsonFile` uses the absolute Docker path. If run outside Docker (which it is — `genPartialOpeningData.js` runs on the host), neither path works. The storage directory needs to be a configurable path, defaulting to `parsers/wikiChessOpeningTheoryCrawler/storage/datasets/default` relative to the project root.

**Fix**: use `ROOT/storage/datasets/default` or accept a `--storage` argument.

### Bug 2: No path validation / Docker check

`genPartialOpeningData.js` assumes `storage/datasets/default` exists. If the crawl hasn't been run (or the storage was cleaned), `fs.readdirSync` throws `ENOENT` with no helpful message.

**Fix**: pre-flight check — if the directory doesn't exist or is empty, print "Run the Docker crawl first (see README.md)" and exit.

### Bug 3: Duplicated corrections (DRY violation)

`genPartialOpeningData.js` and `scripts/diff-wiki.js` both maintain their own copies of:
- `correctedUrls` (8 URL corrections, identical)
- `moveList()` URL→moves parser (nearly identical regex pipeline)

**Fix**: externalize both into a single tracked file `parsers/wikiChessOpeningTheoryCrawler/corrections.json`.

## Scattered corrections → corrections.json

Four correction mechanisms exist, none centralized:

| Source | What | Format | Tracked? |
|---|---|---|---|
| `genPartialOpeningData.js` | 8 URL corrections | Hardcoded object | Yes (code) |
| `scripts/diff-wiki.js` | Same 8 URL corrections | Duplicated hardcoded object | Yes (code) |
| `aliases.txt` | 4,244 name→alias mappings | NDJSON | Yes |
| `genPartialOpeningData.js` `moveList()` | URL→moves regex pipeline | Inline code | Yes (code) |

### Proposed: `corrections.json` schema

```json
{
  "urlCorrections": {
    "<bad url>": "<good url>"
  },
  "nameAliases": [
    { "openingName": "Queen's Pawn Game", "alias": "1. d4 · Queen's Pawn Opening" }
  ],
  "moveListRules": {
    "description": "Regex pipelines applied to wiki URLs to extract SAN moves",
    "rules": [
      { "pattern": "(\d{1,2}\\.)_([a-zA-Z0-9\\-]*)\\/?", "replacement": "$1 $2 " },
      { "pattern": "(\d{1,2}\\.{3})([a-zA-Z0-9\\-]*)\\/?", "replacement": " $2 " }
    ]
  }
}
```

Both `genPartialOpeningData.js` and `diff-wiki.js` import from this file instead of hardcoding.

## ECO assignment step (new code)

The biggest gap: `openingMinusEco.json` has no ECO codes. The README says "look up from eco.json, mark rest as '??'."

### Algorithm

```
for each wiki opening (url → {name, moves}):
  1. chessPGN.loadPgn(moves)
     → on failure: record in ErrorCollector, skip
  2. fen = chessPGN.fen()
  3. look up fen in eco.json (existingOpenings from getLatestEcoJson)
     → if found: eco = existingOpenings[fen].eco
     → if not found: eco = '??'  (requires manual assignment)
  4. push { src: 'wiki_crawler', name, eco, moves, fen }
```

### Implementation

New file: `parsers/wikiChessOpeningTheoryCrawler/assignEcoCodes.js`

- Imports `getLatestEcoJson` from `../../utils.js` and `ChessPGN` from `@chess-pgn/chess-pgn`
- Reads `openingMinusEco.json` (produced by `genPartialOpeningData.js`)
- Runs the algorithm above
- Writes `parsers/wikiChessOpeningTheoryCrawler/output/opening.json` in standard format
- Writes `errors/wiki_crawler/validate.json` for any loadPgn failures
- Writes `errors/wiki_crawler/eco_assignment.json` listing openings assigned '??'

### Wiring into run-parser.js

Add wiki to PARSER_ENTRY but mark it as requiring manual Docker step:

```
node scripts/run-parser.js wikiCrawler --force
```

Flow:
1. Check `storage/datasets/default/` exists (pre-flight; exit with instructions if not)
2. Run `genPartialOpeningData.js` → `openingMinusEco.json`
3. Run `assignEcoCodes.js` → `output/opening.json` (standard format)
4. Copy to `input/opening.json`
5. Print "run `node generatePullRequest.js --dry-run`"

## Scope — what this plan does NOT cover

- Fixing the Docker crawl itself (Crawlee/CheerioCrawler — that's the upstream data source)
- The `diff-wiki.js` incremental path (separate tool, used for small changes without full re-crawl)
- Manual ECO assignment for the '??' openings (human judgment required)

## Acceptance

1. `check-sources --verify-output` reports wiki as "CHANGED (not parsed)" (already works)
2. After Docker crawl, `run-parser.js wikiCrawler --force`:
   - Runs genPartialOpeningData.js (path bug fixed)
   - Runs ECO assignment
   - Writes standard `input/opening.json`
3. `generatePullRequest.js` runs on wiki data normally (validate, classify, diff)
4. `corrections.json` is the single source of truth for both genPartialOpeningData.js and diff-wiki.js
5. Pre-flight check gives clear error message if storage directory is missing

## Files touched

| File | Status | Purpose |
|---|---|---|
| `parsers/wikiChessOpeningTheoryCrawler/genPartialOpeningData.js` | edit | fix path bug, add pre-flight, import corrections.json |
| `parsers/wikiChessOpeningTheoryCrawler/corrections.json` | new | URL corrections + name aliases + moveList rules |
| `parsers/wikiChessOpeningTheoryCrawler/assignEcoCodes.js` | new | ECO assignment using chessPGN + eco.json lookup |
| `scripts/diff-wiki.js` | edit | import corrections.json instead of hardcoded |
| `scripts/run-parser.js` | edit | register wikiCrawler in PARSER_ENTRY |
| `parsers/wikiChessOpeningTheoryCrawler/aliases.txt` | delete? | subsumed by corrections.json |

## Risks

1. **ECO lookup coverage** — some wiki openings may not exist in eco.json at all, producing '??' ECO codes. These need manual review before PR submission. The `errors/wiki_crawler/eco_assignment.json` file makes this visible.
2. **Docker dependency** — the crawl still requires Docker. `run-parser.js` can't automate it; it can only detect missing storage and report clearly.
3. **Name aliases** — 4,244 aliases in `aliases.txt`. Consolidating into `corrections.json` is mechanical but large. Could defer and keep both files side-by-side initially.
4. **genPartialOpeningData.js uses chess.js** — this is a separate chess instance from the pipeline (which uses chessPGN). The `moveList()` regex produces raw move strings that are validated downstream by our pipe. The pipeline validation will catch any regex failures.
