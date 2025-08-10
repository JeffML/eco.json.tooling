#!/usr/bin/env node

import { PGNAnalyzer } from '../pgn-analyzer.js';

// Test with standard chess game and variant games
const standardGamePgn = `[Event "Standard Game"]
[Site "Test"]
[Date "2025.08.10"]
[Round "1"]
[White "Player 1"]
[Black "Player 2"]
[Result "1-0"]
[Opening "Italian Game"]
[ECO "C50"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 1-0`;

const variantGamePgn = `[Event "King of the Hill Game"]
[Site "Test"]
[Date "2025.08.10"]
[Round "2"]
[White "Player 3"]
[Black "Player 4"]
[Result "1-0"]
[Opening "Italian Game"]
[Variant "King of the Hill"]
[ECO "C50"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 1-0`;

const chess960GamePgn = `[Event "Chess960 Game"]
[Site "Test"]
[Date "2025.08.10"]
[Round "3"]
[White "Player 5"]
[Black "Player 6"]
[Result "0-1"]
[Opening "Random Opening"]
[Variant "Chess960"]
[SetUp "1"]
[FEN "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"]

1. d4 d5 0-1`;

console.log('Testing Variant tag filtering...\n');

const analyzer = new PGNAnalyzer();

// Process all games together
const combinedPgn = standardGamePgn + '\n\n' + variantGamePgn + '\n\n' + chess960GamePgn;

console.log('Processing PGN with 3 games (1 standard, 2 variants)...');
analyzer.parsePGN(combinedPgn);

console.log('\nResults:');
console.log(`Total games processed: ${analyzer.database.totalGames}`);
console.log(`Total openings in database: ${Object.keys(analyzer.database.openings).length}`);

console.log('\nOpenings found:');
for (const [opening, data] of Object.entries(analyzer.database.openings)) {
    console.log(`  - ${opening}: ${data.count} game(s)`);
}

console.log('\nExpected: Only 1 game should be processed (the standard chess game)');
console.log('Variant games should be filtered out and not appear in the database.');

console.log('\nTest completed!');
