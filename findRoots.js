import leven from 'leven';
import { allOpenings } from './incoming.js';
import { Chess } from 'chess.js';
import { keyLen } from './utils.js';

const chess = new Chess();

/**
 * Gets continuations (legal moves) from a given root FEN.
 *
 * @param {string} root - FEN string of the root position.
 * @returns {Array} Array of FEN strings representing continuations.
 */
const getContinuations = (root) => {
    const continuations = [];
    try {
        chess.load(root);
        const legalMoves = chess.moves();

        legalMoves.forEach((move) => {
            chess.move(move);
            const to = chess.fen();
            if (allOpenings[to]) {
                continuations.push(to);
            }
            chess.undo();
        });
    } catch (e) {
        console.error(`Error processing root FEN: ${root} - ${e.message}`);
    }

    return continuations;
};

/**
 * Checks candidate roots to determine if they are parents of the orphan.
 *
 * @param {Array} candidateRoots - Array of FEN strings representing candidate roots.
 * @param {string} orphan - FEN string of the orphan position.
 * @returns {Object} Object mapping orphan FEN to its parent root(s).
 */
const checkCandidates = (candidateRoots, orphan) => {
    if (!Array.isArray(candidateRoots) || typeof orphan !== 'string') {
        throw new Error('Invalid input: candidateRoots must be an array and orphan must be a string.');
    }

    const orphanAdopters = {};

    for (const root of candidateRoots) {
        const continuations = getContinuations(root);
        if (continuations.includes(orphan)) {
            orphanAdopters[orphan] = root;
        }
    }

    return orphanAdopters;
};

/**
 * Finds roots for orphan openings.
 * ChatGPTs analysis of FEN string changes after one move: 
 *  https://chatgpt.com/share/680fba75-b210-8001-baff-ad777444b97f
 * @param {Array} newOrphans - Array of FEN strings representing orphan positions.
 * @returns {Object} Object containing unattached openings and true orphans.
 */
const findRoots = (newOrphans) => {
    const maxLevenshteinDistance = 9;
    const unattached = {};
    const noRoots = [];

    for (const orphan of newOrphans) {
        const candidateRoots = Object.keys(allOpenings).filter((fen) => {
            try {
                const levenshteinDistance = leven(fen, orphan);
                if (levenshteinDistance > maxLevenshteinDistance) return false;

                const [, toMove, ...rest] = orphan.split(' ');
                const moveNum = Number.parseInt(rest.at(-1));
                const fenMoveNum = Number.parseInt(fen.split(' ').at(-1));

                if (isNaN(moveNum) || isNaN(fenMoveNum)) return false;
                if (toMove === fen.split(' ')[1]) return false;
                if (moveNum - fenMoveNum > 1) return false;

                return true;
            } catch (e) {
                console.error(`Error comparing FENs: ${fen} or ${orphan} - ${e.message}`);
                return false;
            }
        });

        if (candidateRoots.length === 0) {      // true orphan
            noRoots.push(orphan);
            continue;
        }

        const trueRoots = checkCandidates(candidateRoots, orphan);

        if (keyLen(trueRoots) === 0) {  // true orphan again
            noRoots.push(orphan);
        } else {
            unattached[orphan] = trueRoots;     // lost child
        }
    }

    return { unattached, noRoots };
};

export { findRoots };
