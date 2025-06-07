import { Engine } from "node-uci";

/**
 * Wrapper function around node-uci wrapper
 */

class UCI {
    async init() {
        this.engine = new Engine("/usr/games/stockfish");
        await this.engine.init();
        await this.engine.isready();
    }

    async getScoreForPosition(FEN, thinkTime = 1500) {
        const w = FEN.split(" ")[1] === "w" ? 1 : -1;
        try {
            await this.engine.ucinewgame();
            await this.engine.position(FEN);
            const result = await this.engine.go({ movetime: thinkTime });
            let score = result.info.at(-1).score;
            let trueScore = (score.unit === "mate" ? 9999 : score.value) * w;
            trueScore /= 100;
            return trueScore;
        } catch (e) {
            console.error(e.stack);
            throw e;
        }
    }

    async quit() {
        await this.engine.quit();
    }
}

export default UCI;
