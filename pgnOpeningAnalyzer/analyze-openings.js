#!/usr/bin/env node

/**
 * Utility to create a sorted analysis of openings from the main database
 * This maintains the integrity of the sequential positions/moves relationship
 * in the main database while providing sorted views for analysis
 */

import fs from 'fs/promises';
import path from 'path';

class OpeningsAnalyzer {
    constructor(inputFile = 'openings.json', outputFile = 'openings_sorted.json') {
        this.inputFile = inputFile;
        this.outputFile = outputFile;
    }

    // Load the main openings database
    async loadDatabase() {
        try {
            const data = await fs.readFile(this.inputFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error(`Failed to load database from ${this.inputFile}:`, error.message);
            return null;
        }
    }

    // Create sorted analysis without modifying the original data
    createSortedAnalysis(database) {
        const sortedDatabase = {
            ...database,
            openings: {}
        };

        // Process each opening
        for (const [openingName, opening] of Object.entries(database.openings)) {
            const sortedOpening = {
                ...opening,
                positions: [...opening.positions] // Create a copy
            };

            // Sort positions by count (descending), keeping the tuple format
            sortedOpening.positions.sort((a, b) => b[1] - a[1]);

            // Add analysis metadata
            sortedOpening.analysis = this.analyzeOpening(opening);

            sortedDatabase.openings[openingName] = sortedOpening;
        }

        return sortedDatabase;
    }

    // Analyze an opening to provide useful metadata
    analyzeOpening(opening) {
        if (!opening.positions || opening.positions.length === 0) {
            return {
                totalPositions: 0,
                mostCommonPosition: null,
                mostCommonCount: 0,
                sequentialPositions: 0,
                divergencePoints: []
            };
        }

        // Find the highest count
        const highestCount = Math.max(...opening.positions.map(([pos, count]) => count));
        
        // Find all positions with the highest count
        const mostCommonPositions = opening.positions
            .map(([pos, count], index) => ({ pos, count, index }))
            .filter(item => item.count === highestCount);

        // The deepest (latest in sequence) most common position
        const deepestMostCommon = mostCommonPositions[mostCommonPositions.length - 1];

        // Count how many positions follow the sequential pattern
        let sequentialPositions = 0;
        for (let i = 0; i < opening.positions.length; i++) {
            if (opening.positions[i][1] === opening.count) {
                sequentialPositions++;
            } else {
                break;
            }
        }

        // Find divergence points (positions where count drops significantly)
        const divergencePoints = [];
        for (let i = 1; i < opening.positions.length; i++) {
            const currentCount = opening.positions[i][1];
            const previousCount = opening.positions[i - 1][1];
            
            // Consider it a divergence if count drops by more than 20%
            if (currentCount < previousCount * 0.8) {
                divergencePoints.push({
                    position: i,
                    beforeCount: previousCount,
                    afterCount: currentCount,
                    dropPercentage: Math.round((1 - currentCount / previousCount) * 100)
                });
            }
        }

        return {
            totalPositions: opening.positions.length,
            mostCommonPosition: deepestMostCommon ? {
                position: deepestMostCommon.pos,
                count: deepestMostCommon.count,
                index: deepestMostCommon.index
            } : null,
            mostCommonCount: highestCount,
            sequentialPositions,
            divergencePoints,
            positionDistribution: this.getPositionDistribution(opening.positions)
        };
    }

    // Get distribution of position counts
    getPositionDistribution(positions) {
        const distribution = {};
        for (const [pos, count] of positions) {
            if (!distribution[count]) {
                distribution[count] = 0;
            }
            distribution[count]++;
        }
        return distribution;
    }

    // Generate summary statistics
    generateSummary(database) {
        const openings = Object.entries(database.openings);
        
        const summary = {
            totalOpenings: openings.length,
            totalGames: database.totalGames,
            lastUpdated: database.lastUpdated,
            statistics: {
                avgPositionsPerOpening: 0,
                maxPositions: 0,
                minPositions: Infinity,
                openingsWithDivergence: 0,
                mostCommonCounts: {}
            }
        };

        let totalPositions = 0;
        
        for (const [name, opening] of openings) {
            const posCount = opening.positions ? opening.positions.length : 0;
            totalPositions += posCount;
            
            summary.statistics.maxPositions = Math.max(summary.statistics.maxPositions, posCount);
            summary.statistics.minPositions = Math.min(summary.statistics.minPositions, posCount);
            
            if (opening.analysis && opening.analysis.divergencePoints.length > 0) {
                summary.statistics.openingsWithDivergence++;
            }
            
            // Track most common position counts
            if (opening.analysis && opening.analysis.mostCommonCount) {
                const count = opening.analysis.mostCommonCount;
                summary.statistics.mostCommonCounts[count] = (summary.statistics.mostCommonCounts[count] || 0) + 1;
            }
        }
        
        summary.statistics.avgPositionsPerOpening = totalPositions / openings.length;
        summary.statistics.minPositions = summary.statistics.minPositions === Infinity ? 0 : summary.statistics.minPositions;
        
        return summary;
    }

    // Main function to create sorted analysis
    async createSortedDatabase() {
        console.log(`Loading database from ${this.inputFile}...`);
        const database = await this.loadDatabase();
        
        if (!database) {
            console.error('Failed to load database');
            return false;
        }
        
        console.log(`Processing ${Object.keys(database.openings).length} openings...`);
        const sortedDatabase = this.createSortedAnalysis(database);
        
        console.log('Generating summary statistics...');
        const summary = this.generateSummary(sortedDatabase);
        sortedDatabase.summary = summary;
        
        console.log(`Writing sorted analysis to ${this.outputFile}...`);
        await fs.writeFile(this.outputFile, JSON.stringify(sortedDatabase, null, 2));
        
        console.log('\n=== Analysis Summary ===');
        console.log(`Total openings: ${summary.totalOpenings}`);
        console.log(`Total games: ${summary.totalGames}`);
        console.log(`Average positions per opening: ${summary.statistics.avgPositionsPerOpening.toFixed(2)}`);
        console.log(`Max positions in an opening: ${summary.statistics.maxPositions}`);
        console.log(`Min positions in an opening: ${summary.statistics.minPositions}`);
        console.log(`Openings with divergence points: ${summary.statistics.openingsWithDivergence}`);
        
        console.log('\nMost common position count distribution:');
        const sortedCounts = Object.entries(summary.statistics.mostCommonCounts)
            .sort((a, b) => parseInt(b[0]) - parseInt(a[0]))
            .slice(0, 10);
        
        for (const [count, openings] of sortedCounts) {
            console.log(`  ${count} games: ${openings} openings`);
        }
        
        console.log(`\nSorted analysis saved to ${this.outputFile}`);
        return true;
    }
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
    const analyzer = new OpeningsAnalyzer();
    analyzer.createSortedDatabase().catch(console.error);
}

export { OpeningsAnalyzer };
