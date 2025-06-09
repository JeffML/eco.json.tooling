import { Chess } from 'chess.js';
import fs from 'fs';
import path from 'path'

let allOpenings

// removed extraneous incoming openings that already exist in eco.json
// this will assign FEN strings to incoming openings
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
    const added = {};    // openings to add to eco.json, including those moved from eco_interpolated.json
    const modified = {}; // change to existing eco.json entry
    const toRemove = []; // interpolated openings to remove

    for (let inc of incoming.slice(1)) {   // first element is the src; skip it
        const {fen, name, moves, eco} = inc
        const existing = allOpenings[fen];

        if (existing) {
            const redundant = existing.name.endsWith(name);
            if (existing.src === src) {
                if (!redundant) {
                    modified[fen] = { ...existing, name, moves, eco };
                } else excluded++
            } else if (existing.src === 'interpolated') {
                delete existing.rootSrc;
                added[fen] = { ...existing, src };
                toRemove.push(fen);
            } else if (src === 'eco_tsv' && existing.src !== 'eco_tsv'){
                const aliases = existing.aliases ?? {};
                aliases[existing.src] = existing.name; 
                aliases[src] = undefined;
                existing.src = src
                existing.name = name
                modified[fen] = {...existing, aliases} 
            } else if (!redundant && (!existing.aliases || !existing.aliases[src])) {
                const aliases = existing.aliases ?? {};
                aliases[src] = name;
                modified[fen] = { ...existing, aliases };
            } else {
                excluded++;
            }
        } else {
            added[fen] = { ...inc, src };
            // delete inc.fen
        }
    }

    return { added, modified, excluded, toRemove };
};

// checks that all the required stuff is there
const validate = (incoming) => {
    const chess = new Chess();
    const source = incoming[0].src;
    if (!source) {
        console.error('Missing src component');
        return false;
    }

    for (const opening of incoming.slice(1)) {
        const { name, eco, moves } = opening;
        if (!(name || eco || moves)) {
            console.error(`Invalid opening: Missing required fields (name, eco, or moves) - ${JSON.stringify(opening)}`);
            return false;
        }

        try {
            chess.loadPgn(opening.moves);
            opening.fen = chess.fen()
        } catch (e) {
            console.error(`Error processing opening: ${JSON.stringify(opening)} - ${e.message}`);
            return false
        }
    }

    return true;
};
// parses and validates the opening.json file
const getIncomingOpenings = () => {
    const filePath = path.resolve(process.cwd(), 'input/opening.json');
    const text = fs.readFileSync(filePath, 'utf-8');
    const json = JSON.parse(text);

    if (!validate(json)) process.exit(-1);
    return json;
};

export {validate, getIncomingOpenings, filterIncoming, allOpenings}

