
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

## Output

`genPartialOpeningData.js` produces `openingMinusEco.json` — a map of URL to `{ name, moves }`.
**No ECO codes** are assigned; this is done by the pipeline's ECO assignment step.

## Corrections

Sometimes Wikipedia is wrong, or the page is malformed, or the parser is too fragile.
Corrections are applied in `genPartialOpeningData.js`:

- **URL corrections** — 8 known malformed wiki URLs are remapped
- **Move extraction** — regex pipeline converts wiki URL segments to SAN moves
- **Name aliases** — `aliases.txt` (4,244 entries) maps raw wiki names to canonical opening names

## Storage

Crawl output goes to `./storage/` (gitignored). Delete `storage/` to force a fresh crawl.
