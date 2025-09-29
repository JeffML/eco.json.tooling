export const toMoveList = (plies) => {
    let moveList = '';

    plies.forEach((ply, i) => {
        if (i % 2 === 0) {
            const moveNum = Math.floor(i / 2) + 1;
            moveList += `${moveNum}. ${ply} `;
        } else {
            moveList += `${ply} `;
        }
    });

    return moveList;
};
