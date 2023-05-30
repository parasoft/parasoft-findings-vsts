import * as fs from 'fs';
import Axios from '../PublishParasoftTestResults/node_modules/axios';
import * as AdmZip from 'adm-zip'

function cleanDir(paths: string[]) {
    for (let i = 0; i < paths.length; i++) {
        if (fs.existsSync(paths[i])) {
            try {
                fs.rmSync(paths[i], { recursive: true });
                console.log(`Removed ${paths[i]}`)
            } catch (e) {
                console.error(`Error removing ${paths[i]}:`, e);
            }
        }

        try {
            fs.mkdirSync(paths[i], { recursive: true });
            console.log(`Created directory ${paths[i]}`);
        } catch (e) {
            console.error(`Error creating directory ${paths[i]}:`, e);
        }
    }
}

function download(url:string, path: string, callback: any):void {
    Axios({
        method: 'GET',
        url: url,
        responseType: 'stream'
    }).then(res => {
        if (res.status == 200) {
            res.data.pipe(fs.createWriteStream(path));
            res.data.on("end", () => {
                console.log("Report Generator: download completed");
                callback();
            });
        } else {
            console.log(`Error: ` + res.status);
        }
    }).catch(err => {
        console.log(err);
    })
}

function extract(zipPath: string, targetDir: string, usedLibs: string[]) {
    const zip = new AdmZip(zipPath);
    usedLibs.forEach((lib) => {
        zip.extractEntryTo(lib, targetDir)
    });
    console.log("Report Generator: Extract completed");
}

const tempFolder = './scripts/temp';
const url = 'https://github.com/danielpalme/ReportGenerator/releases/download/v4.6.1/ReportGenerator_4.6.1.zip';
const path = tempFolder + '/reportGenerator.zip';
const targetFolder = './PublishParasoftTestResults/lib'
const usedLibs = ['netcoreapp2.0/', 'net47/'];


cleanDir([tempFolder, targetFolder]);
download(url, path, () => {
    extract(path, targetFolder, usedLibs);
});
