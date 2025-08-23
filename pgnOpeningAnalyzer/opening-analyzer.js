#!/usr/bin/env node

/**
 * Analysis phase - reads the data gathered by pgn-data-gatherer.js
 * and provides various analytical views and insights
 */

import fs from 'fs/promises';
import crypto from 'crypto';

class OpeningAnalyzer {
    constructor(inputFile = 'output/openings.json') {
        this.inputFile = inputFile;
        this.database = null;
    }

    // Load the gathered data
    async loadDatabase() {
        try {
            const data = await fs.readFile(this.inputFile, 'utf8');
            this.database = JSON.parse(data);
            console.log(`Loaded database with ${Object.keys(this.database.openings).length} opening records`);
            return true;
        } catch (error) {
            console.error(`Failed to load database from ${this.inputFile}:`, error.message);
            return false;
        }
    }

    // Group records by opening name
    groupByOpeningName() {
        const grouped = {};
        
        for (const [key, record] of Object.entries(this.database.openings)) {
            const primaryName = record.primaryName || record.name || 'Unknown';
            if (!grouped[primaryName]) {
                grouped[primaryName] = [];
            }
            grouped[primaryName].push({ key, ...record });
        }
        
        return grouped;
    }

    // Analyze name variations across all openings
    analyzeNameVariations() {
        const variations = {};
        let totalVariations = 0;
        
        for (const record of Object.values(this.database.openings)) {
            // Handle both old and new data formats
            const nameVariations = record.nameVariations || [record.primaryName || record.name || 'Unknown'];
            const variationCount = nameVariations.length;
            totalVariations += variationCount;
            
            if (!variations[variationCount]) {
                variations[variationCount] = 0;
            }
            variations[variationCount]++;
            
            // Track specific name variations that appear across multiple records
            for (const name of nameVariations) {
                const primaryName = record.primaryName || record.name || 'Unknown';
                if (name !== primaryName) {
                    // This is an alternative name
                    // Could analyze frequency of alternative names here
                }
            }
        }
        
        return {
            distributionByCount: variations,
            totalVariations,
            averageVariationsPerRecord: totalVariations / Object.keys(this.database.openings).length
        };
    }

    // Find the most popular opening variations
    getMostPopularOpenings(limit = 20) {
        const grouped = this.groupByOpeningName();
        
        return Object.entries(grouped)
            .map(([name, records]) => ({
                name,
                totalGames: records.reduce((sum, r) => sum + (r.occurrenceCount || r.count || 1), 0),
                variationCount: records.length,
                records: records.sort((a, b) => (b.occurrenceCount || b.count || 1) - (a.occurrenceCount || a.count || 1))
            }))
            .sort((a, b) => b.totalGames - a.totalGames)
            .slice(0, limit);
    }

    // Analyze position diversity
    analyzePositionDiversity() {
        const positions = new Set();
        const positionToRecords = {};
        
        for (const [key, record] of Object.entries(this.database.openings)) {
            const pos = record.lastCommonPosition || record.position || record.fen;
            if (!pos) continue; // Skip records without position data
            
            positions.add(pos);
            
            if (!positionToRecords[pos]) {
                positionToRecords[pos] = [];
            }
            positionToRecords[pos].push({ key, ...record });
        }
        
        // Find positions with multiple different move sequences
        const positionsWithMultiplePaths = Object.entries(positionToRecords)
            .filter(([pos, records]) => records.length > 1)
            .map(([pos, records]) => ({
                position: pos,
                recordCount: records.length,
                totalGames: records.reduce((sum, r) => sum + (r.occurrenceCount || r.count || 1), 0),
                moveVariations: records.map(r => {
                    const moves = r.moves || r.moveSequence || 'No moves recorded';
                    // Handle both array and string formats
                    if (Array.isArray(moves)) {
                        return moves.join(' ');
                    }
                    return moves;
                }),
                records
            }))
            .sort((a, b) => b.recordCount - a.recordCount);
        
        return {
            uniquePositions: positions.size,
            totalRecords: Object.keys(this.database.openings).length,
            positionsWithMultiplePaths,
            averageRecordsPerPosition: Object.keys(this.database.openings).length / positions.size
        };
    }

    // Find records that might be duplicates or very similar
    findPotentialDuplicates() {
        const duplicates = [];
        const records = Object.entries(this.database.openings);
        
        for (let i = 0; i < records.length; i++) {
            for (let j = i + 1; j < records.length; j++) {
                const [key1, record1] = records[i];
                const [key2, record2] = records[j];
                
                // Check for potential duplicates
                const pos1 = record1.lastCommonPosition || record1.position || record1.fen;
                const pos2 = record2.lastCommonPosition || record2.position || record2.fen;
                const samePosition = pos1 && pos2 && pos1 === pos2;
                
                const moves1 = record1.moves || record1.moveSequence || '';
                const moves2 = record2.moves || record2.moveSequence || '';
                const similarMoves = this.calculateMovesSimilarity(moves1, moves2);
                
                const name1 = record1.primaryName || record1.name || 'Unknown';
                const name2 = record2.primaryName || record2.name || 'Unknown';
                const samePrimaryName = name1 === name2;
                
                if (samePosition && similarMoves > 0.8) {
                    duplicates.push({
                        record1: { key: key1, ...record1 },
                        record2: { key: key2, ...record2 },
                        similarity: similarMoves,
                        samePosition,
                        samePrimaryName
                    });
                }
            }
        }
        
        return duplicates.sort((a, b) => b.similarity - a.similarity);
    }

