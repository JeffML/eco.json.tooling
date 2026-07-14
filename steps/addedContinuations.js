import { ChessPGN } from "@chess-pgn/chess-pgn";
import { allOpenings } from "./incoming.js";

const chess = new ChessPGN();

const posOnly = (fen) => fen.split(" ")[0];

/**
 * Finds continuations from newly added openings.
 *
 * @param {Object} added - An object where keys are FEN strings of newly added openings.
 * @returns {Array} An array of continuations, where each continuation is a tuple [fromFEN, toFEN].
 */
export const addedContinuations = (added) => {
  const continuations = [];

  // Build position-only index of all known openings (existing + newly added).
  // Maps position-only FEN → array of { fen, data } for transposition-aware lookup.
  const positionIndex = {};
  const indexPos = (fen, data) => {
    const pos = posOnly(fen);
    if (!positionIndex[pos]) positionIndex[pos] = [];
    positionIndex[pos].push({ fen, data });
  };
  for (const [fen, data] of Object.entries(allOpenings)) indexPos(fen, data);
  for (const [fen, data] of Object.entries(added)) indexPos(fen, data);

  Object.keys(added).forEach((fen) => {
    try {
      chess.load(fen);
      const legalMoves = chess.moves();

      legalMoves.forEach((move) => {
        chess.move(move);
        const to = chess.fen();

        // Try exact match first, then position-only fallback
        const toData = allOpenings[to] ?? added[to] ?? positionIndex[posOnly(to)]?.[0]?.data;
        const toFen = allOpenings[to] || added[to] ? to : (positionIndex[posOnly(to)]?.[0]?.fen ?? to);

        if (toData) {
          continuations.push({
            from: fen,
            to: toFen,
            fromData: added[fen],
            toData,
          });
        }

        chess.undo();
      });
    } catch (e) {
      console.error(`Error processing FEN: ${fen} - ${e.message}`);
    }
  });

  return continuations;
};

/**
 * Generates `fromTo` relationships from lines of descent.
 *
 * @param {Array} linesOfDescent - Array of lines of descent, where each line is an array of openings.
 * @returns {Array} An array of `fromTo` relationships.
 */
export const moreFromTos = (linesOfDescent) => {
  const moreFromTos = [];

  linesOfDescent.forEach((lod) => {
    const reversedLod = lod.reverse();

    reversedLod.forEach((current, i) => {
      if (i + 1 < reversedLod.length) {
        const next = reversedLod[i + 1];

        try {
          chess.loadPgn(current.moves);
          const from = chess.fen();

          chess.loadPgn(next.moves);
          const to = chess.fen();

          moreFromTos.push({
            from,
            to,
            fromData: current,
            toData: next,
          });
        } catch (e) {
          console.error(`Error processing line of descent: ${e.message}`);
        }
      }
    });
  });

  return moreFromTos;
};

/**
 * Converts continuations into canonical `fromTo` relationships.
 *
 * @param {Array} continuations - Array of continuations, where each continuation contains `from` and `to` data.
 * @returns {Array} An array of canonical `fromTo` relationships.
 */
export const canonicalFromTos = (continuations) => {
  return continuations.map(({ from, to, fromData, toData }) => {
    return [from, to, fromData.src, toData.src];
  });
};
