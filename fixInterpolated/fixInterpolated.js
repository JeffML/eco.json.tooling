/*
Fix for bogus interpolations.

iterate through book.IN
    note it
    For each move in IN element, walk backwards, get FEN
    if book.FEN is interpolated
        note it
    when book.FEN is *real* opening 
        update all noted IN with real opening name (if not =)
            record these
*/

import { getLatestEcoJson } from '../utils.js';
import fs from 'fs';
import { Chess } from 'chess.js';

const chess = new Chess();

const byCat = await getLatestEcoJson();
const { A, B, C, D, E, IN } = byCat;

const realBook = {
    ...A.json,
    ...B.json,
    ...C.json,
    ...D.json,
    ...E.json,
    // ...IN.json,
};

const interpolations = IN.json;

// import interpolations from './test_interpolated.json' with {type: 'json'}

// make a chain of interpolations, startingg from 'top'
const makeChain = (fen, { name, moves, eco }) => {
    const chain = { [fen]: { name, moves, eco } };

    chess.loadPgn(moves);

    do {
        chess.undo();
        const fen = chess.fen();
        const bookOpening= realBook[fen];

        if (bookOpening) {
            const {name, moves, eco} = bookOpening;
            chain[fen] = { name, moves, eco, isReal: true };
            break;
        } else {
            const { name, moves, eco } = interpolations[fen];
            chain[fen] = { name, moves, eco };
        }
    } while (true);

    return chain;
};

const chains = [];
const results = {total:0, corrected:0}

for (const [fen, opening] of Object.entries(interpolations)) {
    const chain = makeChain(fen, opening);
    const { name: rootName, isReal } = chain[Object.keys(chain).at(-1)];
    console.assert(isReal);

    if (rootName && rootName !== opening.name) {
        results.corrected++
        chains.push(chain);
    } 

    results.total++
}

fs.writeFileSync('./chains.json', JSON.stringify(chains, null, 2))

chains.forEach(chain => {
    const rkeys = Object.keys(chain).reverse()
    const {name: rootName, eco: rootEco} = chain[rkeys[0]]

    for (let i=1; i<rkeys.length; i++) {
        const fen = rkeys[i]
        const toChange = chain[fen]
        interpolations[fen].name = rootName
        interpolations[fen].eco = rootEco
    }
})

console.dir(results)
fs.writeFileSync('./new_interpolated.json', JSON.stringify(interpolations, null, 2))
