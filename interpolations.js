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
export const addInterpolations = (orphanFen, added) => {
    const orphan = added[orphanFen];
    const moreFromTos = [];
    const moreInterpolations = {};

    const makeInterpolated = (orphan) => {
        const moves =  movesFromHistory(chess.history())
        
        /* eslint-disable-next-line no-unused-vars */
        const orphanFields = {fen, src, moves, ...rest}
        const interpolated = {
            ...rest,
            src: 'interpolated',
            moves,
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

    // load the orphan's moves, then see if there is a parent
    chess.loadPgn(orphan.moves);
    let { parent, parentFen } = checkForParent();

    // special case: orphan is new continuation unattached to parent; no interpolations needed
    if (parent) {
        moreFromTos.push([
            [parentFen, orphanFen],
            { from: parent, to: orphan },
        ]);
    } else {
        // while there is no parent, make an interpolation record
        let o = orphan

        while (!parent) {
            const interpolated = makeInterpolated(o)
            moreInterpolations[parentFen] = interpolated;
            o = interpolated

            const result = checkForParent();
            if (!result.parentFen) break; // Stop if no parent is found
            ({ parent, parentFen } = result);
        }

        // we will walk the interpolations from parent to last
        const ifens = Object.keys(moreInterpolations).reverse();

        // the first interpolation is linked to the parent (root) variation
        moreFromTos.push([
            [parentFen, ifens[0], {from: parent, to: moreInterpolations[ifens[0]]}],
        ]);

        // walking backwards through the interpolations, skipping the first and last
        ifens.slice(1, -1).forEach((ifen, i) => {
            const interpolation = moreInterpolations[ifen];
            interpolation.name = parent.name;
            interpolation.rootSrc = parent.src;
            [parentFen, orphanFen],
                { from: parent, to: orphan },
                moreFromTos.push([
                    [ifen, ifens[i + 1]],
                    {
                        from: parent,
                        to: interpolation,
                    },
                ]);
        });

        // The last interpolation is linked to the orphan
        const lastIfen = ifens.at(-1);
        const lastInterpolation = moreInterpolations[lastIfen];
        moreFromTos.push([
            [lastIfen, orphanFen],
            {
                from: lastInterpolation,
                to: orphan,
            },
        ]);
    }

    return { moreFromTos, moreInterpolations };
};
