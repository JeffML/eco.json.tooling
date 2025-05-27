import { Chess } from 'chess.js';
import { chunker } from './utils.js';
import { allOpenings } from './incoming.js';

const chess = new Chess();

/*
For all the interpolateds to be removed, we need to update the names and root sources of any interpolated continuations.
Note that an interpolated opening may have multiple continuations, and therefore appear multiple times in the 'from' data in fromTo.json
*/
export const updateInterpolated = (toRemove, added, modified, existing) => {
    const fromTo = existing.FT.json;
    const interpolated = existing.IN.json;
    const fromToIndexed = fromTo.reduce((a, [from, to]) => {
        a[from] ??= [];
        a[from].push(to);
        return a;
    }, {});

    let updated = 0;

    const updateContinuations = (fen, src, name, visited = new Set()) => {
        if (visited.has(fen)) return; // Prevent infinite recursion
        visited.add(fen);

        let continuations = fromToIndexed[fen];

        for (let c of continuations) {
            const IN = interpolated[c];
            if (IN) {
                modified[fen] = {...IN, rootSrc: src, name};
                updated++;
                updateContinuations(c, src, name, visited);
            } else break;
        }
    };

    for (const fen of toRemove) {
        const { src, name } = added[fen];
        updateContinuations(fen, src, name);
    }

    return updated;
};

const movesFromHistory = (history) => {
    const fullMoves = chunker(history, 2).map((twoPly, i) => {
        return `${i + 1}. ${twoPly.join(' ')}`;
    });
    return fullMoves.join(' ');
};

/**
 * Adds interpolations for each true orphan, updating `newFromTos` to reflect the new connections.
 * Note: `newFromTos` is mutated by this method.
 */
export const lineOfDescent = (orphanFen, added) => {
    const orphan = added[orphanFen];
    const lineOfDescent = [orphan];

    const makeInterpolated = (o) => {
        const moves = movesFromHistory(chess.history());

        /* eslint-disable-next-line no-unused-vars */
        const { fen, src, ...rest } = o;
        const interpolated = {
            ...rest,
            src: 'interpolated',
            moves, // will overwrite orphan moves
            name: 'TBD',
            rootSrc: 'TBD'
        };
        return interpolated;
    };

    // stateful! moves back one ply each time
    const checkForParent = () => {
        chess.undo();
        const parentFen = chess.fen();
        const parent = allOpenings[parentFen];
        return parent;
    };

    // load the orphan's moves, then see if there is a parent
    chess.loadPgn(orphan.moves);
    let parent = checkForParent();

    // special case: orphan is new continuation unattached to parent; no interpolations needed
    if (parent) {
        lineOfDescent.push(parent)
    } else {
        // while there is no parent, make an interpolation record
        let o = orphan;

        do {
            const interpolated = makeInterpolated(o);
            lineOfDescent.push(interpolated)
            o = interpolated;

            parent = checkForParent();    // relies on state of chess instance
            if (parent) {
                lineOfDescent.push(parent)
            }
        } while (!parent)
    }

    return lineOfDescent;
};
