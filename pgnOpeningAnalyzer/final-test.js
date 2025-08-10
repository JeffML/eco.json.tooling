#!/usr/bin/env node

import { PGNAnalyzer } from './pgn-analyzer.js';
import fs from 'fs/promises';

// Test with clear divergences
const testPgn1 = `[Event "Game 1"]
[Site "Test"]
[Date "2025.08.10"]
[Round "1"]
[White "Player 1"]
[Black "Player 2"]
[Result "1-0"]
[Opening "Test Opening"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 1-0`;

const testPgn2 = `[Event "Game 2"]
[Site "Test"]
[Date "2025.08.10"]
[Round "2"]
[White "Player 3"]
[Black "Player 4"]
[Result "0-1"]
[Opening "Test Opening"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 0-1`;

const testPgn3 = `[Event "Game 3"]
[Site "Test"]
[Date "2025.08.10"]
[Round "3"]
[White "Player 5"]
[Black "Player 6"]
[Result "1/2-1/2"]
[Opening "Test Opening"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Bxc6 1/2-1/2`;

async function finalTest() {
    console.log('Final test of occurrence counting and divergence detection...\n');

    // Clean up
    try {
        await fs.unlink('divergence.json');
    } catch (error) {}

    const analyzer = new PGNAnalyzer();

    // Process games
    console.log('Processing Game 1...');
    analyzer.parsePGN(testPgn1);
    let opening = analyzer.database.openings['Test Opening'];
    console.log(`  Moves: ${opening.moves}`);
    console.log(`  Position counts: [${opening.positionCounts.join(', ')}]`);

    console.log('\nProcessing Game 2 (extension)...');
    analyzer.parsePGN(testPgn2);
    opening = analyzer.database.openings['Test Opening'];
    console.log(`  Moves: ${opening.moves}`);
    console.log(`  Position counts: [${opening.positionCounts.join(', ')}]`);

    console.log('\nProcessing Game 3 (divergence at move 4)...');
    analyzer.parsePGN(testPgn3);
    opening = analyzer.database.openings['Test Opening'];
    console.log(`  Moves: ${opening.moves}`);
    console.log(`  Position counts: [${opening.positionCounts.join(', ')}]`);

    // Check divergence log
    console.log('\nDivergence log:');
    try {
        const divergenceData = await fs.readFile('divergence.json', 'utf8');
        const divergences = JSON.parse(divergenceData);
        console.log(`  Found ${divergences.length} divergence(s)`);
        divergences.forEach((div, i) => {
            console.log(`  ${i+1}. Diverged at position ${div.divergenceAtMove}`);
            console.log(`     Stored: ${div.storedMoves}`);
            console.log(`     New: ${div.newMoves}`);
        });
    } catch (error) {
        console.log('  No divergences logged');
    }

    console.log('\nTest completed!');
}

finalTest().catch(console.error);
