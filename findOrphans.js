/**
For the added openings, see if any are orphans (no roots).
Not all added openings will be rootless; for formerly interpolated openings, they are added to eco.json and
removed from eco_interpolated.json, but the fromTo entry in fromTo.json remains

@param {Array} fromTo - An array of tuples, where each tuple represents a relationship:
                         [parentFEN, childFEN, parent.src, child.src]
*/
 export const findOrphans = (added, fromTo) => {
    const orphans = [];
    
    const fromToIndex = fromTo.reduce((acc, ft) => {
        acc[ft[1]] = ft;
        return acc;
    }, {});

    for (const a of Object.keys(added)) {
        const hasParent = fromToIndex[a];
        if (!hasParent) orphans.push(a);
        else {
            hasParent[3] = added[a].src      // update the FT from interpolated to added's src
        }
    }

    return orphans;
};
