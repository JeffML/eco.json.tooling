import { Chess } from 'chess.js';
import fs from 'fs';

// removed extraneous incoming openings that already exist in eco.json
// this will assign FEN strings to incoming openings
const filterIncoming = (incoming, existing) => {
    const { A, B, C, D, E, IN } = existing;
    const allOpenings = {
        ...A.json,
        ...B.json,
        ...C.json,
        ...D.json,
        ...E.json,
        ...IN.json,
    };

    const src = incoming[0].src;

    let excluded = 0;
    const added = {};
    const modified = {};
    const toRemove = []; // interpolated openings to remove

    for (let inc of incoming.slice(1)) {
        const {fen, name, moves, eco} = inc
        const existing = allOpenings[fen];

        if (existing) {
            // check for changes/addl info
            const redundant = existing.name.endsWith(name);

            if (existing.src === src && !reduntant) {
                modified[fen] = { ...existing, name, moves, eco }; //assume rest may have changed, too
            } else if (existing.src === 'interpolated') {
                delete existing.rootSrc;
                added[fen] = { ...existing, src };
                toRemove.push(fen);
            } else if (!redundant &&
                (!existing.aliases || !existing.aliases[src])) {
                const aliases = existing.aliases ?? {};
                aliases[src] = name;
                modified[fen] = { ...existing, aliases };
            } else {
                excluded++;
            }
        } else {
            // delete inc.fen
            added[fen] = { ...inc, src };
        }
    }

    return { added, modified, excluded, toRemove };
};// checks that all the required stuff is there

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
            console.error('Invalid opening: ' + JSON.stringify(opening));
            return false;
        }

        try {
            chess.loadPgn(opening.moves);
            opening.fen = chess.fen()
        } catch (e) {
            console.error(e.message)
            return false
        }
    }

    return true;
};
// parses and validates the opening.json file
const getIncomingOpenings = () => {
    const text = fs.readFileSync(process.cwd() + '/input/opening.json');
    const json = JSON.parse(text);

    if (!validate(json)) process.exit(-1);
    return json;
};

export {validate, getIncomingOpenings, filterIncoming}

