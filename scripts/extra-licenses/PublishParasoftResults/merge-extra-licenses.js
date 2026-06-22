/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Merges module-specific extra licenses into the generated license.json.
 * Run automatically as the "postlicenses" npm lifecycle script.
 */
const fs = require("fs");
const path = require("path");

const moduleName = path.basename(__dirname);
const moduleRoot = path.resolve(__dirname, "..", "..", "..", moduleName);
const licensesDir = path.join(moduleRoot, "licenses");
const licenseFile = path.join(licensesDir, "license.json");
const extraFile = path.join(__dirname, "extra-licenses.json");

const generated = JSON.parse(fs.readFileSync(licenseFile, "utf8"));
const extra = JSON.parse(fs.readFileSync(extraFile, "utf8"));
const merged = Object.assign({}, generated, extra);

fs.writeFileSync(licenseFile, JSON.stringify(merged, null, 4) + "\n", "utf8");
console.log(`Merged ${Object.keys(extra).length} extra license(s) into ${moduleName}/licenses/license.json`);

const txtFiles = fs
    .readdirSync(__dirname, { withFileTypes: true })
    .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === ".txt")
    .map((entry) => entry.name);

for (const txtFile of txtFiles) {
    const sourceFile = path.join(__dirname, txtFile);
    const destinationFile = path.join(licensesDir, txtFile);
    fs.copyFileSync(sourceFile, destinationFile);
}

console.log(`Copied ${txtFiles.length} .txt file(s) into ${moduleName}/licenses`);
