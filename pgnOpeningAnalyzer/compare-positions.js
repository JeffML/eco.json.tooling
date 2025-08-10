#!/usr/bin/env node

import { PGNAnalyzer } from './pgn-analyzer.js';

// Test to see the actual positions generated
const testPgn1 = `[Event "d3 game"]
[Site "Test"]
[Date "2025.08.10"]
[Round "1"]
[White "Player 1"]
[Black "Player 2"]
[Result "1-0"]
[Opening "Italian Game"]
[ECO "C50"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. d3 1-0`;

const testPgn2 = `[Event "O-O game"]
[Site "Test"]
[Date "2025.08.10"]
[Round "2"]
[White "Player 3"]
[Black "Player 4"]
[Result "0-1"]
[Opening "Italian Game"]
[ECO "C50"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. O-O 0-1`;

function comparePositions() {
    console.log('Comparing positions for d3 vs O-O...\n');

    const analyzer1 = new PGNAnalyzer();
    const analyzer2 = new PGNAnalyzer();

    analyzer1.parsePGN(testPgn1);
    analyzer2.parsePGN(testPgn2);

    const positions1 = analyzer1.database.openings['Italian Game'].positions;
    const positions2 = analyzer2.database.openings['Italian Game'].positions;

    console.log('d3 game positions:');
    positions1.forEach((pos, i) => {
        console.log(`  ${i}: ${pos}`);
    });

    console.log('\nO-O game positions:');
    positions2.forEach((pos, i) => {
        console.log(`  ${i}: ${pos}`);
    });

    console.log('\nComparison:');
    const maxLen = Math.max(positions1.length, positions2.length);
    for (let i = 0; i < maxLen; i++) {
        const pos1 = positions1[i] || 'undefined';
        const pos2 = positions2[i] || 'undefined';
        const match = pos1 === pos2 ? '✓' : '✗';
        console.log(`  ${i}: ${match} ${pos1 === pos2 ? 'SAME' : 'DIFFERENT'}`);
        if (pos1 !== pos2) {
            console.log(`     d3:  ${pos1}`);
            console.log(`     O-O: ${pos2}`);
            break;
        }
    }
}

comparePositions();
