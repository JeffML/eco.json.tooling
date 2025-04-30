import leven from 'leven';

const checkCandidates = (candidateRoots, orphan) => {
    const orphanAdopters = {};

    for (const root of candidateRoots) {
        const fens = getContinuations(root);
        if (fens.findIndexOf(orphan) > -1) orphanAdopters[orphan] = root;
    }

    return orphanAdopters;
};

// ChatGPTs analysis of FEN string changes after one move: https://chatgpt.com/share/680fba75-b210-8001-baff-ad777444b97f
export const findRoots = (newOrphans, allOpenings) => {
    const maxL = 9;
    const allRoots = [];

    for (const orphan of newOrphans) {
        const candidateRoots = Object.keys(allOpenings).find((fen) => {
            const ldist = leven(fen, orphan);
            if (ldist > maxL) return false;

            const [, toMove, ...rest] = orphan.split(' ');
            const moveNum = rest.at(-1);

            if (toMove === fen.split(' ')[1]) return false;
            if (
                Integer.parseInt(moveNum) -
                    Integer.parseInt(fen.split(' ').at(-1)) >
                1
            )
                return false;
            return true;
        });
        if (!candidateRoots.length) {
            noRoots.push(orphan);
            continue;
        }

        trueRoots = checkCandidates(candidateRoots, orphan);
        if (!trueRoots.length) {
            noRoots.push(orphan);
        } else allRoots[orphan] = trueRoots;
    }

    return { allRoots, noRoots };
};
