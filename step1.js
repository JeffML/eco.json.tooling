import fs, { writeFileSync } from 'fs';
import { getLatestEcoJson } from './getLatestEcoJson.js';
import { keyLen } from './utils.js';
import { filterIncoming, getIncomingOpenings } from './incoming.js';
import { updateInterpolated } from './updateInterpolated.js';
import { findRoots } from './findRoots.js';

const incomingOpenings = getIncomingOpenings();  // performs validation of input

const existingOpenings = await getLatestEcoJson(); // requests eco.json data from github


/*
    added: new openings
    modified: existing eco.json openings that require changes
    excluded: redundant
    toRemove: existing interpolated openings that are now in added category
*/
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


// write intermediate data for eyeball checks
fs.writeFileSync('./output/added.json', JSON.stringify(added, null, 2));
fs.writeFileSync('./output/modified.json', JSON.stringify(modified, null, 2));
fs.writeFileSync('./output/toRemove.json', JSON.stringify(toRemove, null, 4));

// for the new openings, see if any are orphans (no roots)
const findOrphans = (added, fromTo) => {
    const orphans = [];

    for (const a of Object.keys(added)) {
        const hasParent = fromTo.find((ft) => ft[1] === a)
        const isOrphan = !hasParent;
        if (isOrphan) orphans.push(a);
    }

    return orphans;
};

// look for any continuations from the new openings
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

// for each added, look for continuations to existing and other addeds
const newContinuations = addedContinuations(added)
fs.writeFileSync('./output/continuations', JSON.stringify(newContinuations, null, 2))

// Now look for orphan addeds; they may not be true orphans, but merely unconnected in fromTo.json
const newOrphans = findOrphans(added, existingOpenings.FT.json);

/*
For each orphan, determine:
    if it has any roots in the existing openings (allRoots)
    if it is truly an orphan (noRoots)
*/
const {allRoots, noRoots} = findRoots(newOrphans, allOpenings);
fs.writeFileSync('./output/orphanRoots.json', JSON.stringify({allRoots, noRoots}, null, 2))

// For orphans that are merely missng connections to their parent, add a fromTo from parent -> orphan
const newFromTos = newFromTos(allRoots)

// for true orphans, need to create new interpolated openings, and connect them in newFromTo
const interpolations = noRoots.map(orphan => addInterpolations(orphan, newFromTos))

fs.writeFileSync('./output/newlyRooted.json', JSON.stringify({interpolations, newFromTos}, null, 2))

const concatData = (existing, added, fromTo) => {
    added.forEach(a => {
        if (a.src === 'interpolated') {
            existing.IN.concat(a)
        } else {
            const cat = a.eco[0]
            existing[cat].concat(a)
        }
    })

    newFromTos.forEach(ft => {
        existing.FT.concat(ft)
    })
}

const writeNew = (newExisting) => {
    for (const cat in newExisting) {
        if (cat === FT) {
            writeFileSync('./output/toMerge/fromTo.json', JSON.stringify(newExisting[cat]))
        } else if (cat === IN) {
            writeFileSync('./output/toMerge/eco_interpolated.json', JSON.stringify(newExisting[cat], null, 2))
        } else {
            writeFileSync(`./output/toMerge/eco${cat}.json`, JSON.stringify(newExisting[cat], null, 4))
        }
    }
}

// now concatenate the new data to existing structures and output to eco?.json, eco_interpolated.json and fromTo.json files
const newExisting = concatData(existingOpenings, added, newFromTos)

writeNew(newExisting)