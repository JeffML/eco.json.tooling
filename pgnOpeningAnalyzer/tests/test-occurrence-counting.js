#!/usr/bin/env node

import { PGNAnalyzer } from '../pgn-analyzer.js';
import fs from 'fs/promises';

// Test with games that have divergent paths
const testPgn1 = `[Event "Test Game 1"]
[Site "Test"]
[Date "2025.08.10"]
[Round "1"]
[White "Player 1"]
[Black "Player 2"]
[Result "1-0"]
[Opening "Italian Game"]
[ECO "C50"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. d3 f5 1-0`;

const testPgn2 = `[Event "Test Game 2"]
[Site "Test"]
[Date "2025.08.10"]
[Round "2"]
[White "Player 3"]
[Black "Player 4"]
[Result "0-1"]
[Opening "Italian Game"]
[ECO "C50"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. O-O d6 0-1`;

const testPgn3 = `[Event "Test Game 3"]
[Site "Test"]
[Date "2025.08.10"]
[Round "3"]
[White "Player 5"]
[Black "Player 6"]
[Result "1/2-1/2"]
[Opening "Italian Game"]
[ECO "C50"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. d3 d6 1/2-1/2`;

async function runTest() {
    console.log('Testing position occurrence counting and divergence logging...\n');

    // Clean up any existing divergence file
    try {
        await fs.unlink('divergence.json');
    } catch (error) {
        // File doesn't exist, that's fine
    }

    const analyzer = new PGNAnalyzer();

    // Process first game
    console.log('Processing first game...');
    analyzer.parsePGN(testPgn1);

    let opening = analyzer.database.openings['Italian Game'];
    console.log('After first game:');
    console.log(`  Moves: ${opening.moves}`);
    console.log(`  Positions count: ${opening.positions.length}`);
    console.log(`  Position counts: [${opening.positionCounts.join(', ')}]`);
    console.log(`  Game count: ${opening.count}`);

    // Process second game (should diverge at move 4)
    console.log('\nProcessing second game...');
    analyzer.parsePGN(testPgn2);

    opening = analyzer.database.openings['Italian Game'];
    console.log('After second game:');
    console.log(`  Moves: ${opening.moves}`);
    console.log(`  Positions count: ${opening.positions.length}`);
    console.log(`  Position counts: [${opening.positionCounts.join(', ')}]`);
    console.log(`  Game count: ${opening.count}`);

    // Process third game (should diverge at same point as game 1)
    console.log('\nProcessing third game...');
    analyzer.parsePGN(testPgn3);

    opening = analyzer.database.openings['Italian Game'];
    console.log('After third game:');
    console.log(`  Moves: ${opening.moves}`);
    console.log(`  Positions count: ${opening.positions.length}`);
    console.log(`  Position counts: [${opening.positionCounts.join(', ')}]`);
    console.log(`  Game count: ${opening.count}`);

    // Check divergence log
    console.log('\nChecking divergence log...');
    try {
        const divergenceData = await fs.readFile('divergence.json', 'utf8');
        const divergences = JSON.parse(divergenceData);
        console.log(`Found ${divergences.length} divergence(s):`);
        divergences.forEach((div, index) => {
            console.log(`  ${index + 1}. Opening: ${div.openingName}`);
            console.log(`     Diverged at move: ${div.divergenceAtMove}`);
            console.log(`     New moves: ${div.newMoves}`);
        });
    } catch (error) {
        console.log('No divergence file found or error reading it');
    }

    console.log('\nTest completed!');
}

runTest().catch(console.error);
