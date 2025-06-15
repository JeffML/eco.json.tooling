import fs from 'fs';
import readline from 'readline';

const fileStream = fs.createReadStream('chess-graph.csv');

const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
});

let lineCt = 0;
let parseCt = 0;

const regex = /^([ABCDE]\d{2}),("?.*"?),(.*)$/;

const regex2 = /^([ABCDE]\d{2}),[ABCDE]\d{2},(.*)$/;

let lastName;

const pass1 = [];

rl.on('line', (line) => {
    // Process each line here
    let [, eco, name, plies] = line.match(regex) ?? [];
    if (eco) {
        lastName = name.replaceAll('"', '');
    } else {
        [, eco, plies] = line.match(regex2) ?? [];
    }

    lineCt++;
    if (!eco) console.log('!', line);
    else {
        pass1.push({ eco, name: lastName, plies });
        parseCt++;
    }
});

rl.on('close', () => {
    console.log('Finished reading chess-graph.csv');
    console.log({ linesRead: lineCt, linesParsed: parseCt });

    pass2(pass1);
});

const pass2 = (pass1) => {
    const openings = [
        {
            src: 'chessGraph',
            url: 'https://github.com/Destaq/chess-graph/blob/master/elo_reading/openings_sheet.csv?plain=1',
        },
    ];

    pass1.forEach(({ eco, name, plies }) => {
        let moves = '';
        let moveNum = 1

        plies.split(' ').forEach((ply, i) => {
            if (i % 2 === 0) moves += ' ' + moveNum++ + '.';
            moves += ' ' + ply;
        });

        openings.push({ eco, name, moves:moves.substring(1) });
    });

    fs.writeFileSync('./opening.json', JSON.stringify(openings, null, 2));
};
