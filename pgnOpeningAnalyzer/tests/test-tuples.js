#!/usr/bin/env node

import { PGNAnalyzer } from '../pgn-analyzer.js';
import fs from 'fs/promises';

// Test with games that will create different position counts
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

async function testTupleStructure() {
    console.log('Testing new [position, count] tuple structure...\n');

    // Clean up
    try {
        await fs.unlink('divergence.json');
    } catch (error) {}

    const analyzer = new PGNAnalyzer();

    // Process games one by one
    console.log('Processing Game 1...');
    analyzer.parsePGN(testPgn1);
    
    console.log('Processing Game 2 (extension)...');
    analyzer.parsePGN(testPgn2);
    
    console.log('Processing Game 3 (divergence)...');
    analyzer.parsePGN(testPgn3);

    const opening = analyzer.database.openings['Test Opening'];
    console.log('\nFinal opening data:');
    console.log(`  Opening: ${opening.baseOpening}`);
    console.log(`  Total games: ${opening.count}`);
    console.log(`  Moves: ${opening.moves}`);
    console.log(`  Positions (sorted by count, high to low):`);
    
    opening.positions.forEach((tuple, index) => {
        const [position, count] = tuple;
        const percentage = ((count / opening.count) * 100).toFixed(1);
        console.log(`    ${index + 1}. Count: ${count}/${opening.count} (${percentage}%) - ${position}`);
    });

    // Check divergence log
    console.log('\nDivergence log:');
    try {
        const divergenceData = await fs.readFile('divergence.json', 'utf8');
        const divergences = JSON.parse(divergenceData);
        console.log(`  Found ${divergences.length} divergence(s)`);
    } catch (error) {
        console.log('  No divergences logged');
    }

    console.log('\nTest completed!');
    console.log('Expected: Positions should be sorted by count (descending), with starting position having highest count.');
}

testTupleStructure().catch(console.error);
