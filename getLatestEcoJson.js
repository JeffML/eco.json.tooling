import fetch from 'node-fetch';

// pulls the opening data from eco.json github repo
export async function getLatestEcoJson() {
    const ROOT = 'https://raw.githubusercontent.com/hayatbiralem/eco.json/master/';
    const openingsByCat = {
        A: { url: ROOT + 'ecoA.json' },
        B: { url: ROOT + 'ecoB.json' },
        C: { url: ROOT + 'ecoC.json' },
        D: { url: ROOT + 'ecoD.json' },
        E: { url: ROOT + 'ecoE.json' },
        IN: { url: ROOT + 'eco_interpolated.json' },
        FT: { url: ROOT + 'fromTo.json' },
    };

    const promises = [];
    for (const cat in openingsByCat) {
        promises.push(fetch(openingsByCat[cat].url));
    }

    const res = await Promise.all(promises);
    let i = 0;

    for (const cat in openingsByCat) {
        const json = await res[i++].json();
        openingsByCat[cat].json = json;
    }

    return openingsByCat;
}

export const catArray = ['A', 'B', 'C', 'D', 'E', 'IN']

export async function ecoJsonMerged() {
    const ecojson = await getLatestEcoJson()

    let json = {}

    for (const cat in ecojson) {
        if (catArray.includes(cat)) json = {...json, ...ecojson[cat].json}
    }

    return json
}