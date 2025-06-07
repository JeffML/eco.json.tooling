import { Octokit } from 'octokit';
import readline from 'node:readline';
import fs from 'fs'
import path from 'path'

// not used, but kept in case github d/l urls ever change in the far future
async function getDownloadUrls() {
    const octokit = new Octokit(); // No auth

    const { data } = await octokit.request(
        'GET /repos/{owner}/{repo}/contents/',
        {
            owner: 'hayatbiralem',
            repo: 'eco.json',
        }
    );

    const downloads = data.map((meta) => {
        if (filesOfInterest.includes(meta.name)) return meta.download_url;
    });
    return downloads;
}

const prompt = async (q) => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    const answer = await new Promise((resolve) => {
        rl.question(q, resolve);
    });

    rl.close();
    return answer;
};
const keyLen = (o) => Object.keys(o).length;

const chunker = (array, chunkSize) => {
    const chunks = [];

    for (let i = 0; i < array.length; i += chunkSize) {
        chunks.push(array.slice(i, i + chunkSize));
    }

    return chunks;
};

function hardAssert(condition, message) {
    console.assert(condition, message);
    if (!condition) {
        throw new Error(message || 'Assertion failed');
    }
}

const readJsonFile = (fileName, log=false) => {
    const FOLDER = ".";
    const __dirname = new URL(".", import.meta.url).pathname;

    const file = path.join(__dirname, FOLDER, fileName);
    const strbuf = fs.readFileSync(file);

    const openings = JSON.parse(strbuf);

    if (log) console.log("Read in", Object.keys(openings).length, "records");
    return openings;
};

export { getDownloadUrls, keyLen, prompt, chunker, hardAssert, readJsonFile };
