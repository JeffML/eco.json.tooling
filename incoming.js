import { Chess } from 'chess.js';
import fs from 'fs';
import path from 'path';
import leven from 'leven';

let allOpenings = {};

const isRedundant = (existingName, name) => {
    if (leven(existingName, name) < 5) return true;
    if (name.length < existingName.length && existingName.startsWith(name))
        return true;
    return false;
};

/**
 * Filters incoming openings, removing those already present and preparing lists
 * for addition, modification, or removal.
 *
 * Note that eco_tsv is the preferred source for openings: it will override any other and move them
 * to aliases
 *
 * @param {Array} incoming - Array of incoming opening objects (first element is the src descriptor).
 * @param {Object} existing - Existing categorized openings.
 * @returns {Object} { added, modified, excluded, toRemove }
 */
const filterIncoming = (incoming, existing) => {
    if (!Array.isArray(incoming) || incoming.length === 0) {
        throw new Error('Invalid incoming data: Must be a non-empty array.');
    }
    if (!existing || typeof existing !== 'object') {
        throw new Error('Invalid existing data: Must be an object.');
    }

    const src = incoming[0].src;
    const { A, B, C, D, E, IN } = existing;
    allOpenings = {
        ...A.json,
        ...B.json,
        ...C.json,
        ...D.json,
        ...E.json,
        ...IN.json,
    };

    let excluded = 0;
    const added = {};
    const modified = {};
    const toRemove = [];

    for (const inc of incoming.slice(1)) {
        // skip the src descriptor
        const { fen, name, moves, eco } = inc;

        if (!fen) continue;     // error has already been reported

        const existingEntry = allOpenings[fen];

        if (existingEntry) {
            const redundant = isRedundant(existingEntry.name, name);

            if (existingEntry.src === src) {
                if (!redundant) {
                    modified[fen] = { ...existingEntry, name, moves, eco };
                } else {
                    excluded++;
                }
            } else if (existingEntry.src === 'interpolated') {
                delete existingEntry.rootSrc;
                added[fen] = { ...existingEntry, src };
                toRemove.push(fen);
            } else if (src === 'eco_tsv' && existingEntry.src !== 'eco_tsv') {
                const aliases = existingEntry.aliases ?? {};
                aliases[existingEntry.src] = existingEntry.name;
                aliases[src] = undefined;
                existingEntry.src = src;
                existingEntry.name = name;
                modified[fen] = { ...existingEntry, aliases };
            } else if (
                !redundant &&
                (!existingEntry.aliases || !existingEntry.aliases[src])
            ) {
                const aliases = existingEntry.aliases ?? {};
                aliases[src] = name;
                modified[fen] = { ...existingEntry, aliases };
            } else {
                excluded++;
            }
        } else {
            added[fen] = { ...inc, src };
        }
    }

    return { added, modified, excluded, toRemove };
};

/**
 * Validates the structure and content of incoming openings.
 * @param {Array} incoming - Array of incoming opening objects.
 * @returns {boolean} True if valid, false otherwise.
 */
const validate = (incoming) => {
    const chess = new Chess();
    const source = incoming[0]?.src;
    if (!source) {
        console.error('Missing src component');
        return false;
    }

    for (const opening of incoming.slice(1)) {
        const { name, eco, moves } = opening;
        if (!(name || eco || moves)) {
            console.error(
                `Invalid opening: Missing required fields (name, eco, or moves) - ${JSON.stringify(
                    opening
                )}`
            );
            return false;
        }
        try {
            chess.loadPgn(opening.moves);
            opening.fen = chess.fen();
        } catch (e) {
            // FEN failure; this will result in a single "undefined" FEN that needs to be handled in a later step
            console.error(
                `Error processing opening (skipped): ${JSON.stringify(
                    opening
                )} - ${e.message}`
            );
        }
    }
    return true;
};

/**
 * Loads and validates the opening.json file from disk.
 * @returns {Array} Parsed and validated openings array.
 */
const getIncomingOpenings = () => {
    const filePath = path.resolve(process.cwd(), 'input/opening.json');
    const text = fs.readFileSync(filePath, 'utf-8');
    const json = JSON.parse(text);

    if (!validate(json)) process.exit(-1);
    return json;
};

export { validate, getIncomingOpenings, filterIncoming, allOpenings };
