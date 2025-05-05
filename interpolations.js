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
                IN.rootSrc = src;
                IN.name = name;
                modified[fen] = IN;
                updated++;
                updateContinuations(c, src, name);
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
export const addInterpolations = (orphanFen, newFromTos, added, interpolations) => {
    const orphan = added[orphanFen]

    const makeInterpolated = (orphan) => {
        const interpolated = {
            ...orphan,
            src: 'interpolated',
            moves: movesFromHistory(chess.history()),
        };
        return interpolated;
    };

    // stateful!
    const checkForParent = () => {
        chess.undo();
        const parentFen = chess.fen();
        const parent = allOpenings[parentFen];
        return { parent, parentFen };
    };

    // load the orphan's moves, then do see if there is a parent
    chess.loadPgn(orphan.moves);
    let { parent, parentFen } = checkForParent();

    // special case: orphan is new continuation unattached to parent; no interpolations needed
    if (parent) {
        newFromTos.push([parentFen, orphanFen, parent.src, orphan.src])
        return null;
    }

    // while there is no parent, make an interpolation record
    while (!parent) {
        interpolations[parentFen] = makeInterpolated(orphan);

        const result = checkForParent();
        if (!result.parentFen) break; // Stop if no parent is found
        ({ parent, parentFen } = result);
    }

    // we will walk the interpolations from parent to last
    const ifens = Object.keys(interpolations).reverse();

    // the first interpolation is linked to the parent (root) variation
    newFromTos.push([
        [parentFen, ifens[0], parent.src, interpolations[ifens[0]].src],
    ]);

    // walking backwards through the interpolations, skipping the first and last
    ifens.slice(1, -1).forEach((ifen, i) => {
        const interpolation = interpolations[ifen];
        interpolation.name = parent.name;
        interpolation.rootSrc = parent.src;
        newFromTos.push([ifen, ifens[i + 1], parent.src, interpolation.src]);
    });

    // The last interpolation is linked to the orphan
    const lastIfen = ifens.at(-1);
    const lastInterpolation = interpolations[lastIfen];
    newFromTos.push([lastIfen, orphanFen, lastInterpolation.src, orphan.src]);

    return interpolations;
};
