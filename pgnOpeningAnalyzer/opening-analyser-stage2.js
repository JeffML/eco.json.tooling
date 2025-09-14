#!/usr/bin/env node

/**
 * Second-stage analysis: Check which opening positions are found in the ECO book
 * Processes analysis.json and outputs candidates.json with unfound openings
 */

import fs from 'fs/promises';
import { Chess } from 'chess.js';
import { book } from '../utils.js';

class OpeningAnalyserStage2 {
    constructor(
        inputFile = 'output/analysis.json',
        outputFile = 'output/candidates.json'
    ) {
        this.inputFile = inputFile;
        this.outputFile = outputFile;
    }

    // Load the analysis data
    async loadAnalysis() {
        try {
            const data = await fs.readFile(this.inputFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error(
                `Failed to load analysis from ${this.inputFile}:`,
                error.message
            );
            return null;
        }
    }

    positionToFen() {
        const positionToFen = {};

        for (const fen in book) {
            const position = fen.split(' ')[0];

            positionToFen[position] ??= [];
            positionToFen[position].push(fen);
        }
        return positionToFen;
    }

    // Convert hierarchical analysis to sorted flat array
    flattenAndSort(analysisData) {
        const flattened = [];

        for (const [opening, variations] of Object.entries(analysisData)) {
            for (const [variation, subvariations] of Object.entries(
                variations
            )) {
                for (const [subvariation, data] of Object.entries(
                    subvariations
                )) {
                    // Calculate full FEN from moveList using chess.js PGN loading
                    const chess = new Chess();
                    let fullFEN = chess.fen(); // Default to starting position

                    try {
                        if (data.moveList && data.moveList.trim()) {
                            chess.loadPgn(data.moveList);
                            fullFEN = chess.fen();
                        }
                    } catch (error) {
                        console.warn(
                            `Failed to load PGN "${data.moveList}": ${error.message}`
                        );
                    }

                    const record = {
                        opening,
                        variation: variation === '_' ? undefined : variation,
                        subvariation:
                            subvariation === '_' ? undefined : subvariation,
                        ...data,
                        fullFEN,
                    };

                    // Remove fields with "_" values
                    Object.keys(record).forEach((key) => {
                        if (record[key] === '_') {
                            delete record[key];
                        }
                    });

                    flattened.push(record);
                }
            }
        }

        // Sort by opening, then variation, then subvariation
        return flattened.sort((a, b) => {
            // Primary sort by opening
            if (a.opening !== b.opening) {
                return a.opening.localeCompare(b.opening);
            }

            // Secondary sort by variation (handle undefined)
            const aVar = a.variation || '';
            const bVar = b.variation || '';
            if (aVar !== bVar) {
                return aVar.localeCompare(bVar);
            }

            // Tertiary sort by subvariation (handle undefined)
            const aSubVar = a.subvariation || '';
            const bSubVar = b.subvariation || '';
            return aSubVar.localeCompare(bSubVar);
        });
    }

    // Process the openings and check against book
    async processOpenings() {
        console.log(`Loading analysis from ${this.inputFile}...`);
        const analysisData = await this.loadAnalysis();

        if (!analysisData) {
            console.error('Failed to load analysis data');
            return false;
        }

        console.log('Flattening and sorting openings...');
        const sortedOpenings = this.flattenAndSort(analysisData);

        console.log(`Processing ${sortedOpenings.length} openings...`);
        console.log(`Book contains ${Object.keys(book).length} positions`);

        let foundOpenings = 0;
        let foundPositions = 0;

        const candidates = [];
        let processed = 0;

        const pos2Fen = this.positionToFen()

        for (const opening of sortedOpenings) {
            if (opening.occurrenceCount < 3) continue;

            processed++;

            if (book[opening.fullFEN]) {
                foundOpenings++;
            } else if (pos2Fen[opening.lastPosition]){
                foundPositions++
            }
            else {
                candidates.push(opening);
            }

            // Update progress in place
            if (processed % 10 === 0 || processed === sortedOpenings.length) {
                process.stdout.write(
                    `\rProcessed: ${processed}/${sortedOpenings.length} | Found: ${foundOpenings} | Candidates: ${candidates.length}`
                );
            }
        }

        console.log('\n'); // New line after progress

        // Save candidates
        try {
            await fs.writeFile(
                this.outputFile,
                JSON.stringify(candidates, null, 2)
            );
            console.log(`Candidates saved to ${this.outputFile}`);
        } catch (error) {
            console.error(`Failed to save candidates: ${error.message}`);
            return false;
        }

        // Final summary
        console.log('\n=== Stage 2 Analysis Complete ===');
        console.log(`Total openings processed: ${sortedOpenings.length}`);
        console.log(`Found in book: ${foundOpenings}`);
        console.log(`Found by position: ${foundPositions}`);
        console.log(`Candidates (not in book): ${candidates.length}`);
        console.log(
            `Coverage: ${(
                (foundOpenings / sortedOpenings.length) *
                100
            ).toFixed(1)}%`
        );

        return true;
    }
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
    const analyser = new OpeningAnalyserStage2();
    analyser.processOpenings().catch(console.error);
}

export { OpeningAnalyserStage2 };
