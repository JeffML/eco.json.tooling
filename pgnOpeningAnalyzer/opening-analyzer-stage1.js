#!/usr/bin/env node

/**
 * Utility to create a sorted analysis of openings from the main database
 * This maintains the integrity of the sequential positions/moves relationship
 * in the main database while providing sorted views for analysis
 */

import fs from 'fs/promises';
import path from 'path';

class OpeningsAnalyzer {
    constructor(inputFile = 'output/openings.json', outputFile = 'output/analysis.json') {
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

    toMoveList(plies) {
        let moveList = ""

        plies.forEach((ply, i) => {
            if (i%2 === 0) {
                const moveNum = Math.floor(i/2) + 1
                moveList += `${moveNum}. ${ply} `
            } else {
                moveList += `${ply} `
            }       
        })

        return moveList
    }

    // Main function to create sorted analysis
    async createAnalysisReport() {
        console.log(`Loading database from ${this.inputFile}...`);
        const database = await this.loadDatabase();
        
        if (!database) {
            console.error('Failed to load database');
            return false;
        }
        
        const openingsSummary = {};
        
        // Process each opening record
        for (const [key, record] of Object.entries(database.openings)) {
            const opening = record.opening;
            const variation = record.variation || "_";
            const subvariation = record.subvariation || "_";
            
            // Initialize nested structure if needed
            if (!openingsSummary[opening]) {
                openingsSummary[opening] = {};
            }
            if (!openingsSummary[opening][variation]) {
                openingsSummary[opening][variation] = {};
            }
            
            // Convert transpositions to move lists
            const transpositions = [];
            if (record.transpositions && Array.isArray(record.transpositions)) {
                for (const transposition of record.transpositions) {
                    if (Array.isArray(transposition)) {
                        transpositions.push(this.toMoveList(transposition));
                    }
                }
            }
            
            // Store the data at the subvariation level
            openingsSummary[opening][variation][subvariation] = {
                eco: record.eco || "",
                moveList: this.toMoveList(record.moves || []),
                lastPosition: record.positions ? record.positions.at(-1) : "",
                transpositions: transpositions,
                occurrenceCount: record.occurrenceCount || 0
            };
        }
        
        // Save the analysis report
        try {
            await fs.writeFile(this.outputFile, JSON.stringify(openingsSummary, null, 2));
            console.log(`Analysis report saved to ${this.outputFile}`);
            console.log(`Processed ${Object.keys(database.openings).length} opening records`);
            console.log(`Created ${Object.keys(openingsSummary).length} unique openings`);
            return true;
        } catch (error) {
            console.error(`Failed to save analysis report: ${error.message}`);
            return false;
        }
    }
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
    const analyzer = new OpeningsAnalyzer();
    analyzer.createAnalysisReport().catch(console.error);
}

export { OpeningsAnalyzer };
