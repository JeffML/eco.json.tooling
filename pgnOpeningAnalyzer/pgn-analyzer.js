#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import https from 'https';
import http from 'http';
import { URL } from 'url';
import { Chess } from 'chess.js';
import { config } from './config.js';
import { inspectZipFile, processZipFile } from './zipMethods.js';
import { 
    scrapePgnLinks, 
    loadPgnLinks, 
    savePgnLinks, 
    updatePgnLinksForSource 
} from './pgnLinkMethods.js';

// Chess position tracker using chess.js library
class ChessPosition {
    constructor() {
        this.chess = new Chess();
    }

    // Generate partial FEN (position only)
    toPartialFEN() {
        const fen = this.chess.fen();
        // Extract just the board position (first part before the first space)
        return fen.split(' ')[0];
    }

    // Parse algebraic notation and make move
    makeMove(moveStr) {
        try {
            const move = this.chess.move(moveStr);
            return move !== null;
        } catch (error) {
            return false;
        }
    }
}

class PGNAnalyzer {
    constructor() {
        this.config = config;

        this.database = {
            openings: {},
            lastUpdated: null,
            totalGames: 0,
        };

        this.pgnLinks = {
            sources: {},
            lastUpdated: null,
            totalLinks: 0,
        };
    }

    // Simple HTTP request function
    async makeRequest(url, options = {}) {
        return new Promise((resolve, reject) => {
            const client = url.startsWith('https://') ? https : http;
            const request = client.request(url, options, (response) => {
                const chunks = [];
                response.on('data', (chunk) => chunks.push(chunk));
                response.on('end', () => {
                    const body = Buffer.concat(chunks);
                    resolve({
                        statusCode: response.statusCode,
                        headers: response.headers,
                        body,
                    });
                });
            });

            request.on('error', reject);
            request.setTimeout(30000, () => {
                request.destroy();
                reject(new Error('Request timeout'));
            });

            request.end();
        });
    }

    // Get page metadata using HEAD request
    async getPageMeta(url) {
        try {
            const response = await this.makeRequest(url, { method: 'HEAD' });
            return {
                lastModified:
                    response.headers['last-modified'] || response.headers.date,
                contentType: response.headers['content-type'],
                contentLength: response.headers['content-length'],
            };
        } catch (error) {
            console.error(
                `Failed to get metadata for ${url}: ${error.message}`
            );
            return null;
        }
    }

    // Check if HTML page has changed
    async hasPageChanged(url, sourceName) {
        const meta = await this.getPageMeta(url);
        if (!meta) return true; // Assume changed if we can't get metadata

        const metaFile = path.join(
            this.config.cacheDir,
            `${sourceName}_page.json`
        );

        try {
            await fs.mkdir(this.config.cacheDir, { recursive: true });
            const oldMetaStr = await fs.readFile(metaFile, 'utf8');
            const oldMeta = JSON.parse(oldMetaStr);

            if (oldMeta.lastModified === meta.lastModified) {
                return false; // No change
            }
        } catch (error) {
            // File doesn't exist, treat as changed
        }

        await fs.writeFile(metaFile, JSON.stringify(meta, null, 2));
        return true; // Changed
    }

    // Enhanced download function with ZIP detection
    async downloadAndProcessPgn(url) {
        try {
            console.log(`Downloading: ${url}`);
            const response = await this.makeRequest(url);

            if (response.statusCode !== 200) {
                throw new Error(`HTTP ${response.statusCode}`);
            }

            const content = response.body;
            const fileName = path.basename(url).toLowerCase();

            // Check if it's a ZIP file
            if (fileName.endsWith('.zip')) {
                console.log(`Detected ZIP file: ${fileName}`);

                // First inspect to see if it contains PGN files
                const pgnEntries = await inspectZipFile(content);

                if (pgnEntries) {
                    // Process the ZIP file with callback to this.parsePGN
                    return await processZipFile(content, url, (pgnContent) => {
                        this.parsePGN(pgnContent);
                    });
                } else {
                    console.log(`ZIP file contains no PGN files: ${fileName}`);
                    return 0;
                }
            } else {
                // Handle regular PGN files
                console.log(`Processing PGN file: ${fileName}`);
                this.parsePGN(content);
                return 1;
            }
        } catch (error) {
            console.error(
                `Failed to download/process ${url}: ${error.message}`
            );
            return 0;
        }
    }

