import { writeFileSync } from 'fs';
import { hardAssert } from './utils';
import { moreFromTos } from './addedContinuations';

const theJson = (cat, existing) => {
    return existing[cat].json
}

const applyAdded = (added, existing) => {
    for (const fen in added) {        
        const theNew = added[fen]
        const cat = theNew.eco[0]
        const existingJson = theJson(cat, existing)
        hardAssert(!existingJson[fen], "added exists already!") // should not be there
        delete theNew.fen
        existingJson[fen] = theNew
    }
}

// could be added aliases or modified interpolated
const applyModified = (modified, existing) => {
    for (const fen in modified) {
        const theMod = modified[fen]
        const cat = theMod.src === 'interpolated'? 'IN' : theMod.eco[0]
        const existingJson = theJson(cat, existing)
        hardAssert(existingJson[fen], "can't find record to modify!") //should be there
        existingJson[fen] = theMod
    }
}

const removeFormerInterpolated = (formerInterpolated, interpolated) => {
    for (const fen in formerInterpolated) {
        hardAssert(interpolated[fen], "can't find old interpolated!")
        delete interpolated[fen]
    }
}

const applyFromTos = (newFromTos, moreFromTos, existingFromTos) => {
    
}

/**
 * 
 * @param {} existing universal opening data. includes all eco.json file data 
 * @param {*} added openings to add
 * @param {*} newFromTos normal continuation fromTos
 * @param {*} moreFromTos continuation fromTos with possible interpolations
 */
export const applyData = (existing, added, newFromTos, moreFromTos, formerInterpolated, modified) => {
    console.log('applying data')
    applyAdded(added, existing)
    applyModified(modified, existing)
    removeFormerInterpolated(formerInterpolated, existing.IN.json)
    applyFromTos(newFromTos, moreFromTos, existing.FT.json)
};

export const writeNew = (newExisting) => {
    for (const cat in newExisting) {
        if (cat === 'FT') {
            writeFileSync('./output/toMerge/fromTo.json', JSON.stringify(newExisting[cat].json));
        } else if (cat === 'IN') {
            writeFileSync('./output/toMerge/eco_interpolated.json', JSON.stringify(newExisting[cat].json, null, 2));
        } else {
            writeFileSync(`./output/toMerge/eco${cat}.json`, JSON.stringify(newExisting[cat].json, null, 4));
        }
    }
};

