import leven from 'leven';
import { allOpenings } from './incoming.js';
import {Chess} from 'chess.js'
import { chunker } from './utils.js';

const chess = new Chess()

const getContinuations = (root) => {
    const continuations = []
    chess.load(root)
    const legalMoves = chess.moves()

    legalMoves.forEach(move => {
        chess.move(move)
        const to = chess.fen()
        if (allOpenings[to]) {
            continuations.push[to]
        }
        chess.undo()
    })

    return continuations
}

const checkCandidates = (candidateRoots, orphan) => {
    const orphanAdopters = {};

    for (const root of candidateRoots) {
        const continuations = getContinuations(root);
        const parent = continuations.indexOf(orphan) > -1
        if (parent) orphanAdopters[orphan] = root;
    }

    return orphanAdopters;
};

// ChatGPTs analysis of FEN string changes after one move: https://chatgpt.com/share/680fba75-b210-8001-baff-ad777444b97f
const findRoots = (newOrphans) => {
    const maxL = 9;
    const allRoots = [];
    const noRoots = [];

    // check all "orphans" to see if they are really orphans or just lost children
    for (const orphan of newOrphans) {
        const candidateRoots = Object.keys(allOpenings).filter((fen) => {
            const ldist = leven(fen, orphan);
            if (ldist > maxL) return false;

            const [, toMove, ...rest] = orphan.split(' ');
            const moveNum = rest.at(-1);

            if (toMove === fen.split(' ')[1]) return false;

            if (
                Number.parseInt(moveNum) -
                    Number.parseInt(fen.split(' ').at(-1)) >
                1
            )
                return false;
            return true;
        });

        // a true orphan has no candidate roots
        if (!candidateRoots?.length) {
            noRoots.push(orphan);
            continue;
        }

        const trueRoots = checkCandidates(candidateRoots, orphan);
        
        if (!trueRoots.length) { // a true orphan has no parent among the candidates
            noRoots.push(orphan);
        } else allRoots[orphan] = trueRoots;    // parent found 
    }

    return { allRoots, noRoots };
};

const newFromTos = (parents, added) => {
    const fromTos = []
    const parentFens = Object.keys(parents)

    for (const pfen in parentFens) {
        const child = parentFens[pfen]
        const fromTo = [pfen, added, allOpenings[pfen].src, added[child].src ]
        fromTos.push(fromTo)
    }

    return fromTos
}

const movesFromHistory = (history) => {
    const fullMoves = chunker(history, 2).map((twoPly,i) => {
        return (`${i}. ${twoPly.join(' ')}`)
    })
    return fullMoves;
}

// add interpolations for each true orphan, updating fromTo to reflect the new connections
const addInterpolations = (orphanFen, newFromTos, added) => {

    const makeInterpolated = () => {
        const interpolated = {...orphan, src: 'interpolated', moves: movesFromHistory(chess.history())}
        return interpolated
    }

    const orphan = added[orphanFen]
    const interpolations = {}

    chess.loadPgn(orphan.moves)
    let parent;
    
    do {
        chess.undo() 
        const fen = chess.fen()
        parent = [fen, allOpenings[fen]]

        if (!parent) {
            const interpolated = makeInterpolated()
            interpolations[fen] = interpolated
        }
     } while (!parent)

    for (const ifen in interpolations) {
        const i = interpolations[ifen]
        i.name = parent[1].name
        i.rootSrc = parent[1].src
        newFromTos.push([parent[0], ifen, parent[1].src, i.src])
    }
}

export { newFromTos, findRoots, addInterpolations }