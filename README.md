# eco.json.tooling

The generatePullRequest.js file is a command-line tool that can be used to prepare pull requests for eco.json. First, run `yarn install`, then subsequently you can run `node generatePullRequest.js`.

The tool runs in three phases. By default it operates in dry-run mode (no merge files written); use `--apply` to write the merge files. Use `--yes` to skip the single confirmation prompt (Phase 3).

```
node generatePullRequest.js --dry-run        # default: validate, classify, diff report, no merge files
node generatePullRequest.js --apply          # also write merge files (prompts once unless --yes)
node generatePullRequest.js --apply --yes    # fully non-interactive
node generatePullRequest.js --lenient        # continue past validation failures
```

## Generate merge data for pull request

### incoming data

Put your new opening data in input/opening.json
The data must be of this format:

```
[
    {src: "scid", url: <optional>}
    {
        "name": "Alekhine Defense, 2. e5 Nd5 3. d4",
        "eco": "B03",
        "moves": "1. e4 Nf6 2. e5 Nd5 3. d4",
    },
    {
        "name": "Borg Defense",
        "eco": "B00",
        "moves": "1. e4 g5",
    },...
]
```

The the first element is a src field which indicates where the data came from; the current recognized sources are listed [here](https://github.com/hayatbiralem/eco.json/tree/master?tab=readme-ov-file#encyclopedia-of-chess-openings-eco-data). If your data is derived from a new source, then mention it in the pull request. It is recommended to put the first element ({src:...}) into the pull request.

### Phase 1: Parse + validate + classify

The `opening.json` file is parsed, validated, and compared to the existing [eco.json](https://github.com/jeffml/eco.json) opening data. First, the FEN string will be derived from the moves of each opening, then the following actions are performed:

1. if the opening FEN is found in eco_interpolated.json
   a) it will be removed
   b) it will be added to the appropriate eco?.json file
   c) subsequent interpolated openings (continuations) will have their names updated
2. if the opening FEN is found in any eco?.json file,
   a) if the new opening name differs from the existing name,
   i) if the src is identical, the name is changed
   ii) if an alias exists with the new opening src, that alias is updated
   iii) if no alias exists, then a new alias is created
   b) if the existing name (or an alias name) are the same, no action is taken
3. if no existing opening is found in any of the eco or interpolated files, then a new opening is added to the appropriate eco?.json file

A diff report (`diff-report/diff-report.{json,md}`) is generated listing all additions, modifications, and deletions per FEN. Validation failures and auto-corrections are written to `errors/`. Intermediate data is written to the `/output` folder for debugging.

### Phase 2: Generate interpolations + build fromTo

Interpolations fill in the gaps between named openings. For each added opening (including interpolations), from-to linkages are created. See eco.json at github for details. Intermediate files are written to `/output` for debugging.

### Phase 3: Generate merge files

Generate new eco?.json, eco_interpolated.json, and fromTo.json files in `./output/toMerge/`. Copy these to your fork of eco.json. Push the changes to your fork and submit a pull request. If you're adding opening data from a new source, note it in the PR.

## End-to-end workflow (one source at a time)

**This pipeline processes one source at a time.** To add data from multiple sources, repeat steps 2-5 for each.

```bash
# 1. Check which sources have changed
npm run check-sources

# 2. Run the parser for the desired source
node scripts/run-parser.js <name>
# Or, for parsers not yet wired into run-parser.js, run them directly:
#   node parsers/chessGraph/chess-graph.js
#   node parsers/kent-eco/kent-eco.js
#   node parsers/chessTempo/parseChessTempo.js
#   node parsers/wikiGambits/parseWikiGambits.js

# 3. Copy parser output to pipeline input
cp parsers/<name>/output/opening.json input/opening.json

# 4. Review (dry-run — no files written)
node generatePullRequest.js
# Inspect diff-report/diff-report.md and output/*.json
# Use --pause to stop after Phase 1 for human editing of added.json / modified.json,
# then --resume to continue.

# 5. Apply (writes toMerge/ + runs sanity check)
node generatePullRequest.js --apply --yes
# Sanity check runs automatically on toMerge/ files.
# Copy toMerge/* to your eco.json fork and open a PR.
```

### Wiki crawler (special case)

The wiki crawler requires a two-step process:

```bash
# 1. Run the crawl (~500 pages, ~2 min)
cd parsers/wikiChessOpeningTheoryCrawler && npm start

# 2. Post-crawl: extract moves, assign ECO codes, write input/opening.json
cd ../.. && node scripts/run-parser.js wikiCrawler --force

# 3. Continue with pipeline steps 4-5 above
node generatePullRequest.js
node generatePullRequest.js --apply --yes
```

### Running the sanity check standalone

```bash
npm run sanity-check              # checks ../eco.json
node scripts/sanity-check.js output/toMerge  # checks pending merge
```

### Parser reference

| Source      | Command                                        | Type       | Notes                                  |
| ----------- | ---------------------------------------------- | ---------- | -------------------------------------- |
| lichess     | `run-parser.js lichess`                        | Remote     | Fetches 5 TSV files from GitHub        |
| wikiCrawler | `run-parser.js wikiCrawler`                    | Crawl      | Requires `npm start` first (Crawlee)   |
| icsbot      | `run-parser.js icsbot`                         | Local file | TSV format                             |
| chessTempo  | `node parsers/chessTempo/parseChessTempo.js`   | Local JSON | Download input from chesstempo.com     |
| chessGraph  | `node parsers/chessGraph/chess-graph.js`       | Local CSV  | CSV from Destaq/chess-graph            |
| kent-eco    | `node parsers/kent-eco/kent-eco.js`            | Local PGN  | PGN from cs.kent.ac.uk pgn-extract     |
| wikiGambits | `node parsers/wikiGambits/parseWikiGambits.js` | Local HTML | Wikipedia "List of chess gambits" page |
| ~~arasan~~  | (removed)                                      | —          | Mirrors lichess — redundant            |

## Pipeline output files

After running `generatePullRequest.js`, intermediate files are written to `./output/`. Use `--pause` to stop after Phase 1 for human review, then `--resume` to continue.

| File                        | Phase | Purpose                                                                                                                  |
| --------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------ |
| `added.json`                | 1     | New openings — FENs not in eco.json. Human-editable between `--pause` and `--resume`.                                    |
| `modified.json`             | 1     | Existing openings with new aliases from the parsed source. Names are never changed.                                      |
| `formerlyInterpolated.json` | 1     | FENs promoted from `src: "interpolated"` to named. Will be removed from `eco_interpolated.json`.                         |
| `continuations.json`        | 2     | Forward links: for each new opening, legal moves that reach a named opening (progeny).                                   |
| `orphanRoots.json`          | 2     | `noRoots` (no ancestor found — need interpolations) and `unattached` (candidate ancestor exists but no legal move path). |
| `linesOfDescent.json`       | 2     | Backward chains: interpolated bridge openings from each orphan back to its nearest named ancestor.                       |
| `moreFromTos.json`          | 2     | `fromTo` links for the interpolation chains in `linesOfDescent.json`.                                                    |
| `toMerge/`                  | 3     | Final `ecoA-E.json`, `eco_interpolated.json`, and `fromTo.json` ready for pull request. Written only with `--apply`.     |

## Opening evaluations

The `/scoreOpenings` folder will generate scores for all currently unevaluated openings. It is not an official part of eco.json, and relies on the installation of UCI-capable chess engine, such as stockfish. Evaluations will vary according to the specs of the platform they run on.

## Similar Openings

A simple script to generate a list of similar openings for each opening in the eco.json files, based on Levenshtein distance.
