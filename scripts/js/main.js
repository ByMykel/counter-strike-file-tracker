import fs from "fs";
import path from "path";
import chardet from "chardet";

import { parse as parse1 } from "@node-steam/vdf";
import { parse as parse2 } from "vdf-parser";
import { parse as parse3 } from "kvparser";

const CONFIG = JSON.parse(fs.readFileSync("config.json", "utf-8"));

// Files to copy and parse
const SOURCE_PATHS = CONFIG.SOURCE_PATHS;

// Folder for original unparsed data
const TARGET_FOLDER = CONFIG.TARGET_FOLDER;

// All the JS Valve Data Format (VDF) / KeyValues parsers
const PARSERS = [
    {
        name: "@node-steam/vdf",
        parse: parse1,
        output: path.join(TARGET_FOLDER, "../parsed/@node-steam--vdf"),
    },
    {
        name: "vdf-parser",
        parse: parse2,
        output: path.join(TARGET_FOLDER, "../parsed/vdf-parser"),
    },
    {
        name: "kvparser",
        parse: parse3,
        output: path.join(TARGET_FOLDER, "../parsed/kvparser"),
    },
];

// Ensure the target folder exist
if (!fs.existsSync(TARGET_FOLDER)) {
    fs.mkdirSync(TARGET_FOLDER, { recursive: true });
}

function detectFileEncoding(filePath) {
    return chardet.detectFileSync(filePath);
}

function convertEncodingOfFile(file) {
    return new Promise((resolve, reject) => {
        const filePath = path.join(TARGET_FOLDER, file);

        // Detect file encoding
        const fileEncoding = detectFileEncoding(filePath);

        if (fileEncoding !== "UTF-16LE") {
            console.log(
                `[Skipping conversion] File ${file} is not in UTF-16LE.`
            );
            return resolve();
        }

        try {
            // If it's UTF-16LE, then convert to UTF-8
            const content = fs.readFileSync(filePath, { encoding: "utf16le" });
            fs.writeFileSync(filePath, content, { encoding: "utf8" });
            console.log(`Converted ${file} successfully.`);
            resolve();
        } catch (error) {
            console.error(`Error converting ${file}: ${error}`);
            reject(error);
        }
    });
}

function moveFilesToTarget() {
    return new Promise((resolve, reject) => {
        try {
            for (const sourcePath of SOURCE_PATHS) {
                const targetPath = path.join(
                    TARGET_FOLDER,
                    path.basename(sourcePath)
                );
                fs.copyFileSync(sourcePath, targetPath);
            }
            resolve();
        } catch (error) {
            reject(error);
        }
    });
}

function convertAndSaveFiles() {
    const files = fs.readdirSync(TARGET_FOLDER);

    for (const file of files) {
        const filePath = path.join(TARGET_FOLDER, file);

        if (fs.statSync(filePath).isFile()) {
            for (const parser of PARSERS) {
                // Ensure the output folders exist
                fs.mkdirSync(parser.output, { recursive: true });

                try {
                    const content = fs
                        .readFileSync(filePath, "utf8")
                        .replace(/^\uFEFF/, "");
                    const parsedData = parser.parse(content);

                    const newContent = JSON.stringify(parsedData, null, 4);
                    const outputFilePath = path.join(
                        parser.output,
                        file.replace(path.extname(file), ".json")
                    );

                    fs.writeFileSync(outputFilePath, newContent);
                } catch (error) {
                    console.error(
                        `\n[parser:${parser.name}] Error parsing file ${filePath}\n`,
                        error
                    );
                }
            }
        }
    }
}

async function processFiles() {
    // 1. First move files to the target folder
    await moveFilesToTarget();

    // 2. Then, get a list of all files in the TARGET_FOLDER
    const files = fs.readdirSync(TARGET_FOLDER);

    // 3. Wait for all encoding conversions to finish
    await Promise.all(files.map((file) => convertEncodingOfFile(file)));

    // 4. Finally, convert and save the files
    convertAndSaveFiles();
}

processFiles();
