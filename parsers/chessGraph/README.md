# chessGraph parser

Fetches live CSV from [Destaq/chess-graph](https://github.com/Destaq/chess-graph/blob/master/elo_reading/openings_sheet.csv).

Parses CSV lines (two formats: named rows and continuation rows), converts
space-separated plies to SAN, groups duplicate positions to merge names, and
strips trailing ECO codes from name fields.

Run: `node parsers/chessGraph/chess-graph.js`
