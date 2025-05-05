import { writeFileSync } from 'fs';

export const concatData = (existing, added, newFromTos, interpolations) => {
    Object.entries(added).forEach(([fen, a]) => {
        if (a.src === 'interpolated') {
            existing.IN.json[fen] = a;
        } else {
            const cat = a.eco[0];
            existing[cat].json[fen] = a;
        }
    });

    newFromTos.forEach(ft => {
        existing.FT.json.concat(ft);
    });

    Object.entries(interpolations).forEach(([fen, opening]) => {
        existing.IN.json[fen] = opening
    })
    
    return existing
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

