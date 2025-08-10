#!/usr/bin/env node

import { PGNAnalyzer } from '../pgn-analyzer.js';

// Test simple moves formatting
const analyzer = new PGNAnalyzer();

// Test the formatMovesString method directly
const testMoves = ['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4'];
const formatted = analyzer.formatMovesString(testMoves);

console.log('Test moves array:', testMoves);
console.log('Formatted string:', formatted);
console.log('Expected: "1. d4 Nf6 2. c4 e6 3. Nc3 Bb4"');
console.log('Match:', formatted === '1. d4 Nf6 2. c4 e6 3. Nc3 Bb4');

// Test with odd number of moves (incomplete last move)
const testMovesOdd = ['e4', 'e5', 'Nf3'];
const formattedOdd = analyzer.formatMovesString(testMovesOdd);

console.log('\nTest odd moves array:', testMovesOdd);
console.log('Formatted string:', formattedOdd);
console.log('Expected: "1. e4 e5 2. Nf3"');
console.log('Match:', formattedOdd === '1. e4 e5 2. Nf3');
