import { ChessPGN } from '@chess-pgn/chess-pgn';
import { chunker } from '../utils.js';
import { allOpenings } from './incoming.js';

const chess = new ChessPGN();

const posOnly = (fen) => fen.split(' ')[0];

// Build position-only index of all known openings for transposition-aware lookup.
const positionIndex = {};
for (const [fen, entry] of Object.entries(allOpenings)) {
    const pos = posOnly(fen);
    if (!positionIndex[pos]) positionIndex[pos] = [];
    positionIndex[pos].push({ fen, entry });
}

/**
 * Updates interpolated openings by modifying their names and root sources.
 * Handles continuations recursively to prevent infinite loops.
 *
 * @param {Array} toRemove - FEN strings of interpolated openings to be removed.
 * @param {Object} added - Newly added openings.
 * @param {Object} modified - Openings to be modified.
 * @param {Object} existing - Existing openings data.
 * @returns {number} Count of updated openings.
 */
export const updateInterpolated = (toRemove, added, modified, existing) => {
    const fromTo = existing.FT.json;
    const interpolated = existing.IN.json;

    // Index `fromTo` for quick lookup
    const fromToIndexed = fromTo.reduce((acc, [from, to]) => {
        acc[from] ??= [];
        acc[from].push(to);
        return acc;
    }, {});

    let updatedCount = 0;

    const updateContinuations = (fen, src, name, visited = new Set()) => {
        if (visited.has(fen)) return; // Prevent infinite recursion
        visited.add(fen);

        const continuations = fromToIndexed[fen] || [];
        for (const continuationFen of continuations) {
            const interpolatedOpening = interpolated[continuationFen];
            if (interpolatedOpening) {
                const rootSrc = interpolatedOpening.rootSrc === 'eco_tsv' ? interpolatedOpening.rootSrc : src;
                modified[continuationFen] = { ...interpolatedOpening, rootSrc, name };
                updatedCount++;
                updateContinuations(continuationFen, src, name, visited);
            }
        }
    };

    for (const fen of toRemove) {
        const { src, name } = added[fen];
        updateContinuations(fen, src, name);
    }

    return updatedCount;
};

/**
 * Converts move history into a PGN string.
 *
 * @param {Array} history - Array of moves in history.
 * @returns {string} PGN string of moves.
 */
const movesFromHistory = (history) => {
    return chunker(history, 2)
        .map((twoPly, i) => `${i + 1}. ${twoPly.join(' ')}`)
        .join(' ');
};

/**
 * Determines the line of descent for an orphan opening, creating interpolations if necessary.
 *
 * @param {string} orphanFen - FEN string of the orphan opening.
 * @param {Object} added - Newly added openings.
 * @returns {Array} Line of descent for the orphan.
 */
export const lineOfDescent = (orphanFen, added) => {
    // Extend position index with newly added openings for this pipeline run.
    const localIndex = { ...positionIndex };
    const indexPos = (fen, entry) => {
        const pos = posOnly(fen);
        if (!localIndex[pos]) localIndex[pos] = [];
        localIndex[pos].push({ fen, entry });
    };
    for (const [fen, entry] of Object.entries(added)) indexPos(fen, entry);

    let orphan = added[orphanFen];
    const lineOfDescent = [orphan];

    const makeInterpolated = (opening) => {
        const moves = movesFromHistory(chess.history());
        const { fen, src, ...rest } = opening;
        return {
            ...rest,
            src: 'interpolated',
            moves, // Overwrites orphan moves
            name: 'TBD',
            rootSrc: 'TBD',
        };
    };

    const checkForParent = () => {
        chess.undo();
        const parentFen = chess.fen();
        // Exact match first, then position-only fallback
        return allOpenings[parentFen] ?? added[parentFen] ?? localIndex[posOnly(parentFen)]?.[0]?.entry ?? null;
    };

    chess.loadPgn(orphan.moves);
    let parent = checkForParent();

    while (!parent) {
        const interpolated = makeInterpolated(orphan);
        lineOfDescent.push(interpolated);
        orphan = interpolated;
        parent = checkForParent();
    }

    lineOfDescent.push(parent);
    return lineOfDescent;
};
