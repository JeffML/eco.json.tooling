

# Usage
This parser first runs a crawler for Wikipedia's Chess Opening Theory pages. It is deliberately throttled to 250 requests/min. The crawler creates a /storage folder with many datasets in JSON format. Each dataset is of the format:
```
{
    "url": "https://en.wikibooks.org/wiki/Chess_Opening_Theory/1._d4",
	"text": "1. d4 · Queen's Pawn Opening"
}
```

The crawler will finish when it has no more URLs to process. The next step is to run `genPartialOpeningData.js`. This will generate an `openingMinusEco.json` file. As the name suggests, what's missing are the ECO codes that are *required* for eco.json pull requests. This is left as an exercise for the reader (Hint: almost all the openings will be in one of the eco.json files, so you can lookup an ECO code from those entries; the remainder you can mark as '??' and manually figure out what the code should be and enter it.)

## corrections
Sometimes Wikipedia is wrong, or the page is malformed, or the parsing algorithm is too stupid. Attempts have been made to compensate.

# Further Reading
## Crawlee + CheerioCrawler + JavaScript project

This template is a production ready boilerplate for developing with `CheerioCrawler`. Use this to bootstrap your projects using the most up-to-date code.

If you're looking for examples or want to learn more visit:

- [Tutorial](https://crawlee.dev/docs/guides/cheerio-crawler-guide)
- [Documentation](https://crawlee.dev/api/cheerio-crawler/class/CheerioCrawler)
- [Examples](https://crawlee.dev/docs/examples/cheerio-crawler)
