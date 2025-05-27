import { writeFileSync } from 'fs';
import { hardAssert } from './utils.js';

const theJson = (cat, existing) => {
    return existing[cat].json;
};

const applyAdded = (added, existing) => {
    for (const fen in added) {
        const theNew = added[fen];
        const cat = theNew.src === 'interpolated' ? 'IN' : theNew.eco[0];
        const existingJson = theJson(cat, existing);

        if (cat !== 'IN') {
            // interpolateds are handled in applyFromTos
            hardAssert(
                !existingJson[fen],
                `added exists already!\n${JSON.stringify(
                    { existing: existingJson[fen], new: theNew },
                    null,
                    2
                )}`
            ); // should not be there
        }

        delete theNew.fen;
        existingJson[fen] = theNew;
    }
};

// could be added aliases or modified interpolated
const applyModified = (modified, existing) => {
    for (const fen in modified) {
        const theMod = modified[fen];
        const cat = theMod.src === 'interpolated' ? 'IN' : theMod.eco[0];
        const existingJson = theJson(cat, existing);
        hardAssert(existingJson[fen], "can't find record to modify!"); //should be there
        existingJson[fen] = theMod;
    }
};

const removeFormerInterpolated = (formerInterpolated, interpolated) => {
    for (const fen of formerInterpolated) {
        hardAssert(interpolated[fen], "can't find old interpolated!");
        delete interpolated[fen];
    }
};

const applyContinuations = (fromTos, existingFromTos) => {
    fromTos.forEach((ft) => {
        const found = existingFromTos.find((eft) => {
            if (eft[0] === ft[0] && eft[1] === ft[1]) {
                if (eft[2] !== ft[2]) {
                    eft[2] = ft[2];
                    return false;
                }
                return true;
            }
            return false;
        });
        hardAssert(!found, 'new fromTo already exists!');
    });

    existingFromTos.push(...fromTos); // add 'em
};

export const moreFromTos = (moreFromTos, existingFromTos) => {
    // moreFromTos needs a little massaging
    const flattened = [];
    let root;

    moreFromTos.forEach((lod, i) => {
        const from = lod[1].from;

        if (i === 0) {
            root = from;
        } else if (from.name === 'TBD') {
            from.name = root.name;
            from.rootSrc = root.src;
        }
        flattened.push(lod);
    });

    return flattened;
};

const applyFromTos = (newFromTos, mfts, existing) => {
    const filterInterpolated = (newInterpolated) => {
        const filtered = {};
        for (const fen in newInterpolated) {
            const theNew = newInterpolated[fen];
            const cat = theNew.eco[0];
            const existingJson = theJson(cat, existing);

            if (existingJson[fen]) {
                // these are endpoints that came from lineOfDescent(),
                // They are just there for eyeball checking, so skip them
                hardAssert(
                    theNew.src !== 'interpolated',
                    'interpolated already exists'
                );
            } else {
                hardAssert(
                    theNew.src === 'interpolated',
                    'only interpolated should appear'
                );
                filtered[fen] = theNew;
            }
        }

        return filtered;
    };

    const existingFromTos = existing.FT.json;

    applyContinuations(newFromTos, existingFromTos);

    const fromTos = moreFromTos(mfts, existingFromTos);

    // moreFromTos also embeds new continuations, so extract those
    const newInterpolated = fromTos.reduce((acc, ft) => {
        acc[ft[0][0]] = ft[1].from;
        return acc;
    }, {});

    const interpolated = filterInterpolated(newInterpolated);

    applyAdded(interpolated, existing);
    applyContinuations(fromTos.map(ft => [...ft[0], ft[1].from.src, ft[1].to.src]), existingFromTos);
};

/**
 *
 * @param {} existing universal opening data. includes all eco.json file data
 * @param {*} added openings to add
 * @param {*} newFromTos normal continuation fromTos
 * @param {*} moreFromTos continuation fromTos with possible interpolations
 */
export const applyData = (
    existing,
    added,
    newFromTos,
    moreFromTos,
    formerInterpolated,
    modified
) => {
    console.log('applying data');
    applyAdded(added, existing);
    applyModified(modified, existing);
    removeFormerInterpolated(formerInterpolated, existing.IN.json);
    applyFromTos(newFromTos, moreFromTos, existing);
    return existing;
};

export const writeNew = (newExisting) => {
    for (const cat in newExisting) {
        if (cat === 'FT') {
            writeFileSync(
                './output/toMerge/fromTo.json',
                JSON.stringify(newExisting[cat].json)
            );
        } else if (cat === 'IN') {
            writeFileSync(
                './output/toMerge/eco_interpolated.json',
                JSON.stringify(newExisting[cat].json, null, 2)
            );
        } else {
            writeFileSync(
                `./output/toMerge/eco${cat}.json`,
                JSON.stringify(newExisting[cat].json, null, 4)
            );
        }
    }
};
