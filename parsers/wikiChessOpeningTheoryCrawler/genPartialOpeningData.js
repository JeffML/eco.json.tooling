import readJsonFile from "../../../eco2jsonTools/readJsonFile.js";
import fs from "fs";
import path from "path";
import { Chess } from "chess.js";

// handle fouled-up entries
const correctedUrls = {
    // corrected by redirect on site
    "https://en.wikibooks.org/wiki/Chess_Opening_Theory/1._e4/1...e5/2._Nf3/2...Nc6/3._Bb5/3...a6/4._Ba4/4...Nf6/5._d3/6._Bb3":
        "https://en.wikibooks.org/wiki/Chess_Opening_Theory/1._e4/1...e5/2._Nf3/2...Nc6/3._Bb5/3...a6/4._Ba4/4...Nf6/5._d3/5...b5/6._Bb3",
    "https://en.wikibooks.org/wiki/Chess_Opening_Theory/1._e4/1...e6/2._d4/2...d5/3._Nd2/3...Nf6/4.e5/4....Nfd7/5.Bd3":
        "https://en.wikibooks.org/wiki/Chess_Opening_Theory/1._e4/1...e6/2._d4/2...d5/3._Nd2/3...Nf6/4._e5/4...Nfd7/5._Bd3",
    "https://en.wikibooks.org/wiki/Chess_Opening_Theory/1._e4/1...e6/2._d4/2...d5/3._Nd2/3...Nf6/4.e5/4....Nfd7/5.Bd3/5....c5":
        "https://en.wikibooks.org/wiki/Chess_Opening_Theory/1._e4/1...e6/2._d4/2...d5/3._Nd2/3...Nf6/4._e5/4...Nfd7/5._Bd3/5...c5",
    "https://en.wikibooks.org/wiki/Chess_Opening_Theory/1._e4/1...Nc6/2._d4/2...d5/3._Nc3/3..._dxe4":
        "https://en.wikibooks.org/wiki/Chess_Opening_Theory/1._e4/1...Nc6/2._d4/2...d5/3._Nc3/3...dxe4",
    "https://en.wikibooks.org/wiki/Chess_Opening_Theory/1._e4/1...Nc6/2._d4/2...d5/3._Nc3/3..._a6":
        "https://en.wikibooks.org/wiki/Chess_Opening_Theory/1._e4/1...Nc6/2._d4/2...d5/3._Nc3/3...a6",
    "https://en.wikibooks.org/wiki/Chess_Opening_Theory/1._d4/1...Nf6/2._Bf4/2...e6/3._e3/3...d5/4._Nd2/4...c5/5._c3/5...Nc6/6._Nf3":
        "https://en.wikibooks.org/wiki/Chess_Opening_Theory/1._d4/1...Nf6/2._Bf4/2...e6/3._e3/3...d5/4._Nd2/4...c5/5._c3/5...Nc6/6._Ngf3",
    "https://en.wikibooks.org/wiki/Chess_Opening_Theory/1._e4/1...c6/2._d4/2...d5/3._e5/3...Bf5/4._Nf3/4...e6/5._Be2/5...Nd7/6._O-O/6...Ne7/7._Nh4/7...Bg6/8._Nd2/8...c5/9_.c3":
        "https://en.wikibooks.org/wiki/Chess_Opening_Theory/1._d4/1...Nf6/2._Bf4/2...e6/3._e3/3...d5/4._Nd2/4...c5/5._c3/5...Nc6/6._Ngf3",
    "https://en.wikibooks.org/wiki/Chess_Opening_Theory/1._e4/1...e6/2._d4/2...d5/3._Nd2/3...Nf6/4.e5/4....Nfd7/5.Bd3/5....c5/6.c3":
        "https://en.wikibooks.org/wiki/Chess_Opening_Theory/1._e4/1...e6/2._d4/2...d5/3._Nd2/3...Nf6/4._e5/4...Nfd7/5._Bd3/5...c5/6._c3",
};

const chess = new Chess();

const wdir = process.cwd();

const filePath = path.join(wdir, "/storage/datasets/default");

const moveList = (url) => {
    url = correctedUrls[url] || url;
    const idx = url.indexOf("1._");
    const raw = url.substr(idx);
    const pass1 = raw.replaceAll(/(\d{1,2}\.)_([a-zA-Z0-9\-]*)\/?/g, "$1 $2 ");
    const pass2 = pass1.replaceAll(
        /(\d{1,2}\.{3})([a-zA-Z0-9\-]*)\/?/g,
        " $2 "
    );
    const pass3 = pass2
        .replaceAll("%2B", "")
        .replaceAll("%3F", "")
        .replaceAll("!", "")
        .replaceAll("/", " ")
        .replaceAll(/([\s-])0/g, "$1O");
    return pass3;
};

const data = {};

fs.readdirSync(filePath).forEach((file) => {
    const { url, text: name } = readJsonFile(
        path.resolve("/my_crawler/storage/datasets/default", file)
    );

    const moves = moveList(url);

    try {
        data[url] = { name, moves};

    } catch (e) {
        console.error({ error: e.toString(), moves, text, url });
    }
});


fs.writeFileSync("openingMinusEco.json", JSON.stringify(data, null, 2));
