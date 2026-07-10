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

### parsers

consider these to be fragile an in need of occasional maintenance. Use `node scripts/run-parser.js <name> [--force]` to run a parser and stage its output into `input/opening.json`. Use `node scripts/check-sources.js [--verify-output]` to detect which sources have changed since last parsed.

## Opening evaluations

The `/scoreOpenings` folder will generate scores for all currently unevaluated openings. It is not an official part of eco.json, and relies on the installation of UCI-capable chess engine, such as stockfish. Evaluations will vary according to the specs of the platform they run on.

## Similar Openings

A simple script to generate a list of similar openings for each opening in the eco.json files, based on Levenshtein distance.
