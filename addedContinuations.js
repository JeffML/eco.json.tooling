import {Chess} from 'chess.js'
import { allOpenings } from './incoming.js';

const chess = new Chess() 

// look for any continuations from the new openings
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
