import {Chess} from 'chess.js'
import { allOpenings } from './incoming.js';

const chess = new Chess() 

/**
 * Finds continuations from newly added openings.
 * 
 * @param {Object} added - An object where keys are FEN strings of newly added openings.
 * @param {Object} allOpenings - An object containing all existing openings.
 * @returns {Array} An array of continuations, where each continuation is a tuple [fromFEN, toFEN].
 */
export const addedContinuations = (added) => {
    const continuation = (from, to) => {
        const a = added[from]
        const b = allOpenings[to]??added[to]

        return {from:a, to:b}
    }

    const continuations = [];

    Object.keys(added).forEach(fen => {
        chess.load(fen);
        const legalMoves = chess.moves();
        legalMoves.forEach(m => {
            chess.move(m);
            const to = chess.fen();
            if (allOpenings[to] || added[to]) {
                continuations.push([[fen, to], continuation(fen, to)]);
            }
            chess.undo()
        });
    });

    return continuations;
};


export const moreFromTos = (linesOfDescent) => {
    const moreFromTos = []
    
    linesOfDescent.forEach(lod => {
        lod = lod.reverse()

        lod.forEach((d, i) => {
            if ((i + 1) < lod.length) {
                chess.loadPgn(d.moves)
                const from = chess.fen()

                const c = lod[i+1]
                chess.loadPgn(c.moves)
                const to = chess.fen()

                moreFromTos.push([[from, to], {from:d, to: c}])
            }
        })
    })

    return moreFromTos
}

export const canonicalFromTos = (continuations) => {
    return continuations.map(c => {
        const [from, to] = c[0]
        const fromSrc = c[1].from.src
        const toSrc = c[1].to.src
        return [from, to, fromSrc, toSrc]
    })
}