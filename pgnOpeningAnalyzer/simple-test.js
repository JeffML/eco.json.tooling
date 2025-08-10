#!/usr/bin/env node

import { PGNAnalyzer } from './pgn-analyzer.js';

// Create a simple test
const analyzer = new PGNAnalyzer();

// Test direct move parsing
const testMoves = ['e4', 'e5', 'Nf3', 'Nc6', 'exf6']; // This should fail on the last move

console.log('Testing move sequence parsing...');
const positions = analyzer.generatePositions(testMoves);
console.log(`Generated ${positions.length} positions`);
