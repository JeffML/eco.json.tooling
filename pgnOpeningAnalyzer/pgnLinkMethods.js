import fs from 'fs/promises';
import path from 'path';

// Extract PGN links from HTML content
export function extractPgnLinks(html, baseUrl, linkPatterns) {
    const links = new Set();

    // Simple regex to find href attributes
    const hrefRegex = /href\s*=\s*["']([^"']+)["']/gi;
    let match;

    while ((match = hrefRegex.exec(html)) !== null) {
        const href = match[1];

        // Check if it matches any PGN pattern or is a ZIP file that might contain PGNs
        const isPgnLink = linkPatterns.some((pattern) =>
            pattern.test(href)
        );

        if (!isPgnLink) continue;

        try {
            // Resolve relative URLs
            const fullUrl = new URL(href, baseUrl).toString();
            links.add(fullUrl);
        } catch (error) {
            console.warn(`Invalid URL found: ${href}`);
        }
    }

    return Array.from(links);
}

// Scrape HTML page for PGN links
export async function scrapePgnLinks(source, makeRequest, linkPatterns) {
    try {
        console.log(`Scraping PGN links from ${source.name}...`);

        const response = await makeRequest(source.url);
        if (response.statusCode !== 200) {
            throw new Error(`HTTP ${response.statusCode}`);
        }

        const html = response.body.toString('utf8');
        const links = extractPgnLinks(html, source.url, linkPatterns);

        console.log(`Found ${links.length} PGN links on ${source.name}`);
        return links;
    } catch (error) {
        console.error(`Failed to scrape ${source.name}: ${error.message}`);
        return [];
    }
}

// Load existing PGN links
export async function loadPgnLinks(linksFile) {
    try {
        const data = await fs.readFile(linksFile, 'utf8');
        const pgnLinks = JSON.parse(data);

        // Convert processedFiles arrays back to Sets
        for (const sourceName in pgnLinks.sources) {
            const source = pgnLinks.sources[sourceName];
            if (Array.isArray(source.processedFiles)) {
                source.processedFiles = new Set(source.processedFiles);
            } else if (!source.processedFiles) {
                source.processedFiles = new Set();
            }
        }

        console.log(
            `Loaded ${pgnLinks.totalLinks} existing PGN links`
        );
        return pgnLinks;
    } catch (error) {
        console.log('No existing PGN links file found');
        return {
            sources: {},
            lastUpdated: null,
            totalLinks: 0,
        };
    }
}

// Save PGN links
export async function savePgnLinks(pgnLinks, linksFile) {
    pgnLinks.lastUpdated = new Date().toISOString();
    pgnLinks.totalLinks = Object.values(pgnLinks.sources).reduce(
        (total, source) => total + source.links.length,
        0
    );

    // Convert Sets to Arrays for JSON serialization
    const serializable = JSON.parse(JSON.stringify(pgnLinks));
    for (const sourceName in serializable.sources) {
        if (pgnLinks.sources[sourceName].processedFiles) {
            serializable.sources[sourceName].processedFiles = Array.from(
                pgnLinks.sources[sourceName].processedFiles
            );
        }
    }

    await fs.writeFile(
        linksFile,
        JSON.stringify(serializable, null, 2)
    );
    console.log(`Saved ${pgnLinks.totalLinks} PGN links`);
}

// Update PGN links for a source
export function updatePgnLinksForSource(pgnLinks, sourceName, newLinks) {
    if (!pgnLinks.sources[sourceName]) {
        pgnLinks.sources[sourceName] = {
            links: [],
            lastScraped: null,
            newLinksFound: 0,
            processedFiles: new Set(),
        };
    }

    const source = pgnLinks.sources[sourceName];
    const oldLinks = new Set(source.links);

    // Find truly new links
    const addedLinks = newLinks.filter((link) => !oldLinks.has(link));

    source.links = newLinks;
    source.lastScraped = new Date().toISOString();
    source.newLinksFound = addedLinks.length;

    // Ensure processedFiles is a Set (for backward compatibility)
    if (Array.isArray(source.processedFiles)) {
        source.processedFiles = new Set(source.processedFiles);
    } else if (!source.processedFiles) {
        source.processedFiles = new Set();
    }

    if (addedLinks.length > 0) {
        console.log(
            `Found ${addedLinks.length} new PGN links for ${sourceName}`
        );
    }

    return addedLinks.length > 0;
}