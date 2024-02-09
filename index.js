/**
 * This code is from csfloat repo. I made small changes to parse the data into a JSON.
 * https://github.com/csfloat/cs-files/blob/5ff0f212ff0dc2b6f6380fc6d1a93121c2b9c2cd/index.js
 */
const SteamUser = require("steam-user");
const fs = require("fs");
const vpk = require("vpk");
const parser = require("@node-steam/vdf");
const { exec } = require("child_process");
const appId = 730;
const depotId = 2347770;
const dir = `./static`;
const temp = "./temp";
const manifestIdFile = "manifestId.txt";

const vpkFiles = [
    "resource/csgo_brazilian.txt",
    "resource/csgo_bulgarian.txt",
    "resource/csgo_czech.txt",
    "resource/csgo_danish.txt",
    "resource/csgo_dutch.txt",
    "resource/csgo_english.txt",
    "resource/csgo_finnish.txt",
    "resource/csgo_french.txt",
    "resource/csgo_german.txt",
    "resource/csgo_greek.txt",
    "resource/csgo_hungarian.txt",
    "resource/csgo_italian.txt",
    "resource/csgo_japanese.txt",
    "resource/csgo_korean.txt",
    "resource/csgo_latam.txt",
    "resource/csgo_norwegian.txt",
    "resource/csgo_polish.txt",
    "resource/csgo_portuguese.txt",
    "resource/csgo_romanian.txt",
    "resource/csgo_russian.txt",
    "resource/csgo_schinese.txt",
    "resource/csgo_schinese_pw.txt",
    "resource/csgo_spanish.txt",
    "resource/csgo_swedish.txt",
    "resource/csgo_tchinese.txt",
    "resource/csgo_thai.txt",
    "resource/csgo_turkish.txt",
    "resource/csgo_ukrainian.txt",
    "resource/csgo_vietnamese.txt",
    "scripts/items/items_game.txt",
];

async function downloadVPKDir(user, manifest) {
    const dirFile = manifest.manifest.files.find((file) =>
        file.filename.endsWith("csgo\\pak01_dir.vpk")
    );

    console.log(`Downloading vpk dir`);

    await user.downloadFile(appId, depotId, dirFile, `${temp}/pak01_dir.vpk`);

    vpkDir = new vpk(`${temp}/pak01_dir.vpk`);
    vpkDir.load();

    return vpkDir;
}

function getRequiredVPKFiles(vpkDir) {
    const requiredIndices = [];

    for (const fileName of vpkDir.files) {
        for (const f of vpkFiles) {
            if (fileName.startsWith(f)) {
                console.log(`Found vpk for ${f}: ${fileName}`);

                const archiveIndex = vpkDir.tree[fileName].archiveIndex;

                if (!requiredIndices.includes(archiveIndex)) {
                    requiredIndices.push(archiveIndex);
                }

                break;
            }
        }
    }

    return requiredIndices.sort();
}

async function downloadVPKArchives(user, manifest, vpkDir) {
    const requiredIndices = getRequiredVPKFiles(vpkDir);

    console.log(`Required VPK files ${requiredIndices}`);

    for (let index in requiredIndices) {
        index = parseInt(index);

        // pad to 3 zeroes
        const archiveIndex = requiredIndices[index];
        const paddedIndex =
            "0".repeat(3 - archiveIndex.toString().length) + archiveIndex;
        const fileName = `pak01_${paddedIndex}.vpk`;

        const file = manifest.manifest.files.find((f) =>
            f.filename.endsWith(fileName)
        );
        const filePath = `${temp}/${fileName}`;

        const status = `[${index + 1}/${requiredIndices.length}]`;

        console.log(`${status} Downloading ${fileName}`);

        await user.downloadFile(appId, depotId, file, filePath);
    }
}

function trimBOM(buffer) {
    // Check if the Buffer starts with the BOM character
    if (
        buffer.length >= 3 &&
        buffer[0] === 0xef &&
        buffer[1] === 0xbb &&
        buffer[2] === 0xbf
    ) {
        // Trim the first two bytes (BOM)
        return buffer.slice(3);
    } else {
        // No BOM, return the original Buffer
        return buffer;
    }
}

function extractVPKFiles(vpkDir) {
    console.log("Extracting vpk files");

    for (const f of vpkFiles) {
        let found = false;
        for (const path of vpkDir.files) {
            if (path.startsWith(f)) {
                let file = vpkDir.getFile(path);
                const filepath = f.split("/");
                const fileName = filepath[filepath.length - 1].replace(
                    ".txt",
                    ""
                );

                // Remove BOM from file (https://en.wikipedia.org/wiki/Byte_order_mark)
                // Convenience so down stream users don't have to worry about decoding with BOM
                file = trimBOM(file);
                file = file.toString("utf-8");

                const parsedData = parser.parse(file);

                try {
                    fs.writeFileSync(
                        `${dir}/${fileName}.json`,
                        JSON.stringify(parsedData, null, 4)
                    );
                } catch (err) {
                    throw err;
                }

                found = true;
                break;
            }
        }

        if (!found) {
            throw `could not find ${f}`;
        }
    }
}

if (process.argv.length != 4) {
    console.error(
        `Missing input arguments, expected 4 got ${process.argv.length}`
    );
    process.exit(1);
}

if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir);
}

if (!fs.existsSync(temp)) {
    fs.mkdirSync(temp);
}

const user = new SteamUser();

console.log("Logging into Steam....");

user.logOn({
    accountName: process.argv[2],
    password: process.argv[3],
    rememberPassword: true,
    logonID: 2121,
});

user.once("loggedOn", async () => {
    const cs = (await user.getProductInfo([appId], [], true)).apps[appId]
        .appinfo;
    const commonDepot = cs.depots[depotId];
    const latestManifestId = commonDepot.manifests.public.gid;

    console.log(`Obtained latest manifest ID: ${latestManifestId}`);

    let existingManifestId = "";

    try {
        existingManifestId = fs.readFileSync(`${dir}/${manifestIdFile}`);
    } catch (err) {
        if (err.code != "ENOENT") {
            throw err;
        }
    }

    if (existingManifestId == latestManifestId) {
        console.log("Latest manifest Id matches existing manifest Id, exiting");
        process.exit(0);
    }

    console.log(
        "Latest manifest Id does not match existing manifest Id, downloading game files"
    );

    const manifest = await user.getManifest(
        appId,
        depotId,
        latestManifestId,
        "public"
    );

    const vpkDir = await downloadVPKDir(user, manifest);
    await downloadVPKArchives(user, manifest, vpkDir);
    extractVPKFiles(vpkDir);

    try {
        fs.writeFileSync(`${dir}/${manifestIdFile}`, latestManifestId);
    } catch (err) {
        throw err;
    }

    process.exit(0);
});
