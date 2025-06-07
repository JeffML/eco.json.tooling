import { readJsonFile, hardAssert } from '../utils.js';
import fs from 'fs';

import UCI from './uciClass.js';

const ENGINE_COUNT = 15;

let engines;

const startEngines = async () => {
    const engines = [];

    for (let i = 0; i <= ENGINE_COUNT; i++) {
        const uci = new UCI();
        await uci.init();
        engines[i] = uci;
    }

    return engines;
};

const evaluate = async (fens) => {
    const promises = [];

    for (const [i, fen] of Object(fens).entries()) {
        promises[i] = engines[i].getScoreForPosition(fen, 1500);
    }

    const results = await Promise.allSettled(promises);
    // const scores = results.map(({ value }) => value);

    return results.reduce((acc, result, i) => {
        acc[fens[i]] = result.value;
        return acc;
    }, {});
};

const scoreEm = async (unscored) => {
    const fens = Object.keys(unscored);
    let scored = {};
    let start = 0;

    engines = await startEngines();

    while (start < fens.length) {
        const newScores = await evaluate(
            fens.slice(start, start + ENGINE_COUNT)
        );
        Object.assign(scored, newScores);

        process.stdout.write('.');
        start += ENGINE_COUNT;
    }

    engines.forEach((engine) => engine.quit());

    hardAssert(scored.length === unscored.length, 'not all fens were scored!');
    return scored;
};

const all = readJsonFile('./scoreOpenings/input/scoreInfo.json');

const scored = await scoreEm(all.unscored);

fs.writeFileSync(
    './output/scored.json',
    JSON.stringify({ ...all.scored, ...scored }, null, 2)
);

console.log('DONE!');
