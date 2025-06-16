const ecox = /^[A-E]\d{2}/;

import fs from 'fs';
import readline from 'readline';
import {hardAssert} from '../../utils.js'

const fileStream = fs.createReadStream('eco.txt');

const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
});

const opening = [{src: "icsbot", url:"https://github.com/seberg/icsbot/blob/master/misc/eco.txt"}];

rl.on('line', (line) => {
    try {
        if (line && line.length) {
            const [eco, name, moves] = line.split(/\t+/);
            // console.log({eco, name, moves})
            hardAssert(eco.match(ecox), "invalid ECO: " + eco)
            const ecoRepeat = name.match(ecox)
            if (!ecoRepeat)
                opening.push({ eco, name, moves });
        }
    } catch (e) {
        console.error(line, e);
    }
});

rl.on('close', () => {
    console.log('Finished reading file');
    fs.writeFileSync('opening.json', JSON.stringify(opening.filter(o=>o.name!==""), null, 2))
});
