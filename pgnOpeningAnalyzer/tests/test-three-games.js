#!/usr/bin/env node

import { PGNAnalyzer } from '../pgn-analyzer.js';

// Test with three games that progressively have shorter common sequences
const testPgn1 = `[Event "Test Game 1"]
[Site "Test"]
[Date "2025.08.10"]
[Round "1"]
[White "Player 1"]
[Black "Player 2"]
[Result "1-0"]
[Opening "Sicilian Defense"]
[ECO "B20"]

1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 1-0`;

const testPgn2 = `[Event "Test Game 2"]
[Site "Test"]
[Date "2025.08.10"]
[Round "2"]
[White "Player 3"]
[Black "Player 4"]
[Result "0-1"]
[Opening "Sicilian Defense"]
[ECO "B20"]

1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. f3 e5 0-1`;

const testPgn3 = `[Event "Test Game 3"]
[Site "Test"]
[Date "2025.08.10"]
[Round "3"]
[White "Player 5"]
[Black "Player 6"]
[Result "1/2-1/2"]
[Opening "Sicilian Defense"]
[ECO "B20"]

1. e4 c5 2. Nf3 d6 3. Bb5+ Bd7 1/2-1/2`;

console.log('Testing with three games that progressively shorten the common sequence...\n');

const analyzer = new PGNAnalyzer();

// Process first game
console.log('Processing first game...');
analyzer.parsePGN(testPgn1);
let opening = analyzer.database.openings['Sicilian Defense'];
console.log(`After game 1: ${opening.moves} (${opening.positions.length} positions)`);

// Process second game
console.log('Processing second game...');
analyzer.parsePGN(testPgn2);
opening = analyzer.database.openings['Sicilian Defense'];
console.log(`After game 2: ${opening.moves} (${opening.positions.length} positions)`);

// Process third game
console.log('Processing third game...');
analyzer.parsePGN(testPgn3);
opening = analyzer.database.openings['Sicilian Defense'];
console.log(`After game 3: ${opening.moves} (${opening.positions.length} positions)`);

console.log(`\nFinal count: ${opening.count} games`);
console.log('Expected: Should be truncated to "1. e4 c5 2. Nf3 d6 3. d4" or shorter depending on common positions');
console.log('Test completed!');
