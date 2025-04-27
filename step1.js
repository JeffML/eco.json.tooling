import fetch from 'node-fetch';
import fs from 'fs';
import { Chess } from 'chess.js';

// pulls the opening data from eco.json github repo
async function getLatestEcoJson() {
    const ROOT =
        'https://raw.githubusercontent.com/hayatbiralem/eco.json/master/';
    const openingsByCat = {
        A: { url: ROOT + 'ecoA.json' },
        B: { url: ROOT + 'ecoB.json' },
        C: { url: ROOT + 'ecoC.json' },
        D: { url: ROOT + 'ecoD.json' },
        E: { url: ROOT + 'ecoE.json' },
        IN: { url: ROOT + 'eco_interpolated.json' },
        FT: { url: ROOT + 'fromTo.json' },
    };

    for (const cat in openingsByCat) {
        const res = await fetch(openingsByCat[cat].url);
        openingsByCat[cat].json = await res.json();
    }

    return openingsByCat;
}

// checks that all the required stuff is there
const validate = (incoming) => {
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

const keyLen = (o) => Object.keys(o).length;

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
    const chess = new Chess();

    const src = incoming[0].src;

    let excluded = 0;
    const added = {};
    const modified = {};
    const toRemove = []; // interpolated openings to remove

    for (let inc of incoming.slice(1)) {
        chess.loadPgn(inc.moves);
        const fen = chess.fen();
        const existing = allOpenings[fen];

        if (existing) {
            // check for changes/addl info
            if (existing.src === src && existing.name !== inc.name) {
                const { name, moves, eco } = inc;
                modified[fen] = { ...existing, name, moves, eco }; //assume rest may have changed, too
            } else if (existing.src === 'interpolated') {
                added[fen] = { ...existing, src };
                toRemove.push(fen);
            } else if (
                !existing.aliases ||
                existing.aliases[src] !== inc.name
            ) {
                const aliases = existing.aliases ?? {};
                aliases[src] = inc.name;
                modified[fen] = { ...existing, aliases };
            } else {
                excluded++;
            }
        } else {
            added[fen] = { ...inc, src };
        }
    }

    return { added, modified, excluded, toRemove };
};

// Note that an interpolated opening may have multiple continuations, and there for appear multiple times in the fromTo data
const updateInterpolated = (toRemove, added, modified, existing) => {
    const fromTo = existing.FT.json;
    const interpolated = existing.IN.json;
    const fromToIndexed = fromTo.reduce((a, [from, to]) => {
        a[from] ??= [];
        a[from].push(to);
        return a;
    }, {});

    let updated = 0;

    const updateContinuations = (fen, src, name) => {
        let continuations = fromToIndexed[fen];

        for (let c of continuations) {
            const IN = interpolated[c];
            if (IN) {
                IN.rootSrc = src;
                IN.name = name;
                modified[fen] = IN;
                updated++;
                updateContinuations(c, src, name);
            } else break;
        }
    }

    for (const fen of toRemove) {
        const { src, name } = added[fen];
        updateContinuations(fen, src, name)
    }

    return updated;
};

const incomingOpenings = getIncomingOpenings();

const existingOpenings = await getLatestEcoJson();

const { added, modified, excluded, toRemove } = filterIncoming(
    incomingOpenings,
    existingOpenings
);

// for all the interpolateds to be removed, we need to update the names and root sources of any interpolated children
const updated = updateInterpolated(toRemove, added, modified, existingOpenings);

console.log({
    incoming: incomingOpenings.length - 1,
    excluded,
    added: keyLen(added),
    modified: keyLen(modified),
    toRemove,
    updatedInterpolations: updated,
});
