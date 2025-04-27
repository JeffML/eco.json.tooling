import { Octokit } from "octokit";

// not used, but kept in case github d/l urls ever change in the far future
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

export {getDownloadUrls}

