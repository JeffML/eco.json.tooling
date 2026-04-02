import fs from 'fs'
const pos = (fen) => fen.split(' ')[0];

async function fromTo () {
    const response = await fetch('https://raw.githubusercontent.com/JeffML/eco.json/master/fromTo.json')

    const FT = await response.json()

    const fromTo = FT.reduce((acc, [from, to]) => {
        acc.to[pos(from)] ??= []  
        acc.to[pos(from)].push(to) // continuations from FEN
        acc.from[pos(to)] ??= []
        acc.from[pos(to)].push(from) // roots of FEN
        return acc;
    }, {to: {}, from:{}})

    return fromTo
}

const json = await fromTo();

fs.writeFileSync('./output/fromToPositionIndexed.json', JSON.stringify(json))

console.log('done')