import distance from 'leven';
import { getLatestEcoJson } from '../getLatestEcoJson.js';
import fs from 'fs';

const MAX_DISTANCE = 5;

/**
 * Finds FEN strings in the array with Levenshtein distance < 5 from the target FEN.
 * @param targetFEN The FEN string to compare against.
 * @param fenArray Array of FEN strings.
 * @returns Array of FEN strings with distance < 5.
 */
function findSimilarPositions([pos, wb, move], posArray) {
    return posArray.filter(([pos2, wb2, move2]) => {
        return (
            move === move2 &&
            wb === wb2 &&
            pos !== pos2 &&
            distance(pos, pos2) <= MAX_DISTANCE
        );
    });
}

function convertMilliseconds(milliseconds) {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return { hours, minutes, seconds };
}

const startTime = Date.now();

const byCat = await getLatestEcoJson();

const { A, B, C, D, E, IN } = byCat;

const book = {
    ...A.json,
    ...B.json,
    ...C.json,
    ...D.json,
    ...E.json,
    ...IN.json,
};

const fens = Object.keys(book).filter((fen) => {
    const moveNumber = parseInt(fen.split(' ').at(-1));
    return moveNumber >= 5;
});

// const positions = fens.slice(0, 500).map((fen) => {
const positions = fens.map((fen) => {
    const [pos, wb, , , , move] = fen.split(' ');
    return [pos, wb, move];
});

const similarPositions = {};

positions.forEach((pos) => {
    const similar = findSimilarPositions(pos, positions);
    if (similar.length) {
        similarPositions[pos[0]] ??= [];
        similarPositions[pos[0]].push(...similar.map((s) => s[0]));
    }
    process.stdout.write('.');
});

const endTime = Date.now();

const { hours, minutes, seconds } = convertMilliseconds(endTime - startTime);

console.log(`${hours} hours, ${minutes} minutes, ${seconds} seconds`);

// No threads, pos only: 0 hours, 23 minutes, 41 seconds
// No threads, pos+: 0 hours, 2 minutes, 15 seconds

fs.writeFileSync('./similar.json', JSON.stringify(similarPositions));
