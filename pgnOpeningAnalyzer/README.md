
__Alpha-stage__ tool for extracting chess opening data from PGN files posted on various sites, and comparing it to the contents of eco.json. This process is not fully automated.

# Method of Operation

All files are to be executed from the `pgnOpeningAnalyzer` folder.

`config.js` contains key settings, including which sites to visit and how many PGN/ZIP files to download per visit. Some PGN files are __VERY__ large, so it's best to visit one site at a time and download one file at a time. The `/cache` folder tracks which sites and files have already been processed, so subsequent runs only download new files.

**Step 1:** Run `pgn-data-gatherer.js` to create or append to `/output/openings.json`.

**Step 2:** Run `opening-analysis-stage1.js` to analyze the downloaded PGN games and deduce the opening move sequence associated with the opening/variation/subvariation data in the PGN header tags. Output is written to `/output/analysis.json`.

**Step 3:** Run `opening-analysis-stage2.js` to compare the deduced openings in `analysis.json` to the known openings in `eco.json`. Any potential candidates for new openings are written to `/output/candidates.json`.

Manual review of candidates in `candidates.json` is required to determine if they are truly new openings.

## a couple of notes
* Not all PGN files contain header tags for opening identification. 
* eco.json has over 14,000 openings, so it is unlikely that new opening data will be found in downloaded PGN files. Could happen, though.