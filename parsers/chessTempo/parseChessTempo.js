import { readJsonFile } from '../../utils.js';
import { Chess } from 'chess.js'; // need to normalize move list
import path from 'path';
import fs from 'fs'

const chess = new Chess();
// /home/jlowery2663/eco.json.tooling/parsers/chessTempo/input/chessTempo.json
const inputJson = path.resolve(
    '.',
    '/parsers/chessTempo/input/chessTempo.json'
);
const json = readJsonFile(inputJson);

let parsed = [];
const plies = [];

// recursive
const parseEntries = (entries) => {
    for (const [key, value] of entries) {
        if (key === 'version') continue;
        else if (key === 'length') continue;
        else if (key === 'opening') {
            parsed.push([value.name, [...plies], value.eco]);
        } else {
            plies.push(key);
            parseEntries(Object.entries(value));
        }
    }

    plies.pop();
};

const formatEntries = (parsed) => {
    const formatted = parsed.map(([opening, moveList, eco]) => {
        const [Opening, Subvariation] = opening.split(':');
        try {
            for (let move of moveList) {
                chess.move(move);
            }
        } catch (e) {
            console.error(e);
            process.exit(-1);
        }
        const data = {
            name: `${Opening}, ${Subvariation}`,
            moves: chess.pgn().split(/\n/).at(-1).slice(0, -2),
            eco
        };
        chess.reset();
        return data;
    });

    return [{src: 'ct'}, ...formatted];
};

parseEntries(Object.entries(json.response));

const formatted = formatEntries(parsed);

fs.writeFileSync('./output/opening.json', JSON.stringify(formatted, null, 2));
