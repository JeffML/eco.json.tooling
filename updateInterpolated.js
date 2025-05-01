/*
For all the interpolateds to be removed, we need to update the names and root sources of any interpolated continuations.
Note that an interpolated opening may have multiple continuations, and therefore appear multiple times in the 'from' data in fromTo.json
*/
export const updateInterpolated = (toRemove, added, modified, existing) => {
    const fromTo = existing.FT.json;
    const interpolated = existing.IN.json;
    const fromToIndexed = fromTo.reduce((a, [from, to]) => {
        a[from] ??= [];
        a[from].push(to);
        return a;
    }, {});

    let updated = 0;

    const updateContinuations = (fen, src, name) => {
        let continuations = fromToIndexed[fen];

        for (let c of continuations) {
            const IN = interpolated[c];
            if (IN) {
                IN.rootSrc = src;
                IN.name = name;
                modified[fen] = IN;
                updated++;
                updateContinuations(c, src, name);
            } else break;
        }
    };

    for (const fen of toRemove) {
        const { src, name } = added[fen];
        updateContinuations(fen, src, name);
    }

    return updated;
};
