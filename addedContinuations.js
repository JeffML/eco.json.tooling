// look for any continuations from the new openings
export const addedContinuations = (added) => {
    const continuations = [];

    added.forEach(a => {
        chess.loadFen(a);
        const legalMoves = chess.moves();
        legalMoves.forEach(m => {
            chess.move(m);
            const fen = chess.fen();
            if (allOpenings[fen]) {
                continuations.push([a, fen]);
            }
        });
    });

    return continuations;
};
