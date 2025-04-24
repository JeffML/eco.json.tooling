# eco.json.tooling

These are command-line tools can be used to prepare pull requests for eco.json. Steps have to be executed in the order outlined below.

Step 1: put your opening data in input/openings.json
The data must be of this format:

[
    {
      "name": "Alekhine Defense, 2. e5 Nd5 3. d4",
      "eco": "B03",
      "moves": "1. e4 Nf6 2. e5 Nd5 3. d4",
      "src: "scid"
    }, ...
]

The src field indicates where the data came from; the current recognized sources are listed [here](https://github.com/hayatbiralem/eco.json/tree/master?tab=readme-ov-file#encyclopedia-of-chess-openings-eco-data). If your data is derived from a new source, then mention it in the pull request.

Step 2: append the new openings to the eco.json opening files
Your opening data will be appended to eco?.json files pulled from the eco.json release you specify. You will want to use the latest release based on version number. See the eco.json project for release info. In the /output folder you will see eco?.json files with your new opening data. In the /actions folder, openings that have been added will be noted.

Step 3: from-to  linkages
The new openings may have continuations either in the existing eco?.json files, or within the new openings themselves. This step will add from-to forward linkages for each now opening in from-to.json, and add a note in /actions/from-to-forward.json

Step 4: create interopolated openings
In order to prevent orphan variations in the database, interpolation will generate linking variations from the orphan to an existing opening. It will also add from-to linkages to the interpolated openings.

Step 5: add eco?.json, from-to.json, and interpolated.json to your forked repo of eco.json. Create a pull request. If you're pulling from a new source, note it in the PR.







