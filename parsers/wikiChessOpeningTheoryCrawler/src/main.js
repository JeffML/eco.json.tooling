import { CheerioCrawler, EnqueueStrategy } from "crawlee";



const URL = "https://en.wikibooks.org/wiki/Chess_Opening_Theory";

const specialCases = {
    "https://en.wikibooks.org/wiki/Chess_Opening_Theory/1._d4/1...e6": {name: "Horwitz Defense"}
}

let count = 0;

// Create a CheerioCrawler
const crawler = new CheerioCrawler({
    maxRequestsPerMinute: 250,

    // Function called for each URL
    async requestHandler({ request, enqueueLinks, log, $, pushData }) {
        const url = request.loadedUrl;
        let text;

        if (/1._/.test(url)) {
            text = specialCases[url]?.name
            text ||= $("h2[id]").first().text();

            if (text === "" || /Theory|References/.test(text)) {
                text = $("h1[id]").first().text();
                if (text.startsWith("Chess")) {
                    text = $("h1[id]:nth-child(1)").text();
                }
            }

            if (++count%100 === 0) log.info(count)

            // if (!text)
            //     log.info(`No text for ${url}`);

            await pushData({ url, text });
        } else {
            log.info(`skipped ${url}`);
        }

        // Add some links from page to the crawler's RequestQueue
        await enqueueLinks({
            globs: [`${request.url}/**`],
        });
    },
});

// Define the starting URL
await crawler.addRequests([URL]);

// Run the crawler
await crawler.run();
