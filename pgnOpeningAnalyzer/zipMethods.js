import AdmZip from 'adm-zip';
import path from 'path';

// Check if ZIP file contains PGN files
export async function inspectZipFile(zipBuffer) {
    try {
        const zip = new AdmZip(zipBuffer);
        const entries = zip.getEntries();

        const pgnEntries = entries.filter((entry) => {
            const fileName = entry.entryName.toLowerCase();
            return fileName.endsWith('.pgn') && !entry.isDirectory;
        });

        console.log(`ZIP contains ${pgnEntries.length} PGN files`);
        return pgnEntries.length > 0 ? pgnEntries : null;
    } catch (error) {
        console.error(`Error inspecting ZIP file: ${error.message}`);
        return null;
    }
}

// Extract and process PGN files from ZIP
export async function processZipFile(zipBuffer, zipUrl, parsePGNCallback) {
    try {
        const zip = new AdmZip(zipBuffer);
        const pgnEntries = await inspectZipFile(zipBuffer);

        if (!pgnEntries) {
            console.log(
                `No PGN files found in ZIP: ${path.basename(zipUrl)}`
            );
            return 0;
        }

        let totalProcessed = 0;

        for (const entry of pgnEntries) {
            try {
                console.log(`Processing PGN from ZIP: ${entry.entryName}`);
                const pgnContent = entry.getData();

                if (pgnContent && pgnContent.length > 0) {
                    parsePGNCallback(pgnContent);
                    totalProcessed++;
                }
            } catch (error) {
                console.error(
                    `Error processing ${entry.entryName}: ${error.message}`
                );
            }
        }

        console.log(`Processed ${totalProcessed} PGN files from ZIP`);
        return totalProcessed;
    } catch (error) {
        console.error(`Error processing ZIP file: ${error.message}`);
        return 0;
    }
}