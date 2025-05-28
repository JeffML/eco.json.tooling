import { writeFileSync } from 'fs';
import { hardAssert } from './utils.js';

/**
 * Retrieves the JSON data for a specific category.
 *
 * @param {string} category - Category key (e.g., 'IN', 'A', 'B').
 * @param {Object} existing - Existing openings data.
 * @returns {Object} JSON data for the specified category.
 */
const getCategoryJson = (category, existing) => existing[category].json;

/**
 * Applies newly added openings to the existing data.
 *
 * @param {Object} added - Newly added openings.
 * @param {Object} existing - Existing openings data.
 */
const applyAdded = (added, existing) => {
    for (const fen in added) {
        const newOpening = added[fen];
        const category =
            newOpening.src === 'interpolated' ? 'IN' : newOpening.eco[0];
        const existingJson = getCategoryJson(category, existing);

        if (category !== 'IN') {
            hardAssert(
                !existingJson[fen],
                `Opening already exists!\n${JSON.stringify(
                    { existing: existingJson[fen], new: newOpening },
                    null,
                    2
                )}`
            );
        }

        delete newOpening.fen; // Remove redundant FEN property
        existingJson[fen] = newOpening;
    }
};

/**
 * Applies modifications to existing openings.
 *
 * @param {Object} modified - Openings to be modified.
 * @param {Object} existing - Existing openings data.
 */
const applyModified = (modified, existing) => {
    for (const fen in modified) {
        const modifiedOpening = modified[fen];
        const category =
            modifiedOpening.src === 'interpolated'
                ? 'IN'
                : modifiedOpening.eco[0];
        const existingJson = getCategoryJson(category, existing);

        hardAssert(existingJson[fen], 'Cannot find record to modify!');
        existingJson[fen] = modifiedOpening;
    }
};

/**
 * Removes interpolated openings that are no longer needed.
 *
 * @param {Array} formerInterpolated - FEN strings of interpolated openings to be removed.
 * @param {Object} interpolated - Interpolated openings data.
 */
const removeFormerInterpolated = (formerInterpolated, interpolated) => {
    for (const fen of formerInterpolated) {
        hardAssert(interpolated[fen], 'Cannot find old interpolated opening!');
        delete interpolated[fen];
    }
};

/**
 * Applies new continuations to the `fromTo` relationships.
 *
 * @param {Array} fromTos - New `fromTo` relationships.
 * @param {Array} existingFromTos - Existing `fromTo` relationships.
 */
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

export const moreFromTos = (moreFromTos) => {
    // moreFromTos needs a little massaging
    const flattened = [];
    let root;

    moreFromTos.forEach((lod, i) => {
        const from = lod.fromData;

        if (i === 0) {
            root = from;
        } else if (from.name === 'TBD') {
            from.name = root.name;
            from.rootSrc = from.rootSrc !== 'eco_tsv' ? root.src : 'eco_tsv';
        }
        flattened.push([[lod.from, lod.to], {from: lod.fromData, to:lod.toData}]);
    });

    return flattened;
};

const filterInterpolated = (newInterpolated, existing) => {
    const filtered = {};

    for (const fen in newInterpolated) {
        const newOpening = newInterpolated[fen];
        const category = newOpening.eco[0];
        const existingJson = getCategoryJson(category, existing);
        const old = existingJson[fen]

        if (newOpening.src !== 'interpolated') {
            continue;
        }  // head or tail of line of descent; skip

        if (old) {
            hardAssert(
                `Opening already exists! ${JSON.stringify(
                    { newOpening, existing: old },
                    null,
                    2
                )}`
            );
        }

        filtered[fen] = newOpening;
    }

    return filtered;
};

/**
 * Applies `fromTo` relationships and interpolated openings to the existing data.
 *
 * @param {Array} newFromTos - Normal continuation `fromTo` relationships.
 * @param {Array} mfts - Continuation `fromTo` relationships with possible interpolations.
 * @param {Object} existing - Existing openings data.
 */
const applyFromTos = (newFromTos, mfts, existing) => {
    const existingFromTos = existing.FT.json;

    applyContinuations(newFromTos, existingFromTos);

    const fromTos = moreFromTos(mfts, existingFromTos);

    // moreFromTos also embeds new continuations, so extract those
    const newInterpolated = fromTos.reduce((acc, [[fen], {from}]) => {
        acc[fen] = from;
        return acc;
    }, {});

    const interpolated = filterInterpolated(newInterpolated, existing);

    applyAdded(interpolated, existing);
    applyContinuations(
        fromTos.map((ft) => [...ft[0], ft[1].from.src, ft[1].to.src]),
        existingFromTos
    );
};

/**
 * Applies all updates to the existing data.
 *
 * @param {Object} existing - Existing openings data.
 * @param {Object} added - Newly added openings.
 * @param {Array} newFromTos - Normal continuation `fromTo` relationships.
 * @param {Array} moreFromTos - Continuation `fromTo` relationships with possible interpolations.
 * @param {Array} formerInterpolated - FEN strings of interpolated openings to be removed.
 * @param {Object} modified - Openings to be modified.
 * @returns {Object} Updated openings data.
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

/**
 * Writes updated openings data to JSON files.
 *
 * @param {Object} newExisting - Updated openings data.
 */
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
