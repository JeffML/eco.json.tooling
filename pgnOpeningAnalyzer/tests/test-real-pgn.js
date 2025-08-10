#!/usr/bin/env node

import { PGNAnalyzer } from '../pgn-analyzer.js';
import fs from 'fs';

console.log('Testing with real PGN file: testInput/ttbl1706e25.pgn\n');

// Read the PGN file
const pgnContent = fs.readFileSync('../testInput/ttbl1706e25.pgn', 'utf8');

console.log(`PGN file size: ${(pgnContent.length / 1024).toFixed(1)} KB`);
console.log(`Lines: ${pgnContent.split('\n').length}`);

// Count games (rough estimate by counting [Event tags)
const gameCount = (pgnContent.match(/\[Event "/g) || []).length;
console.log(`Estimated games: ${gameCount}\n`);

console.log('Starting analysis...');
const startTime = Date.now();

const analyzer = new PGNAnalyzer();
analyzer.parsePGN(pgnContent);

const endTime = Date.now();
console.log(`\nAnalysis completed in ${(endTime - startTime) / 1000}s`);

console.log('\n=== RESULTS ===');
const openings = Object.keys(analyzer.database.openings);
console.log(`Total openings found: ${openings.length}`);

if (openings.length > 0) {
    console.log('\nTop 10 openings by position count:');
    const sortedOpenings = openings
        .map(name => ({
            name,
            opening: analyzer.database.openings[name],
            totalPositions: analyzer.database.openings[name].positions.length
        }))
        .sort((a, b) => b.totalPositions - a.totalPositions)
        .slice(0, 10);

    sortedOpenings.forEach((item, index) => {
        console.log(`${index + 1}. ${item.name}`);
        console.log(`   Moves: ${item.opening.moves}`);
        console.log(`   Positions: ${item.totalPositions}`);
        console.log(`   Base Opening: ${item.opening.baseOpening}`);
        
        // Show first few positions with their counts
        const topPositions = item.opening.positions.slice(0, 3);
        console.log(`   Top positions:`);
        topPositions.forEach((tuple, i) => {
            const [position, count] = tuple;
            console.log(`     ${i + 1}. ${position} (${count}x)`);
        });
        console.log('');
    });
}

// Check for any errors in the log
if (analyzer.errorLog && analyzer.errorLog.length > 0) {
    console.log(`\n=== ERRORS (${analyzer.errorLog.length}) ===`);
    analyzer.errorLog.slice(0, 5).forEach((error, index) => {
        console.log(`${index + 1}. ${error.error}`);
        console.log(`   Game: ${error.gameInfo.white} vs ${error.gameInfo.black}`);
        console.log(`   Opening: ${error.gameInfo.opening || 'Unknown'}`);
        console.log(`   Move sequence: ${error.moveSequence}`);
        console.log('');
    });
    
    if (analyzer.errorLog.length > 5) {
        console.log(`... and ${analyzer.errorLog.length - 5} more errors`);
    }
}

console.log('\nTest completed!');
