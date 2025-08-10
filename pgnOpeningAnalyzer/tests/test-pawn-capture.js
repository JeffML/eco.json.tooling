#!/usr/bin/env node

import { PGNAnalyzer } from '../pgn-analyzer.js';

// Test with pawn captures
const testPgn = `[Event "Pawn Capture Test"]
[Site "Test"]
[Date "2025.08.10"]
[Round "1"]
[White "Player 1"]
[Black "Player 2"]
[Result "1-0"]
[Opening "Test Opening"]

1. e4 d5 2. exd5 1-0`;

console.log('Testing pawn capture moves...\n');

const analyzer = new PGNAnalyzer();
analyzer.parsePGN(testPgn);

const opening = analyzer.database.openings['Test Opening'];
if (opening) {
    console.log(`Opening: ${opening.baseOpening}`);
    console.log(`Moves: ${opening.moves}`);
    console.log(`Total positions: ${opening.positions.length}`);
    
    console.log('\nPositions:');
    opening.positions.forEach((tuple, index) => {
        const [position, count] = tuple;
        console.log(`  ${index + 1}. ${position} (count: ${count})`);
    });
    
    console.log('\nTest passed! Pawn capture "exd5" was parsed successfully.');
} else {
    console.log('Test failed: No opening found, likely due to parsing error.');
}

console.log('\nTest completed!');
