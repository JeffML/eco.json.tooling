# eco.json.tooling

These are command-line tools can be used to prepare pull requests for eco.json. Steps have to be executed in the order outlined below.

## Generate merge data for pull request
### incoming data
Put your new opening data in input/opening.json
The data must be of this format:
```
[
    {src: "scid"}
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

The the first element is a src field which indicates where the data came from; the current recognized sources are listed [here](https://github.com/hayatbiralem/eco.json/tree/master?tab=readme-ov-file#encyclopedia-of-chess-openings-eco-data). If your data is derived from a new source, then mention it in the pull request.

### parse opening.js
The `opening.json` file is parsed, compared to the existing [eco.json](https://github.com/hayatbiralem/eco.json) opening data. First, the FEN string will be derived from the moves of each opening, then the following actions will be performed:
1) if the opening FEN is found in eco_interpolated.json
    a) it will be removed
    b) it will be added to the appropriate eco?.json file
    c) subsequent interpolated openings (continuations) will have their names updated
2) if the opening FEN is found in any eco?.json file,
    a) if the new opening name differs from the existing name, 
        i) if the src is identical, the name is changed
        ii) if an alias exists with the new opening src, that alias is updated
        iii) if no alias exists, then a new alias is created
    b) if the existing name (or an alias name) are the same, no action is taken
3) if no existing opening is found in any of the eco or interpolated files, then a new opening is added to the appropriate eco?.json file

Intermediate data will be written to the /output folder for further processing in the next steps.

### generate interpolations
Interpolations fill in the gaps between named openings. Details can be found in the README in eco.json github project.

### build fromTo table
For each added opening (including interpolations), from-to linkages are created. See eco.json at github.

### generate merge data for pull requests
Step 4: Generate new eco?.json, eco_interplated.json, and fromTo.json files. Copy these and move them to your fork of eco.json. Push the changes to your fork and submit a pull request. If you're adding opening data from a new source, note it in the PR.

### parsers
consider these to be fragile an in need of occasional maintenance.

## Opening evaluations
The `/scoreOpenings` folder will generate scores for all currently unevaluated openings. It is not an official part of eco.json, and relies on the installation of UCI-capable chess engine, such as stockfish. Evaluations will vary according to the specs of the platform they run on. 





