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
    const continuations = [];

    Object.keys(added).forEach(fen => {
        chess.load(fen);
        const legalMoves = chess.moves();
        legalMoves.forEach(m => {
            chess.move(m);
            const to = chess.fen();
            if (allOpenings[to] || added[to]) {
                continuations.push([fen, to]);
            }
            chess.undo()
        });
    });

    return continuations;
};