    // Calculate similarity between two move strings or arrays
    calculateMovesSimilarity(moves1, moves2) {
        // Handle both array and string formats
        let moves1Array, moves2Array;
        
        if (Array.isArray(moves1)) {
            moves1Array = moves1;
        } else {
            moves1Array = moves1.split(' ').filter(m => !m.match(/^\d+\./));
        }
        
        if (Array.isArray(moves2)) {
            moves2Array = moves2;
        } else {
            moves2Array = moves2.split(' ').filter(m => !m.match(/^\d+\./));
        }
        
        const maxLength = Math.max(moves1Array.length, moves2Array.length);
        if (maxLength === 0) return 1;
        
        let matches = 0;
        const minLength = Math.min(moves1Array.length, moves2Array.length);
        
        for (let i = 0; i < minLength; i++) {
            if (moves1Array[i] === moves2Array[i]) {
                matches++;
            }
        }
        
        return matches / maxLength;
    }

    // Generate comprehensive analysis report
    async generateReport(outputFile = 'analysis-report.json') {
        if (!this.database) {
            console.error('Database not loaded. Call loadDatabase() first.');
            return false;
        }
        
        console.log('Generating comprehensive analysis...');
        
        const analysis = {
            metadata: {
                generatedAt: new Date().toISOString(),
                inputFile: this.inputFile,
                totalRecords: Object.keys(this.database.openings).length,
                totalGames: this.database.totalGames,
                lastUpdated: this.database.lastUpdated
            },
            popularOpenings: this.getMostPopularOpenings(50),
            nameVariations: this.analyzeNameVariations(),
            positionDiversity: this.analyzePositionDiversity(),
            potentialDuplicates: this.findPotentialDuplicates()
        };
        
        // Save the analysis
        await fs.writeFile(outputFile, JSON.stringify(analysis, null, 2));
        console.log(`Analysis report saved to ${outputFile}`);
        
        // Print summary to console
        this.printSummary(analysis);
        
        return true;
    }

    // Print analysis summary to console
    printSummary(analysis) {
        console.log('\n=== Opening Analysis Summary ===');
        console.log(`Total opening records: ${analysis.metadata.totalRecords}`);
        console.log(`Total games analyzed: ${analysis.metadata.totalGames}`);
        console.log(`Unique positions: ${analysis.positionDiversity.uniquePositions}`);
        console.log(`Average records per position: ${analysis.positionDiversity.averageRecordsPerPosition.toFixed(2)}`);
        console.log(`Average name variations per record: ${analysis.nameVariations.averageVariationsPerRecord.toFixed(2)}`);
        
        console.log('\n=== Top 10 Most Popular Openings ===');
        for (let i = 0; i < Math.min(10, analysis.popularOpenings.length); i++) {
            const opening = analysis.popularOpenings[i];
            console.log(`${i + 1}. ${opening.name}: ${opening.totalGames} games (${opening.variationCount} variations)`);
        }
        
        console.log('\n=== Positions with Multiple Move Paths ===');
        const multiPath = analysis.positionDiversity.positionsWithMultiplePaths.slice(0, 5);
        for (let i = 0; i < multiPath.length; i++) {
            const pos = multiPath[i];
            console.log(`${i + 1}. Position with ${pos.recordCount} different move sequences (${pos.totalGames} total games)`);
            pos.moveVariations.forEach((moves, idx) => {
                console.log(`   ${idx + 1}. ${moves}`);
            });
        }
        
        if (analysis.potentialDuplicates.length > 0) {
            console.log('\n=== Potential Duplicates Found ===');
            const topDuplicates = analysis.potentialDuplicates.slice(0, 3);
            for (let i = 0; i < topDuplicates.length; i++) {
                const dup = topDuplicates[i];
                console.log(`${i + 1}. Similarity: ${(dup.similarity * 100).toFixed(1)}%`);
                console.log(`   Record 1: ${dup.record1.primaryName} - ${dup.record1.moves}`);
                console.log(`   Record 2: ${dup.record2.primaryName} - ${dup.record2.moves}`);
            }
        }
    }

    // Main analysis function
    async analyze() {
        const loaded = await this.loadDatabase();
        if (!loaded) return false;
        
        return await this.generateReport();
    }
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
    const inputFile = process.argv[2] || 'output/openings.json';
    const analyzer = new OpeningAnalyzer(inputFile);
    analyzer.analyze().catch(console.error);
}

export { OpeningAnalyzer };
