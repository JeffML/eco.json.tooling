export const config = {
    htmlSources: [
        {
            name: 'pgnmentor',
            url: 'https://www.pgnmentor.com/files.html',
            enabled: false,
        },
        {
            name: 'twic',
            url: 'https://theweekinchess.com/twic',
            enabled: true,
        },
        {
            name: 'lichess_db',
            url: 'https://database.lichess.org/',
            enabled: false,
        },
    ],
    linksFile: 'pgn-links.json',
    outputFile: 'openings.json',
    cacheDir: './cache',
    maxMoves: 25,
    maxFilesPerSitePerSession: 2, //12,
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
};