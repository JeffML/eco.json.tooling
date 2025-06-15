import {Chess} from 'chess.js'
import fs from 'fs'
import { ecoJsonMerged } from '../../getLatestEcoJson.js'
import leven from 'leven'

const chess = new Chess()

// file:///home/chronos/u-a5d83366612aa8feeee6083530d5bb7f7b8939a9/MyFiles/Downloads/eco.pgn
const pgn = fs.readFileSync('./chronos.pgn', 'utf8')
// const pgn = fs.readFileSync('./trunc.pgn', 'utf8')
const ob = await ecoJsonMerged()

const openings= [
    {src: "chronos", url: "file:///home/chronos/u-a5d83366612aa8feeee6083530d5bb7f7b8939a9/MyFiles/Downloads/eco.pgn"}
]

for (const game of pgn.split(/\*|1-0|0-1/)) {
    // console.log(game)
    chess.loadPgn(game)
    const fen = chess.fen()
    if (!ob[fen]) process.stdout.write('+')
    else {
        const {Opening, Variation, ECO} = chess.getHeaders()
        const obEntry = ob[fen]
        const obName = obEntry.name 
        const obSrc = obEntry.src
        const pgnName = Opening + (Variation? ": " + Variation : "")

        if (leven(obName, pgnName) > 3) {
            const moves = game.substring(game.indexOf('1. '))
            openings.push({name:pgnName, moves, eco:ECO})
        }
        if (obSrc === 'interpolated') process.write('I')
    }
}

fs.writeFileSync('./opening.json', JSON.stringify(openings, null, 2))
