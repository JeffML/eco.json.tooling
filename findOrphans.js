// for the new openings, see if any are orphans (no roots)
export const findOrphans = (added, fromTo) => {
    const orphans = [];

    for (const a of Object.keys(added)) {
        const hasParent = fromTo.find((ft) => ft[1] === a);
        const isOrphan = !hasParent;
        if (isOrphan) orphans.push(a);
    }

    return orphans;
};
