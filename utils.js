import { Octokit } from "octokit";
import readline from "node:readline";
import fs from "fs";
import path from "path";

// not used, but kept in case github d/l urls ever change in the far future
async function getDownloadUrls() {
  const octokit = new Octokit(); // No auth

  const { data } = await octokit.request(
    "GET /repos/{owner}/{repo}/contents/",
    {
      owner: "JeffML",
      repo: "eco.json",
    },
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
    throw new Error(message || "Assertion failed");
  }
}

const readJsonFile = (fileName, log = false) => {
  const FOLDER = ".";
  const __dirname = new URL(".", import.meta.url).pathname;

  const file = path.join(__dirname, FOLDER, fileName);
  const strbuf = fs.readFileSync(file);

  const openings = JSON.parse(strbuf);

  if (log) console.log("Read in", Object.keys(openings).length, "records");
  return openings;
};

let openingsByCat;

// pulls the opening data from eco.json github repo
export async function getLatestEcoJson() {
  const ROOT = "https://raw.githubusercontent.com/JeffML/eco.json/master/";
  if (openingsByCat) return openingsByCat;

  openingsByCat = {
    A: { url: ROOT + "ecoA.json" },
    B: { url: ROOT + "ecoB.json" },
    C: { url: ROOT + "ecoC.json" },
    D: { url: ROOT + "ecoD.json" },
    E: { url: ROOT + "ecoE.json" },
    IN: { url: ROOT + "eco_interpolated.json" },
    FT: { url: ROOT + "fromTo.json" },
  };

  const promises = [];
  for (const cat in openingsByCat) {
    promises.push(fetch(openingsByCat[cat].url));
  }

  const res = await Promise.all(promises);
  let i = 0;

  for (const cat in openingsByCat) {
    const json = await res[i++].json();
    openingsByCat[cat].json = json;
  }

  return openingsByCat;
}

export { getDownloadUrls, keyLen, prompt, chunker, hardAssert, readJsonFile };

export function convertMilliseconds(milliseconds) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return { hours, minutes, seconds };
}

const byCat = await getLatestEcoJson();
const { A, B, C, D, E, IN } = byCat;

export const book = {
  ...A.json,
  ...B.json,
  ...C.json,
  ...D.json,
  ...E.json,
  ...IN.json,
};
