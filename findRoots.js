import leven from 'leven';
import { allOpenings } from './incoming.js';
import {Chess} from 'chess.js'

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
export const findRoots = (newOrphans) => {
    const maxL = 9;
    const allRoots = [];
    const noRoots = [];

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

        if (!candidateRoots?.length) {
            noRoots.push(orphan);
            continue;
        }

        const trueRoots = checkCandidates(candidateRoots, orphan);
        if (!trueRoots.length) {
            noRoots.push(orphan);
        } else allRoots[orphan] = trueRoots;
    }

    return { allRoots, noRoots };
};
