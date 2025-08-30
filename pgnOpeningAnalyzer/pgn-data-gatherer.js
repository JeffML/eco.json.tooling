#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import https from 'https';
import http from 'http';
import { Chess } from 'chess.js';
import { config } from './config.js';
import { inspectZipFile, processZipFile } from './zipMethods.js';
import {
    scrapePgnLinks,
    loadPgnLinks,
    savePgnLinks,
    updatePgnLinksForSource,
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

class PGNDataGatherer {
    constructor() {
        this.config = config;

        this.database = {
            openings: {}, // Will be keyed by position+moves hash
            lastUpdated: null,
            totalGames: 0,
        };

        this.pgnLinks = {
            sources: {},
            lastUpdated: null,
            totalLinks: 0,
        };

        // Ensure cache directory exists
        this.ensureCacheDir();
    }

    // Ensure cache directory exists
    async ensureCacheDir() {
        try {
            await fs.mkdir(this.config.cacheDir, { recursive: true });
        } catch (error) {
            // Directory might already exist
        }
    }

    // Generate a hash for keyComponents
    generateOpeningKey(keyComponents) {
        if (!Array.isArray(keyComponents)) throw Error('expected array');
        return crypto
            .createHash('md5')
            .update(keyComponents.join())
            .digest('hex');
    }

    // Simple HTTP request function with enhanced capabilities
    async makeRequest(url, options = {}) {
        return new Promise((resolve, reject) => {
            const client = url.startsWith('https://') ? https : http;
            const request = client.request(
                url,
                {
                    ...options,
                    timeout: this.config.requestTimeout || 30000,
                    headers: {
                        'User-Agent':
                            'Mozilla/5.0 (compatible; PGN-Analyzer/1.0)',
                        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                        ...options.headers,
                    },
                },
                (response) => {
                    const chunks = [];
                    response.on('data', (chunk) => chunks.push(chunk));
                    response.on('end', () => {
                        const body = Buffer.concat(chunks);
                        resolve({
                            statusCode: response.statusCode,
                            headers: response.headers,
                            body,
                            bodyText: body.toString('utf8'), // Also provide text version
                        });
                    });
                }
            );

            request.on('error', reject);
            request.setTimeout(this.config.requestTimeout || 30000, () => {
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
                etag: response.headers['etag'] || null,
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

            const fileName = path.basename(url).toLowerCase();

            // Check if it's a ZIP file
            if (fileName.endsWith('.zip')) {
                console.log(`Detected ZIP file: ${fileName}`);

                // Use raw buffer for ZIP files
                const zipBuffer = response.body;

                // Validate buffer size
                if (zipBuffer.length === 0) {
                    console.error(`Empty ZIP file: ${fileName}`);
                    return 0;
                }

                console.log(`ZIP file size: ${zipBuffer.length} bytes`);

                // First inspect to see if it contains PGN files
                const pgnEntries = await inspectZipFile(zipBuffer);

                if (pgnEntries && pgnEntries.length > 0) {
                    // Process the ZIP file with callback to this.parsePGN
                    return await processZipFile(
                        zipBuffer,
                        url,
                        (pgnContent) => {
                            this.parsePGN(pgnContent);
                        }
                    );
                } else {
                    console.log(`ZIP file contains no PGN files: ${fileName}`);
                    return 0;
                }
            } else {
                // Handle regular PGN files - use text version
                console.log(`Processing PGN file: ${fileName}`);
                this.parsePGN(response.bodyText);
                return 1;
            }
        } catch (error) {
            console.error(
                `Failed to download/process ${url}: ${error.message}`
            );

            // For ZIP files, try to provide more specific error information
            if (url.toLowerCase().endsWith('.zip')) {
                console.error('ZIP processing failed. Possible solutions:');
                console.error(
                    '- File may be corrupted or use unsupported compression'
                );
                console.error(
                    '- Try downloading manually and extracting to .pgn files'
                );
                console.error(
                    '- Some ZIP files may have encoding or naming issues'
                );
                console.error(
                    '- Consider using a different source or file format'
                );

                // Attempt to save the problematic file for manual inspection
                try {
                    const fileName = path.basename(url);
                    const debugPath = path.join(
                        this.config.cacheDir || './cache',
                        `failed_${fileName}`
                    );
                    await fs.writeFile(
                        debugPath,
                        response?.body || Buffer.alloc(0)
                    );
                    console.log(`Saved problematic ZIP file to: ${debugPath}`);
                } catch (saveError) {
                    console.error(
                        `Could not save file for debugging: ${saveError.message}`
                    );
                }
            }

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

        let opening = headers.Opening;
        let variation = headers.Variation || '';
        let subvariation = headers.Subvariation || '';

        if (!opening) return null;

        // Enhanced parsing: if no variation header, try parsing opening string
        if (!variation) {
            const parts = opening.split(/[:,]/);
            if (parts.length > 1) {
                opening = parts[0].trim();
                variation = parts[1].trim();
                if (parts.length > 2) {
                    subvariation = parts.slice(2).join(', ').trim();
                }
            }
        }

        const eco = headers.ECO || '';

        const moves = this.parseMoves(movesText);
        if (moves.length === 0) return null;

        // Generate FEN positions for each move
        const positions = this.generatePositions(moves);

        return {
            opening,
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
                const moveSequence = this.formatMovesString(
                    moves.slice(0, i + 1)
                );
                const failedMoveNumber = Math.floor(i / 2) + 1;
                const isWhiteMove = i % 2 === 0;
                const moveColor = isWhiteMove ? 'White' : 'Black';

                console.warn(
                    `Failed to parse move "${move}" (${moveColor} move ${failedMoveNumber}) at position ${
                        i + 1
                    }`
                );
                console.warn(`Move sequence: ${moveSequence}`);
                console.warn(`Current position: ${position.toPartialFEN()}`);
                break;
            }
        }

        return positions;
    }

    // Find the last common position by comparing with existing openings
    findLastCommonPosition(existingPositions, newPositions) {
        if (
            !existingPositions ||
            !newPositions ||
            existingPositions.length === 0 ||
            newPositions.length === 0
        ) {
            return { lastCommon: null, lastCommonIndex: -1 };
        }

        // Find the last common position by comparing from the start
        let lastCommonIndex = -1;
        const minLength = Math.min(
            existingPositions.length,
            newPositions.length
        );

        for (let i = minLength - 1; i > 0; i--) {
            if (existingPositions[i] === newPositions[i]) {
                lastCommonIndex = i;
                break;
            }
        }

        // Return null if no common positions found
        if (lastCommonIndex === -1) {
            return { lastCommon: null, lastCommonIndex };
        }

        return {
            lastCommon: existingPositions[lastCommonIndex],
            lastCommonIndex,
        };
    }

    addTransposition(existing, transposition) {
        existing.transpositions ??= [];

        let found = false;
        for (let trans of existing.transpositions) {
            if (
                JSON.stringify(trans) ===
                JSON.stringify(transposition)
            ) {
                found = true;
                break; //already have it
            }
        }
        if (!found) existing.transpositions.push(transposition);
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

    // Add or update opening record
    addOpening(gameData) {
        const { opening, variation, subvariation, eco, moves, positions } =
            gameData;

        // Generate key based on position + moves
        const openingKey = this.generateOpeningKey([
            opening,
            variation,
            subvariation,
        ]);

        // Check if this exact position+moves combination exists
        if (this.database.openings[openingKey]) {
            const existing = this.database.openings[openingKey];

            // Find the last common position
            const { lastCommonIndex } = this.findLastCommonPosition(
                existing.positions,
                positions
            );

            if (lastCommonIndex >= 0) {
                // Truncate to the common position
                existing.moves = existing.moves.slice(0, lastCommonIndex);
                existing.positions = existing.positions.slice(0, lastCommonIndex + 1);
                
                const truncatedMoves = moves.slice(0, lastCommonIndex);

                console.assert(truncatedMoves.length !== 0, "No moves??")

                if (
                    JSON.stringify(truncatedMoves) !==
                    JSON.stringify(existing.moves)
                ) {
                    this.addTransposition(existing, truncatedMoves);
                }
            }

            existing.occurrenceCount += 1;
        } else {
            // New opening record
            const fullName = this.buildFullOpeningName(
                opening,
                variation,
                subvariation
            );

            this.database.openings[openingKey] = {
                opening,
                nameVariations: [fullName],
                variation: variation,
                subvariation: subvariation,
                eco: eco,
                moves,
                positions,
                lastCommonPosition: positions.at(-1),
                occurrenceCount: 1,
            };
        }

        this.database.totalGames++;
    }

    // Build full opening name
    buildFullOpeningName(opening, variation, subvariation) {
        let fullName = opening;
        if (variation) {
            fullName += `: ${variation}`;
        }
        if (subvariation) {
            fullName += ` - ${subvariation}`;
        }
        return fullName;
    }

    // Format moves array into proper chess notation string (for display/reporting)
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
        const text =
            typeof content === 'string' ? content : content.toString('utf8');
        const games = text.split(/\n\s*\n(?=\[Event)/);

        let processed = 0;
        let errors = 0;

        for (const gameText of games) {
            if (!gameText.trim()) continue;

            try {
                const gameData = this.processGame(gameText);
                if (gameData) {
                    this.addOpening(gameData);
                    processed++;

                    if (processed % 500 === 0) {
                        console.log(`Processed ${processed} games...`);
                    }
                }
            } catch (error) {
                errors++;
                if (errors < 10) {
                    // Only log first 10 errors to avoid spam
                    console.error(`Error processing game: ${error.message}`);
                }
            }
        }

        console.log(`Finished processing ${processed} games, ${errors} errors`);
        return processed;
    }

    // Load existing database
    async loadDatabase() {
        try {
            const data = await fs.readFile(this.config.outputFile, 'utf8');
            this.database = JSON.parse(data);

            console.log(
                `Loaded existing database with ${
                    Object.keys(this.database.openings).length
                } opening records`
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
            } opening records`
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
            const links = await scrapePgnLinks(
                source,
                this.makeRequest.bind(this),
                this.config.linkPatterns
            );
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

    // Process a single source (URL or file) - enhanced method
    async processSource(source) {
        console.log(`\n=== Processing source: ${source} ===`);

        if (source.startsWith('http')) {
            // URL - check if changed before downloading
            if (await this.hasPgnChanged(source)) {
                return await this.downloadAndProcessPgn(source);
            } else {
                console.log(`No changes detected for ${source}, skipping...`);
                return 0;
            }
        } else {
            // Local file
            try {
                const content = await fs.readFile(source, 'utf8');
                console.log(`Processing local file: ${source}`);
                return this.parsePGN(content);
            } catch (error) {
                console.error(
                    `Failed to read local file ${source}: ${error.message}`
                );
                return 0;
            }
        }
    }

    // Process multiple sources
    async processSources(sources) {
        let totalProcessed = 0;

        for (const source of sources) {
            try {
                const processed = await this.processSource(source);
                totalProcessed += processed;
            } catch (error) {
                console.error(
                    `Failed to process source ${source}: ${error.message}`
                );
            }
        }

        console.log(`\n=== Total: ${totalProcessed} files processed ===`);
        return totalProcessed;
    }

    // Scrape PGN links from a website
    async scrapeLinks(baseUrl) {
        console.log(`\n=== Scraping PGN links from: ${baseUrl} ===`);

        try {
            const links = await scrapePgnLinks(
                baseUrl,
                this.makeRequest.bind(this),
                this.config.linkPatterns
            );

            console.log(`Found ${links.length} PGN links`);
            return links;
        } catch (error) {
            console.error(
                `Failed to scrape links from ${baseUrl}: ${error.message}`
            );
            return [];
        }
    }

    // Generate analysis report using the analyzer
    async generateAnalysisReport() {
        // Import here to avoid circular dependencies
        const { OpeningAnalyzer } = await import('./opening-analyzer.js');

        console.log('\n=== Generating Analysis Report ===');
        const analyzer = new OpeningAnalyzer(this.config.outputFile);
        return await analyzer.analyze();
    }

    // Print statistics
    printStats() {
        const openingRecords = Object.entries(this.database.openings);

        console.log('\n=== Data Gathering Statistics ===');
        console.log(`Total opening records: ${openingRecords.length}`);
        console.log(`Total games processed: ${this.database.totalGames}`);
        console.log(`Last updated: ${this.database.lastUpdated}`);

        // Group by primary name to show variations
        const openingsByName = {};
        for (const [key, record] of openingRecords) {
            const primaryName = record.opening;
            if (!openingsByName[primaryName]) {
                openingsByName[primaryName] = [];
            }
            openingsByName[primaryName].push(record);
        }

        console.log(
            `Unique opening names: ${Object.keys(openingsByName).length}`
        );

        // Show top 10 openings by total occurrence
        const topOpenings = Object.entries(openingsByName)
            .map(([name, records]) => ({
                name,
                totalOccurrences: records.reduce(
                    (sum, r) => sum + r.occurrenceCount,
                    0
                ),
                variations: records.length,
            }))
            .sort((a, b) => b.totalOccurrences - a.totalOccurrences)
            .slice(0, 10);

        console.log('\nTop 10 openings by total occurrences:');
        for (let i = 0; i < topOpenings.length; i++) {
            const opening = topOpenings[i];
            console.log(
                `${i + 1}. ${opening.name}: ${
                    opening.totalOccurrences
                } games (${opening.variations} variations)`
            );
        }

        // Show openings with most name variations
        const mostVariations = Object.entries(openingsByName)
            .map(([name, records]) => ({
                name,
                variationCount: Math.max(
                    ...records.map((r) => r.nameVariations.length)
                ),
                recordCount: records.length,
            }))
            .sort((a, b) => b.variationCount - a.variationCount)
            .slice(0, 5);

        console.log('\nOpenings with most name variations:');
        for (let i = 0; i < mostVariations.length; i++) {
            const opening = mostVariations[i];
            console.log(
                `${i + 1}. ${opening.name}: ${
                    opening.variationCount
                } name variations, ${opening.recordCount} records`
            );
        }
    }

    // Main run function
    async run() {
        console.log('Starting PGN data gathering...');

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

        console.log('Data gathering complete');
    }
}

// Main execution
const isMainModule = process.argv[1] === new URL(import.meta.url).pathname;

if (isMainModule) {
    const gatherer = new PGNDataGatherer();
    gatherer.run().catch(console.error);
}

export { PGNDataGatherer };
