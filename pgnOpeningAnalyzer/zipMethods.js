import AdmZip from 'adm-zip';
import path from 'path';

// Check if ZIP file contains PGN files
export async function inspectZipFile(zipBuffer) {
    try {
        // Validate buffer
        if (!zipBuffer || zipBuffer.length === 0) {
            console.error('Empty or null ZIP buffer');
            return null;
        }

        // Check if buffer looks like a ZIP file
        const zipSignature = zipBuffer.slice(0, 4);
        const validSignatures = [
            Buffer.from([0x50, 0x4B, 0x03, 0x04]), // Standard ZIP
            Buffer.from([0x50, 0x4B, 0x05, 0x06]), // Empty ZIP
            Buffer.from([0x50, 0x4B, 0x07, 0x08])  // Spanned ZIP
        ];

        const isValidZip = validSignatures.some(sig => zipSignature.equals(sig.slice(0, zipSignature.length)));
        if (!isValidZip) {
            console.error('Buffer does not appear to be a valid ZIP file');
            return null;
        }

        const zip = new AdmZip(zipBuffer);
        const entries = zip.getEntries();

        if (!entries || entries.length === 0) {
            console.log('ZIP file appears to be empty');
            return null;
        }

        const pgnEntries = entries.filter((entry) => {
            try {
                // Skip directories
                if (entry.isDirectory) return false;

                // Check filename safely
                const fileName = entry.entryName;
                if (!fileName || typeof fileName !== 'string') {
                    console.warn(`Invalid entry name: ${fileName}`);
                    return false;
                }

                // Check for PGN extension (case insensitive)
                const lowercaseName = fileName.toLowerCase();
                return lowercaseName.endsWith('.pgn');
            } catch (error) {
                console.warn(`Error checking entry ${entry.entryName}: ${error.message}`);
                return false;
            }
        });

        console.log(`ZIP contains ${entries.length} total entries, ${pgnEntries.length} PGN files`);
        return pgnEntries.length > 0 ? pgnEntries : null;
    } catch (error) {
        console.error(`Error inspecting ZIP file: ${error.message}`);
        
        // Try alternative approaches for problematic ZIP files
        try {
            console.log('Attempting alternative ZIP inspection...');
            return await inspectZipAlternative(zipBuffer);
        } catch (altError) {
            console.error(`Alternative inspection also failed: ${altError.message}`);
            return null;
        }
    }
}

// Alternative ZIP inspection for problematic files
async function inspectZipAlternative(zipBuffer) {
    try {
        // Try with different options
        const zip = new AdmZip(zipBuffer, { readEntries: false });
        
        // Force read entries
        zip.readEntries = true;
        const entries = zip.getEntries();
        
        const pgnCount = entries.filter(entry => {
            try {
                return entry.entryName && 
                       typeof entry.entryName === 'string' && 
                       entry.entryName.toLowerCase().endsWith('.pgn') && 
                       !entry.isDirectory;
            } catch (e) {
                return false;
            }
        }).length;
        
        console.log(`Alternative method found ${pgnCount} PGN files`);
        return pgnCount > 0 ? entries : null;
    } catch (error) {
        console.error(`Alternative ZIP inspection failed: ${error.message}`);
        return null;
    }
}

// Extract and process PGN files from ZIP
export async function processZipFile(zipBuffer, zipUrl, parsePGNCallback) {
    try {
        const pgnEntries = await inspectZipFile(zipBuffer);

        if (!pgnEntries || pgnEntries.length === 0) {
            console.log(`No processable content in ${path.basename(zipUrl)}`);
            return 0;
        }

        let totalProcessed = 0;
        const zip = new AdmZip(zipBuffer);

        for (const entry of pgnEntries) {
            try {
                console.log(`Processing PGN from ZIP: ${entry.entryName}`);
                
                // Get data with error handling
                let pgnContent;
                try {
                    pgnContent = entry.getData();
                } catch (dataError) {
                    console.warn(`Failed to extract ${entry.entryName}: ${dataError.message}`);
                    continue;
                }

                if (!pgnContent || pgnContent.length === 0) {
                    console.warn(`Empty content in ${entry.entryName}`);
                    continue;
                }

                // Convert buffer to string if needed
                let pgnText;
                if (Buffer.isBuffer(pgnContent)) {
                    try {
                        pgnText = pgnContent.toString('utf8');
                    } catch (conversionError) {
                        // Try latin1 encoding for older files
                        try {
                            pgnText = pgnContent.toString('latin1');
                        } catch (latin1Error) {
                            console.warn(`Encoding issues with ${entry.entryName}: ${latin1Error.message}`);
                            continue;
                        }
                    }
                } else {
                    pgnText = pgnContent;
                }

                // Basic validation
                if (!pgnText || typeof pgnText !== 'string' || pgnText.trim().length === 0) {
                    console.warn(`Invalid PGN content in ${entry.entryName}`);
                    continue;
                }

                // Check if it looks like PGN content
                if (!pgnText.includes('[') || !pgnText.includes(']')) {
                    console.warn(`${entry.entryName} doesn't appear to contain PGN headers`);
                    continue;
                }

                parsePGNCallback(pgnText);
                totalProcessed++;
                
            } catch (error) {
                console.error(`Error processing ${entry.entryName}: ${error.message}`);
                // Continue with other files
            }
        }

        console.log(`Successfully processed ${totalProcessed} PGN files from ZIP`);
        return totalProcessed;
        
    } catch (error) {
        console.error(`Error processing ZIP file: ${error.message}`);
        return 0;
    }
}