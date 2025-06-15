import { getLatestEcoJson } from "./getLatestEcoJson.js";

const totals = {
    total: 0
}

const openings = await getLatestEcoJson()

for (const cat in openings) {
    if (['A', 'B', 'C', 'D', 'E'].includes(cat)) {
        const subtotal = Object.keys(openings[cat].json).length
        totals[cat] = subtotal
        totals.total += subtotal
    }
}

console.dir(totals)