import { Octokit } from 'octokit';
import readline from 'node:readline';

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

const prompt = async(q) => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      const answer = await new Promise(resolve => {
        rl.question(q, resolve)
      })
      
    rl.close();
    return answer
}
const keyLen = (o) => Object.keys(o).length;

const chunker = (array, chunkSize) => {
    const chunks = [];

    for (let i = 0; i < array.length; i += chunkSize) {
        chunks.push(array.slice(i, i + chunkSize));
    }

    return chunks
}

export { getDownloadUrls, keyLen, prompt, chunker};
