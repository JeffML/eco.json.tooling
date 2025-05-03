import { writeFileSync } from 'fs';

export const concatData = (existing, added, newFromTos) => {
    added.forEach(a => {
        if (a.src === 'interpolated') {
            existing.IN.concat(a);
        } else {
            const cat = a.eco[0];
            existing[cat].concat(a);
        }
    });

    newFromTos.forEach(ft => {
        existing.FT.concat(ft);
    });
};

export const writeNew = (newExisting) => {
    for (const cat in newExisting) {
        if (cat === FT) {
            writeFileSync('./output/toMerge/fromTo.json', JSON.stringify(newExisting[cat]));
        } else if (cat === IN) {
            writeFileSync('./output/toMerge/eco_interpolated.json', JSON.stringify(newExisting[cat], null, 2));
        } else {
            writeFileSync(`./output/toMerge/eco${cat}.json`, JSON.stringify(newExisting[cat], null, 4));
        }
    }
};

