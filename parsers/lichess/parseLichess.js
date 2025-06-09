import fetch from 'node-fetch';
import fs from 'fs';
import { Chess } from 'chess.js';

export async function getLatestLichessTsv() {
    const promises = [];

    for (const part of ['a', 'b', 'c', 'd', 'e']) {
        const url = `https://raw.githubusercontent.com/lichess-org/chess-openings/master/${part}.tsv`;
        console.log(url);
        promises.push(fetch(url));
    }

    const res = await Promise.all(promises);

    let openings = '';

    for (const part of res) {
        openings += await part.text();
    }

    return openings;
}

function parseTsv(data) {
    const chess = new Chess();
    let lines = data
        .toString()
        .split(/\n/)
        .map((line) => line.split(/\t/));

    const json = [{ src: 'eco_tsv' }];

    lines.forEach((line) => {
        if (line[0] !== 'eco') {
            const [eco, name, moves] = line;
            if (!/^[\t\s]*$/.test(eco)) {
                json.push({ name, eco, moves });
            }
        }
    });

    return json;
}

const rawText = await getLatestLichessTsv();

const json = parseTsv(rawText);

fs.writeFileSync('./output/opening.json', JSON.stringify(json, null, 2));
