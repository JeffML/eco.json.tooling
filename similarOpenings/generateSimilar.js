import distance from 'leven';
import fs from 'fs';
import { book, convertMilliseconds } from '../utils.js';

const MAX_DISTANCE = 5;

/**
 * Finds FEN strings in the array with Levenshtein distance <= MAX_DISTANCE from the target FEN.
 * @param targetFEN The FEN string to compare against.
 * @param fenArray Array of FEN strings.
 * @returns Array of FEN strings with distance <= MAX_DISTANCE.
 */
function findSimilarPositions(fen, fens) {
    const [pos, wb, , ,,move] = fen.split(' ')

    return fens.filter((fen2) => {
        const [pos2, wb2, , , , move2] = fen2.split(' ')
        return (
            move === move2 &&
            wb === wb2 &&
            pos !== pos2 &&
            distance(pos, pos2) <= MAX_DISTANCE
        )})
}

const startTime = Date.now();

const fens = Object.keys(book).filter((fen) => {
    const moveNumber = parseInt(fen.split(' ').at(-1));
    return moveNumber >= 5;
});


const similarPositions = {};

fens.forEach(fen => {
    const similar = findSimilarPositions(fen, fens);
    if (similar.length) {
        similarPositions[fen] ??= [];
        similarPositions[fen].push(...similar);
    }
    process.stdout.write('.');
});

const endTime = Date.now();

const { hours, minutes, seconds } = convertMilliseconds(endTime - startTime);

console.log(`${hours} hours, ${minutes} minutes, ${seconds} seconds`);

// No threads, pos only: 0 hours, 23 minutes, 41 seconds
// No threads, pos+: 0 hours, 2 minutes, 15 seconds

fs.writeFileSync('./similar.json', JSON.stringify(similarPositions));
