import fs from 'fs';
import { getLatestEcoJson } from './getLatestEcoJson.js';
import { keyLen } from './utils.js';
import { filterIncoming, getIncomingOpenings } from './incoming.js';
import { updateInterpolated } from './updateInterpolated.js';
import { findRoots } from './findRoots.js';

const incomingOpenings = getIncomingOpenings();

const existingOpenings = await getLatestEcoJson();

const { added, modified, excluded, toRemove } = filterIncoming(
    incomingOpenings,
    existingOpenings
);

// for all the interpolateds to be removed, we need to update the names and root sources of any interpolated continuations
const updated = updateInterpolated(toRemove, added, modified, existingOpenings);

console.log({
    incoming: incomingOpenings.length - 1,
    excluded,
    added: keyLen(added),
    modified: keyLen(modified),
    toRemove,
    updated,
});

fs.writeFileSync('./output/added.json', JSON.stringify(added, null, 2));
fs.writeFileSync('./output/modified.json', JSON.stringify(modified, null, 2));
fs.writeFileSync('./output/toRemove.json', JSON.stringify(toRemove, null, 4));

const findOrphans = (added, fromTo) => {
    const orphans = [];

    for (const a of Object.keys(added)) {
        const isOrphan = !fromTo.find((ft) => ft[1] === a);
        if (isOrphan) orphans.push(a);
    }

    return orphans;
};

const addedContinuations = (added) => {
    const continuations = []

    added.forEach(a => {
        chess.loadFen(a)
        const legalMoves = chess.moves()
        legalMoves.forEach(m => {
            chess.move(m)
            const fen = chess.fen()
            if (allOpenings[fen]) {
                continuations.push([a, fen])
            }
        })
    })

    return continuations
}

// for each added, look for continuations among existing and other addeds
const newContinuations = addedContinuations(added)
fs.writeFileSync('./output/continuations', JSON.stringify(newContinuations, null, 2))

// Now look for orphan addeds, and find a parent
const newOrphans = findOrphans(added, existingOpenings.FT.json);

const {allRoots, noRoots} = findRoots(newOrphans, allOpenings);
fs.writeFileSync('./output/orphanRoots.json', JSON.stringify({allRoots, noRoots}, null, 2))

// if no new roots for an orphan, need to interpolate
const interpolations = noRoots.map(orphan => addInterpolations(orphan))
fs.writeFileSync('./output/orphanRoots.json', JSON.stringify(interpolations, null, 2))

