export const config = {
    htmlSources: [
        {
            note: "this site's pgn files do not appear to contain any opening headers",
            name: 'pgnmentor',
            url: 'https://www.pgnmentor.com/files.html',
            enabled: false,
        },
        {
            name: 'twic',
            url: 'https://theweekinchess.com/twic',
            enabled: false,
        },
        {
            name: 'Lichess Elite',
            url: 'https://database.nikonoel.fr/',
            enabled: true,
        },
    ],
    linksFile: 'output/pgn-links.json',
    outputFile: 'output/openings.json',
    cacheDir: './cache',
    maxPlies: 50, // Maximum plies (half-moves) to track per game (generates maxPlies+1 FEN positions including starting position)
    maxFilesPerSitePerSession: 1, //12,
    linkPatterns: [
        /\.pgn$/i,
        /\.pgn\.zip$/i,
        /\.pgn\.gz$/i,
        /\.pgn\.bz2$/i,
        /\.zip$/i,
    ],
    
    // HTTP request settings
    requestTimeout: 30000,
    
    // Processing settings
    progressReportInterval: 500,
    
    // Scheduler settings
    schedulerIntervalHours: 6,

    // Minimum occurrence count for candidate openings
    candidateOccurenceMinimum: 5,
};