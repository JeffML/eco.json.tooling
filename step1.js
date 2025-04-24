import fetch from "node-fetch";
import { Octokit } from "octokit";
import fs from "fs";
import path from "path";

const filesOfInterest = [
    "ecoA.json",
    "ecoB.json",
    "ecoC.json",
    "ecoD.json",
    "ecoE.json",
    "fromTo.json",
    "eco_interpolated.json",
];
// let release = await getRepoByFetch();
let urls = await getDownloadUrls();

const openings = {}

const promises = []

for (const url of urls) {
    if (!url) continue;

    promises.push(await fetch(url))
}

const responses = await Promise.all(promises)

let i = 0

for (const r of responses) {
    openings[filesOfInterest[i++]] = await r.json()
}

console.dir(openings)

async function getDownloadUrls() {
    const octokit = new Octokit(); // No auth

    const { data } = await octokit.request(
        "GET /repos/{owner}/{repo}/contents/",
        {
            owner: "hayatbiralem",
            repo: "eco.json",
        }
    );

    const downloads = data.map((meta) => { 
        if ( filesOfInterest.includes(meta.name ))
            return meta.download_url
    });
    return downloads;
}


/*
https://github.com/hayatbiralem/eco.json/archive/refs/tags/v3.2.0.zip
<a href="/hayatbiralem/eco.json/archive/refs/tags/v3.2.0.zip" rel="nofollow" data-turbo="false" data-view-component="true" class="Truncate">
    <span data-view-component="true" class="Truncate-text text-bold">Source code</span>
    <span data-view-component="true" class="Truncate-text">(zip)</span>
</a>
*/
