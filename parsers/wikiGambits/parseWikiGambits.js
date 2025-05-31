import fs from 'fs';

const SEP = '&#8211;';
const regex = new RegExp(
    /li>([\w\s]+)&#8211;\s([A-E]\d{2})\s&#8211;\s(.*\s?)<sup/g
);

function parseGambitPage() {
    // downloaded from https://en.wikipedia.org/wiki/List_of_chess_gambits
    const html = fs.readFileSync(
        './input/List of chess gambits - Wikipedia.html',
        'utf8'
    );

    const results = [{src: 'eco_wikip.g'}];

    for (;;) {
        let match = regex.exec(html);
        if (match) {
            const [name, eco, moves] = match.slice(1, 4)
            results.push({name: name.trim(), eco, moves: moves.replace("0-0", "O-O").replace("-0", "-O")})
        }
        else break;
    }

    return results;
}

const results = parseGambitPage()

fs.writeFileSync('./output/opening.json', JSON.stringify(results, null, 2))

