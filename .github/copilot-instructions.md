# Copilot Instructions for eco.json.tooling

## Project Purpose

Maintain and extend the eco.json chess openings database by parsing data from
multiple external sources, validating it, and preparing pull requests. **Never
directly modify eco.json data files** — the output is always a pull request.

## Cardinal Rule: Do Not Corrupt eco.json

Existing eco.json data is the ground truth. Any parser or pipeline change must:

1. **Never mutate** existing `ecoA-E.json`, `eco_interpolated.json`, or `fromTo.json` directly
2. **Validate all additions** before they are merged into intermediate output
3. **Preserve source provenance** — every opening must have a `src` field
4. **Fail closed** — if validation fails, stop and report; don't silently drop data

## Source Change Pre-Check

Before running any parser, verify the source has been modified:

```bash
npm run check-sources            # Report which sources changed
npm run check-sources -- --detail wikiCrawler  # Wiki-specific detail
```

- **NEVER** re-parse a source that reports "unchanged"
- If a source is "CHANGED", review what changed before parsing
- After successful parse + PR, run `npm run check-sources -- --update <name>` to record

## Parser Hardening: Six Failure Points

Each parser must be hardened against these failure modes. Tackle parser by parser.

### 1. URL / Source Unavailable

**Symptom**: Source URL returns 404, 403, or connection error.

**Mitigation**:

- Run `check-sources` first (catch MISSING/UNREACHABLE before parsing)
- Each parser should have a pre-flight HEAD request or file existence check
- On failure: report clearly, do not proceed with stale data

### 2. Source Format Changed

**Symptom**: The raw data format (TSV columns, CSV structure, HTML markup, JSON schema)
differs from what the parser expects. Results in garbled output or silent data loss.

**Mitigation**:

- Smoke test: parse first N records (e.g. 10) and validate before processing all
- Validate record count is within expected range (not 0, not absurdly large)
- For structured formats (TSV, CSV): validate column count per row
- For HTML scrapers: validate CSS selectors return expected elements
- Report format anomalies; do not silently produce partial output

### 3. Moves Are Malformed

**Symptom**: Move text does not parse as valid SAN. Causes:

- Non-standard notation (e.g. `0-0` instead of `O-O`, `bxc3` vs `bxc3`)
- Encoding issues (Unicode characters, HTML entities in moves)
- Truncated or concatenated move strings

**Mitigation**:

- Run every move sequence through `chess.loadPgn()` (chessPGN) before accepting
- Collect ALL failures, not just the first one — write to `errors/<parser>.txt`
- Known corrections (like wiki URL corrections) should be in a data file, not hardcoded
- Report: "X/Y records failed move validation"

### 4. Moves Are Illegal

**Symptom**: Move text parses as valid SAN but produces illegal chess moves (piece not
present, path blocked, king would be in check).

**Mitigation**:

- `chess.loadPgn()` catches this — same validation as #3
- Additionally, verify the FEN position matches expected piece counts
- Flag any opening whose final position has an impossible material balance
  (e.g., 3 knights, 10 pawns)

### 5. Name Differences (Pipeline-Level)

**Symptom**: Two sources use slightly different names for the same opening:
"Petrov Defense" vs "Petroff Defence" vs "Russian Game".

**Mitigation**:

- `filterIncoming()` in `steps/incoming.js` handles this via Levenshtein distance
- Current threshold: `leven(a, b) < 5` — review borderline cases (distance 3-4)
- eco_tsv is authoritative; aliases record alternative names
- When in doubt, add as alias rather than renaming

### 6. From/To & Interpolations (Pipeline-Level)

**Symptom**: New openings create orphan positions or break navigation paths.

**Mitigation**:

- `generatePullRequest.js` steps 4-7 handle this algorithmically
- Review intermediate output files before final write:
  - `output/added.json` — new openings
  - `output/modified.json` — changed openings
  - `output/formerlyInterpolated.json` — replaced interpolations
  - `output/continuations.json` — from/to links
  - `output/orphanRoots.json` — unattached and true orphans
  - `output/linesOfDescent.json` — new interpolation chains
- Run full `generatePullRequest.js` even for single-opening additions
  (a single new opening can affect multiple interpolations)

## Pull Request Workflow

1. **Pre-check**: `npm run check-sources` — confirm source has changed
2. **Parse**: Run the parser → produces `opening.json` in parser output dir
3. **Copy to input**: `cp parsers/<name>/output/opening.json input/opening.json`
   (or use `diff-wiki.js --to-input` for wiki crawler)
4. **Review input**: Edit name, eco, and moves fields manually as needed
5. **Generate PR data**: `node generatePullRequest.js` → walks through 7 steps
6. **Review intermediate files** in `output/` before final step
7. **Copy to eco.json fork**: Files in `output/toMerge/` → push to fork → open PR
8. **Update cache**: `npm run check-sources -- --update <name>`

## Parser-Specific Notes

### lichess (eco_tsv)

- Authoritative source — supersedes all other sources in conflicts
- Fetches live from `lichess-org/chess-openings` (5 TSV files, a-e)
- Pre-check: ETag comparison via `check-sources`
- Format: TSV with columns `eco`, `name`, `moves`
- Risk: Lichess may restructure their TSV format

### wikiCrawler (wiki_crawler)

- Crawls `en.wikibooks.org/wiki/Chess_Opening_Theory` via Crawlee/CheerioCrawler
- Output: `openingMinusEco.json` — **no ECO codes** (must be assigned manually)
- Docker-based; separate toolchain
- Pre-check: MediaWiki API revision timestamp
- For small changes, use `diff-wiki.js --to-input` instead of full re-crawl
- Known URL corrections in `genPartialOpeningData.js` — review periodically

### arasan

- Input: `arasan.txt` (fixed-width text format)
- Format: `ECO  "Name"     moves`
- Risk: Regex-based parsing, sensitive to whitespace changes

### icsbot

- Input: `eco.txt` (TSV format)
- Format: `eco\tname\tmoves`
- Includes error tracking in `error.txt`

### chessGraph

- Input: `chess-graph.csv` (CSV from Destaq/chess-graph)
- Two-pass parser: first pass collects name/ECO, second formats moves
- Common failure: CSV malformation in source repo

### chessTempo

- Input: `chessTempo.json` (nested JSON tree)
- Recursive tree walker
- Risk: JSON structure changes in chessTempo API

### kent-eco

- Input: `eco.pgn` (PGN file from cs.kent.ac.uk pgn-extract)
- Cross-references against existing eco.json to find new names
- Risk: PGN parsing edge cases, large file size

### wikiGambits

- Input: scraped Wikipedia HTML (`List of chess gambits - Wikipedia.html`)
- Regex-based extraction
- Risk: Wikipedia page restructuring breaks regex patterns

## Validation Checklist Per Parser

Before submitting a PR from any parser, verify:

- [ ] Source pre-check passed (not parsing unchanged data)
- [ ] 0 records with empty or null FEN
- [ ] All ECO codes match `/^[A-E]\d{2}[a-z]?$/`
- [ ] All moves produce valid FENs via chessPGN
- [ ] Duplicate FENs within the batch are resolved
- [ ] Source field is set on every record
- [ ] Record count is within expected range (not 0, not > expected max)
