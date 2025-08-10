#!/usr/bin/env node

import { PGNAnalyzer } from '../pgn-analyzer.js';

// Test with exactly 25 moves (50 plies)
const testPgn = `[Event "Test Game - 25 Moves"]
[Site "Test"]
[Date "2025.08.09"]
[Round "1"]
[White "Player 1"]
[Black "Player 2"]
[Result "1-0"]
[Opening "Queen's Gambit"]
[ECO "D06"]

1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Be7 5. e3 O-O 6. Nf3 Nbd7 7. Rc1 c6 8. Bd3 dxc4 9. Bxc4 Nd5 10. Bxe7 Qxe7 11. O-O Nxc3 12. Rxc3 e5 13. dxe5 Nxe5 14. Nxe5 Qxe5 15. Rc2 Be6 16. Bxe6 Qxe6 17. Qd4 Rad8 18. Qxa7 Rd2 19. Rxd2 Qe1+ 20. Qxe1 Rxe1+ 21. Rxe1 f6 22. Rd7 b5 23. Ra7 c5 24. Ra5 c4 25. Rxb5 c3 1-0`;

console.log('Testing maxPlies = 50 (exactly 25 moves)...\n');

const analyzer = new PGNAnalyzer();
analyzer.parsePGN(testPgn);

for (const [opening, data] of Object.entries(analyzer.database.openings)) {
    console.log(`Opening: ${opening}`);
    console.log(`ECO: ${data.eco}`);
    console.log(`Moves: ${data.moves}`);
    console.log(`Total plies tracked: ${data.positions.length - 1} (should be 50)`);
    console.log(`Total positions: ${data.positions.length} (should be 51 including starting position)`);
    
    // Count actual moves in the string
    const moveCount = (data.moves.match(/\d+\./g) || []).length;
    console.log(`Move count from string: ${moveCount} (should be 25)`);
}

console.log('\nTest completed!');
