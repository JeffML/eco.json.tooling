/**
 * Identifies orphan openings (openings with no parent) from the added openings.
 * Updates the `fromTo` relationships for openings that have a parent.
 *
 * @param {Object} added - An object where keys are FEN strings of newly added openings.
 * @param {Array} fromTo - An array of tuples, where each tuple represents a relationship:
 *                         [parentFEN, childFEN, parent.src, child.src].
 * @returns {Array} An array of orphan FEN strings.
 */
export const findOrphans = (added, fromTo) => {
    if (!added || typeof added !== 'object') {
        throw new Error('Invalid input: "added" must be an object.');
    }

    if (!Array.isArray(fromTo)) {
        throw new Error('Invalid input: "fromTo" must be an array.');
    }

    const orphans = [];

    // Index `fromTo` by childFEN for quick lookup
    const fromToIndex = fromTo.reduce((acc, [parentFEN, childFEN, parentSrc, childSrc]) => {
        acc[childFEN] = { parentFEN, parentSrc, childSrc };
        return acc;
    }, {});

    // Check each added opening for a parent
    for (const fen of Object.keys(added)) {
        const hasParent = fromToIndex[fen];
        if (!hasParent) {
            orphans.push(fen); // No parent found, mark as orphan
        } else {
            // Update the `fromTo` entry with the new source
            hasParent.childSrc = added[fen].src;
        }
    }

    return orphans;
};
