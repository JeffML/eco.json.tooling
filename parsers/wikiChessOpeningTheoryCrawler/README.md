# Wiki Chess Opening Theory Crawler

Crawls [Wikibooks Chess Opening Theory](https://en.wikibooks.org/wiki/Chess_Opening_Theory) pages
to extract opening names and moves, then feeds them into the eco.json pipeline.

## Quick start

```bash
# 1. Install dependencies (first time only)
npm install

# 2. Run the crawl (~500+ pages, throttled to 250 req/min)
npm start

# Crawler writes to ./storage/datasets/default/ as JSON files.
# Each file: { "url": "...", "text": "1. d4 · Queen's Pawn Opening" }

# 3. Process crawl output → openingMinusEco.json
node genPartialOpeningData.js
```

## Pipeline integration

After the crawl, the full pipeline flows like this:

```bash
# From the project root:
node scripts/run-parser.js wikiCrawler --force
# Runs: genPartialOpeningData.js → assignEcoCodes.js → input/opening.json

node generatePullRequest.js --dry-run
# Validate, classify, diff report → review, then --apply
```

## Output

`genPartialOpeningData.js` produces `openingMinusEco.json` — a map of URL to `{ name, moves }`.
`assignEcoCodes.js` looks up ECO codes from eco.json by replaying moves and checking FENs,
then writes `output/opening.json` in the standard pipeline format. Openings with no match
are assigned `"??"` and logged to `errors/wiki_crawler/eco_assignment.json` for manual review.

## Corrections

Sometimes Wikipedia is wrong, or the page is malformed, or the parser is too fragile.
Corrections are applied in `genPartialOpeningData.js`:

- **URL corrections** — 8 known malformed wiki URLs are remapped
- **Move extraction** — regex pipeline converts wiki URL segments to SAN moves
- **Name aliases** — `aliases.txt` (4,244 entries) maps raw wiki names to canonical opening names

## Storage

Crawl output goes to `./storage/` (gitignored). Delete `storage/` to force a fresh crawl.
