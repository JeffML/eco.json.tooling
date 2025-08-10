# PGN Opening Analyzer - Tests

This directory contains test scripts for the PGN Opening Analyzer.

## How to Run Tests

From this directory, run any test script:
```bash
node test-real-pgn.js        # Main production test with real tournament data
node test-25moves.js         # Tests maxPlies boundary (note: has illegal move)
node test-pawn-capture.js    # Simple pawn capture validation
node test-variant-filter.js  # Tests chess variant filtering
```

## Test Scripts

### Core Functionality
- **`test-real-pgn.js`** - Main test using real tournament PGN data from `testInput/ttbl1706e25.pgn`
- **`test-pawn-capture.js`** - Simple validation test for basic move parsing
- **`test-25moves.js`** - Tests maxPlies limit (currently has illegal move at position 38)

### Feature Testing
- **`test-variant-filter.js`** - Tests filtering of chess variants (games with Variant tag)
- **`test-tuples.js`** - Tests [position, count] tuple data structure
- **`test-occurrence-counting.js`** - Tests position frequency counting and divergence detection
- **`test-three-games.js`** - Tests processing multiple games and position merging
- **`test-position.js`** - Tests FEN position generation
- **`test-formatting.js`** - Tests move string formatting

## Notes

- All tests use the chess.js library for reliable move validation and position tracking
- Test scripts automatically import from `../pgn-analyzer.js`
- Real PGN data is located in `../testInput/`
- Tests process games up to `maxPlies = 50` (25 full moves)
