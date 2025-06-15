const ecox = /[A-E]\d{2}/;
const namex = /".*"/;

import fs from 'fs';
import readline from 'readline';

const fileStream = fs.createReadStream('arasan.txt');

const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
});

const opening = [{src: "arasan", url:"https://github.com/jdart1/arasan-chess/blob/master/book/eco"}];

rl.on('line', (line) => {
    try {
        if (line && line.length) {
            const eco = line.match(ecox)[0];
            const match = line.match(namex)
            let name = match? match[0] : "";
            // console.log(`${name}`)
            if (!name ) name = ""
            name = name.replaceAll('"', '')
            const smove = line.split(/\s{5}/)[1];
            const moves = (smove && smove.indexOf('"') !== -1)? smove.split('"')[0] : ""
            // console.log({ eco, name: name.replaceAll('"', ''), moves });
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
