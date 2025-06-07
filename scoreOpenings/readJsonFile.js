import fs from 'fs'
import path from 'path'

const readJsonFile = (fileName, log=false) => {
    const FOLDER = ".";
    const __dirname = new URL(".", import.meta.url).pathname;

    const file = path.join(__dirname, FOLDER, fileName);
    const strbuf = fs.readFileSync(file);

    const openings = JSON.parse(strbuf);

    if (log) console.log("Read in", Object.keys(openings).length, "records");
    return openings;
};

export {readJsonFile as default, readJsonFile}