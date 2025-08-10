#!/usr/bin/env node

import { PGNAnalyzer } from '../pgn-analyzer.js';

// Test the chess position tracking with a longer game
const testPgn = `[Event "Test Game"]
[Site "Test"]
[Date "2025.08.09"]
[Round "1"]
[White "Player 1"]
[Black "Player 2"]
[Result "1-0"]
[Opening "Ruy Lopez"]
[ECO "C60"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. d4 Nbd7 11. c4 c6 12. cxb5 axb5 13. Nc3 Bb7 14. Bg5 b4 15. Nb1 h6 16. Bh4 c5 17. dxe5 Nxe5 18. Nxe5 dxe5 19. f3 Bc5+ 20. Kh1 Qd4 21. Qe2 Rfe8 22. Bg3 Bd6 23. Rd1 Qe3 24. Qxe3 Bxe3 25. Nc3 Bxe4 1-0`;

console.log('Testing chess position tracking with maxPlies = 50...\n');

// Create a test analyzer
const analyzer = new PGNAnalyzer();

// Parse the test PGN
analyzer.parsePGN(testPgn);

// Show the results
console.log('Database openings:');
for (const [opening, data] of Object.entries(analyzer.database.openings)) {
    console.log(`\nOpening: ${opening}`);
    console.log(`ECO: ${data.eco}`);
    console.log(`Moves: ${data.moves}`);
    console.log(`Total plies tracked: ${data.positions.length - 1} (plus starting position)`);
    console.log(`First 10 positions:`);
    const movesArray = data.moves.split(/\d+\.\s*/).filter(Boolean).join(' ').split(' ').filter(Boolean);
    data.positions.slice(0, 10).forEach((position, index) => {
        if (index === 0) {
            console.log(`  ${index}. Starting position: ${position}`);
        } else {
            const moveIndex = index - 1;
            const move = movesArray[moveIndex] || `move ${index}`;
            console.log(`  ${index}. After ${move}: ${position}`);
        }
    });
    if (data.positions.length > 10) {
        console.log(`  ... and ${data.positions.length - 10} more positions`);
    }
}

console.log('\nTest completed!');