    // Check if PGN file has changed
    async hasPgnChanged(url) {
        const meta = await this.getPageMeta(url);
        if (!meta) return true; // Assume changed if we can't get metadata

        const urlHash = crypto.createHash('md5').update(url).digest('hex');
        const metaFile = path.join(this.config.cacheDir, `pgn_${urlHash}.json`);

        try {
            const oldMetaStr = await fs.readFile(metaFile, 'utf8');
            const oldMeta = JSON.parse(oldMetaStr);

            if (
                oldMeta.lastModified === meta.lastModified &&
                oldMeta.contentLength === meta.contentLength
            ) {
                return false; // No change
            }
        } catch (error) {
            // File doesn't exist, treat as changed
        }

        await fs.writeFile(metaFile, JSON.stringify(meta, null, 2));
        return true; // Changed
    }

    // Parse PGN headers
    parseHeaders(headerText) {
        const headers = {};
        const lines = headerText.split('\n');

        for (const line of lines) {
            const match = line.match(/\[(\w+)\s+"([^"]+)"\]/);
            if (match) {
                headers[match[1]] = match[2];
            }
        }

        return headers;
    }

    // Clean and parse moves
    parseMoves(movesText) {
        let cleaned = movesText
            .replace(/\{[^}]*\}/g, '') // Remove comments
            .replace(/\([^)]*\)/g, '') // Remove variations
            .replace(/\$\d+/g, '') // Remove annotations
            .replace(/[!?+#]+/g, '') // Remove symbols
            .replace(/\d+\.+/g, '') // Remove move numbers
            .replace(/\s+/g, ' ') // Normalize spaces
            .trim();

        const moves = cleaned
            .split(' ')
            .filter(
                (move) => move && !['1-0', '0-1', '1/2-1/2', '*'].includes(move)
            )
            .slice(0, this.config.maxPlies); // Limit to maxPlies (half-moves)

        return moves;
    }

    // Process a single game
    processGame(gameText) {
        const parts = gameText.split('\n\n');
        if (parts.length < 2) return null;

        const headerText = parts[0];
        const movesText = parts.slice(1).join('\n\n');

        const headers = this.parseHeaders(headerText);
        
        // Skip games with Variant tag (chess variants, not standard chess)
        if (headers.Variant) {
            return null;
        }
        
        const opening = headers.Opening;
        const variation = headers.Variation || '';
        const subvariation = headers.Subvariation || '';
        const eco = headers.ECO || '';

        if (!opening) return null;

        // Build full opening name with variation and subvariation
        let fullOpeningName = opening;

        if (variation) {
            fullOpeningName += `: ${variation}`;
        }

        if (subvariation) {
            fullOpeningName += ` - ${subvariation}`;
        }

        const moves = this.parseMoves(movesText);
        if (moves.length === 0) return null;

        // Generate FEN positions for each move
        const positions = this.generatePositions(moves);

        return {
            opening: fullOpeningName,
            baseOpening: opening,
            variation,
            subvariation,
            eco,
            moves,
            positions, // Array of partial FEN strings
        };
    }

    // Generate FEN positions for each move
    generatePositions(moves) {
        const position = new ChessPosition();
        const positions = [];
        
        // Add starting position
        positions.push(position.toPartialFEN());

        // Apply each move and capture position
        for (let i = 0; i < Math.min(moves.length, this.config.maxPlies); i++) {
            const move = moves[i];
            if (position.makeMove(move)) {
                positions.push(position.toPartialFEN());
            } else {
                // If move parsing fails, show the move sequence leading up to the failure
                const moveSequence = this.formatMovesString(moves.slice(0, i + 1));
                const failedMoveNumber = Math.floor(i / 2) + 1;
                const isWhiteMove = i % 2 === 0;
                const moveColor = isWhiteMove ? 'White' : 'Black';
                
                console.warn(`Failed to parse move "${move}" (${moveColor} move ${failedMoveNumber}) at position ${i + 1}`);
                console.warn(`Move sequence: ${moveSequence}`);
                console.warn(`Current position: ${position.toPartialFEN()}`);
                break;
            }
        }

        return positions;
    }

    addOpening(gameData) {
        const { opening, baseOpening, variation, subvariation, eco, moves, positions } =
            gameData;

        if (!this.database.openings[opening]) {
            this.database.openings[opening] = {
                baseOpening,
                variation,
                subvariation,
                eco,
                count: 0,
                moves: this.formatMovesString(moves),
                positions: positions.map(pos => [pos, 1]), // Store as [position, count] tuples
            };
        } else {
            const entry = this.database.openings[opening];
            
            // Update position counts and find divergence point
            const divergenceInfo = this.updatePositionCounts(entry, positions, moves, opening);
            
            // If there's a divergence, log it
            if (divergenceInfo) {
                this.logDivergence(divergenceInfo);
            }
            
            // Extend positions if this game is longer
            if (positions.length > entry.positions.length) {
                // Extend the existing array with new positions
                const currentLength = entry.positions.length;
                const newPositions = positions.slice(currentLength).map(pos => [pos, 1]);
                entry.positions = entry.positions.concat(newPositions);
                entry.moves = this.formatMovesString(moves);
            }
            
            // Sort positions by count (descending order)
            entry.positions.sort((a, b) => b[1] - a[1]);
        }

        const entry = this.database.openings[opening];
        entry.count++;

        if (!entry.eco && eco) {
            entry.eco = eco;
        }

        if (!entry.variation && variation) {
            entry.variation = variation;
        }

        if (!entry.subvariation && subvariation) {
            entry.subvariation = subvariation;
        }
    }

    // Update position counts and detect divergence
    updatePositionCounts(entry, newPositions, newMoves, openingName) {
        const existingPositions = entry.positions; // Array of [position, count] tuples
        let divergenceIndex = -1;
        
        // Check each position for matches and find first divergence
        const minLength = Math.min(existingPositions.length, newPositions.length);
        for (let i = 0; i < minLength; i++) {
            const existingPosition = existingPositions[i][0]; // Extract position from tuple
            if (existingPosition === newPositions[i]) {
                existingPositions[i][1]++; // Increment count
            } else {
                // Found divergence
                divergenceIndex = i;
                break;
            }
        }
        
        // If we found a divergence, return info for logging
        if (divergenceIndex >= 0) {
            return {
                openingName,
                divergenceIndex,
                storedPosition: existingPositions[divergenceIndex][0],
                newPosition: newPositions[divergenceIndex],
                moveNumber: divergenceIndex,
                newMoves: this.formatMovesString(newMoves),
                storedMoves: entry.moves
            };
        }
        
        // If no divergence found but new game has more moves, it's an extension
        if (newPositions.length > existingPositions.length) {
            // All existing positions matched, so this is just a longer continuation
            return null; // No divergence to log
        }
        
        // If new game is same length or shorter and no divergence found, all positions matched
        return null;
    }

    // Log divergence to file
    async logDivergence(divergenceInfo) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            openingName: divergenceInfo.openingName,
            divergenceAtMove: divergenceInfo.divergenceIndex,
            storedPosition: divergenceInfo.storedPosition,
            newPosition: divergenceInfo.newPosition,
            storedMoves: divergenceInfo.storedMoves,
            newMoves: divergenceInfo.newMoves
        };

        try {
            // Ensure the file exists or create it
            let existingData = [];
            try {
                const fileContent = await fs.readFile('divergence.json', 'utf8');
                existingData = JSON.parse(fileContent);
            } catch (error) {
                // File doesn't exist, start with empty array
            }

            existingData.push(logEntry);
            await fs.writeFile('divergence.json', JSON.stringify(existingData, null, 2));
        } catch (error) {
            console.error('Failed to log divergence:', error.message);
        }
    }

    // Parse moves string back to array for comparison
    parseMovesFromString(movesString) {
        if (!movesString) return [];
        return movesString.split(/\d+\.\s*/).filter(Boolean).join(' ').split(' ').filter(Boolean);
    }

    // Format moves array into proper chess notation string
    formatMovesString(moves) {
        if (!moves || moves.length === 0) return '';
        
        let formatted = '';
        for (let i = 0; i < moves.length; i += 2) {
            const moveNumber = Math.floor(i / 2) + 1;
            const whiteMove = moves[i];
            const blackMove = moves[i + 1];
            
            if (i > 0) formatted += ' ';
            
            formatted += `${moveNumber}. ${whiteMove}`;
            if (blackMove) {
                formatted += ` ${blackMove}`;
            }
        }
        return formatted;
    }

    // Parse PGN content
    parsePGN(content) {
        const text = content.toString('utf8');
        const games = text.split(/\n\s*\n(?=\[Event)/);

        let processed = 0;

        for (const gameText of games) {
            if (!gameText.trim()) continue;

            const gameData = this.processGame(gameText);
            if (gameData) {
                this.addOpening(gameData);
                processed++;

                if (processed % 500 === 0) {
                    console.log(`Processed ${processed} games...`);
                }
            }
        }

        this.database.totalGames += processed;
        console.log(`Finished processing ${processed} games`);
    }

    // Load existing database
    async loadDatabase() {
        try {
            const data = await fs.readFile(this.config.outputFile, 'utf8');
            this.database = JSON.parse(data);
            
            // Convert old format to new tuple format (backward compatibility)
            for (const [openingName, entry] of Object.entries(this.database.openings)) {
                if (entry.positionCounts && Array.isArray(entry.positions) && !Array.isArray(entry.positions[0])) {
                    // Old format: separate positions and positionCounts arrays
                    const newPositions = [];
                    for (let i = 0; i < entry.positions.length; i++) {
                        const position = entry.positions[i];
                        const count = entry.positionCounts[i] || 1;
                        newPositions.push([position, count]);
                    }
                    // Sort by count descending
                    newPositions.sort((a, b) => b[1] - a[1]);
                    entry.positions = newPositions;
                    delete entry.positionCounts; // Remove old format
                } else if (entry.positions && !entry.positionCounts && !Array.isArray(entry.positions[0])) {
                    // Very old format: just positions array, no counts
                    entry.positions = entry.positions.map(pos => [pos, entry.count || 1]);
                    entry.positions.sort((a, b) => b[1] - a[1]);
                }
            }
            
            console.log(
                `Loaded existing database with ${
                    Object.keys(this.database.openings).length
                } openings`
            );
        } catch (error) {
            console.log('No existing database found, starting fresh');
        }
    }

    // Save database
    async saveDatabase() {
        this.database.lastUpdated = new Date().toISOString();
        await fs.writeFile(
            this.config.outputFile,
            JSON.stringify(this.database, null, 2)
        );
        console.log(
            `Saved database with ${
                Object.keys(this.database.openings).length
            } openings`
        );
    }

    // Update PGN links from HTML sources
    async updatePgnLinks() {
        console.log('Checking for new PGN links...');

        this.pgnLinks = await loadPgnLinks(this.config.linksFile);
        let linksUpdated = false;

        for (const source of this.config.htmlSources) {
            if (!source.enabled) continue;

            // Check if HTML page has changed
            if (!(await this.hasPageChanged(source.url, source.name))) {
                console.log(`No changes detected in ${source.name} page`);
                continue;
            }

            // Scrape for new links
            const links = await scrapePgnLinks(source, this.makeRequest.bind(this), this.config.linkPatterns);
            if (updatePgnLinksForSource(this.pgnLinks, source.name, links)) {
                linksUpdated = true;
            }
        }

        if (linksUpdated) {
            await savePgnLinks(this.pgnLinks, this.config.linksFile);
        }

        return linksUpdated;
    }

    // Check if PGN file has been processed before
    isPgnProcessed(url, sourceName) {
        const source = this.pgnLinks.sources[sourceName];
        if (!source || !source.processedFiles) return false;

        return source.processedFiles.has(url);
    }

    // Mark PGN file as processed
    markPgnAsProcessed(url, sourceName) {
        const source = this.pgnLinks.sources[sourceName];
        if (!source) return;

        if (!source.processedFiles) {
            source.processedFiles = new Set();
        }

        source.processedFiles.add(url);
    }

    // Get unprocessed PGN files for a source (limited count)
    getUnprocessedPgnFiles(sourceName, maxCount) {
        const source = this.pgnLinks.sources[sourceName];
        if (!source || !source.links) return [];

        const unprocessed = source.links.filter(
            (url) => !this.isPgnProcessed(url, sourceName)
        );

        // Return up to maxCount files
        return unprocessed.slice(0, maxCount);
    }

    // Process all PGN files (with limits)
    async processPgnFiles() {
        console.log('Processing PGN files...');

        let totalProcessed = 0;
        const maxPerSite = this.config.maxFilesPerSitePerSession;

        for (const [sourceName, sourceData] of Object.entries(
            this.pgnLinks.sources
        )) {
            console.log(`\nProcessing files from ${sourceName}...`);

            // Get unprocessed files for this source (limited)
            const unprocessedUrls = this.getUnprocessedPgnFiles(
                sourceName,
                maxPerSite
            );

            if (unprocessedUrls.length === 0) {
                console.log(`No unprocessed files for ${sourceName}`);
                continue;
            }

            console.log(
                `Found ${unprocessedUrls.length} unprocessed files for ${sourceName} (limit: ${maxPerSite})`
            );

            let processedForSource = 0;

            for (const url of unprocessedUrls) {
                try {
                    // Check if file has changed (skip if unchanged)
                    if (!(await this.hasPgnChanged(url))) {
                        console.log(
                            `No changes in file: ${path.basename(url)}`
                        );
                        // Still mark as processed since we checked it
                        this.markPgnAsProcessed(url, sourceName);
                        continue;
                    }

                    // Use enhanced download function that handles ZIP files
                    const filesProcessed = await this.downloadAndProcessPgn(
                        url
                    );

                    if (filesProcessed > 0) {
                        this.markPgnAsProcessed(url, sourceName);
                        processedForSource += filesProcessed;
                        totalProcessed += filesProcessed;
                        console.log(
                            `Successfully processed ${filesProcessed} file(s) from ${path.basename(
                                url
                            )}`
                        );
                    } else {
                        console.log(
                            `No processable content in ${path.basename(url)}`
                        );
                        // Still mark as processed to avoid retrying
                        this.markPgnAsProcessed(url, sourceName);
                    }
                } catch (error) {
                    console.error(`Error processing ${url}: ${error.message}`);
                    // Don't mark as processed if there was an error
                }
            }

            console.log(
                `Processed ${processedForSource} file(s) from ${sourceName}`
            );
        }

        // Save updated processed files list
        if (totalProcessed > 0) {
            await savePgnLinks(this.pgnLinks, this.config.linksFile);
        }

        return totalProcessed;
    }

    // Enhanced statistics
    printStats() {
        const openings = Object.entries(this.database.openings).sort(
            (a, b) => b[1].count - a[1].count
        );

        console.log('\n=== Statistics ===');
        console.log(`Total openings: ${openings.length}`);
        console.log(`Total games: ${this.database.totalGames}`);
        console.log(`Total PGN links: ${this.pgnLinks.totalLinks}`);
        console.log(`Last updated: ${this.database.lastUpdated}`);

        // Show processed vs total files per source
        console.log('\nFiles processed per source:');
        for (const [sourceName, sourceData] of Object.entries(
            this.pgnLinks.sources
        )) {
            const total = sourceData.links.length;
            const processed = sourceData.processedFiles
                ? sourceData.processedFiles.size
                : 0;
            const remaining = total - processed;
            console.log(
                `  ${sourceName}: ${processed}/${total} processed (${remaining} remaining)`
            );
        }

        console.log('\nTop 10 openings with positions:');
        for (let i = 0; i < Math.min(10, openings.length); i++) {
            const [name, data] = openings[i];
            const positionCount = data.positions ? data.positions.length : 0;
            const highestPositionCount = data.positions && data.positions.length > 0 ? data.positions[0][1] : 0;
            console.log(`${i + 1}. ${name}: ${data.count} games (${positionCount} positions tracked, highest count: ${highestPositionCount})`);
        }

        // Show opening hierarchy statistics
        const baseOpenings = {};
        for (const [name, data] of Object.entries(this.database.openings)) {
            const base = data.baseOpening || name;
            if (!baseOpenings[base]) {
                baseOpenings[base] = {
                    count: 0,
                    variations: 0,
                };
            }
            baseOpenings[base].count += data.count;
            baseOpenings[base].variations++;
        }

        const topBaseOpenings = Object.entries(baseOpenings)
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, 5);

        console.log('\nTop 5 base openings with variations:');
        for (let i = 0; i < topBaseOpenings.length; i++) {
            const [name, data] = topBaseOpenings[i];
            console.log(
                `${i + 1}. ${name}: ${data.count} games (${
                    data.variations
                } variations)`
            );
        }
    }

    // Schedule periodic runs
    schedule() {
        console.log('Running initial analysis...');
        this.run();

        // Run every 6 hours
        setInterval(() => {
            console.log('\nRunning scheduled analysis...');
            this.run();
        }, 6 * 60 * 60 * 1000);

        console.log('Scheduler started (every 6 hours)');
    }

    // Main run function
    async run() {
        console.log('Starting PGN analysis...');

        await this.loadDatabase();

        // First update PGN links
        const linksUpdated = await this.updatePgnLinks();

        // Then process PGN files
        const filesProcessed = await this.processPgnFiles();

        if (linksUpdated || filesProcessed > 0) {
            await this.saveDatabase();
            this.printStats();
        } else {
            console.log('No updates needed');
        }

        console.log('Analysis complete');
    }
}

// Main execution
const isMainModule = process.argv[1] === new URL(import.meta.url).pathname;

if (isMainModule) {
    const analyzer = new PGNAnalyzer();

    if (process.argv.includes('--schedule')) {
        analyzer.schedule();
    } else {
        analyzer.run();
    }
}

export { PGNAnalyzer };
