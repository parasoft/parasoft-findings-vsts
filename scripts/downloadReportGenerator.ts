import * as fs from 'fs';
import Axios from '../PublishParasoftTestResults/node_modules/axios';
import * as AdmZip from 'adm-zip'

function cleanDir(paths: string[]) {
    for (let i = 0; i < paths.length; i++) {
        if (fs.existsSync(paths[i])) {
            fs.rmSync(paths[i], { recursive: true });
        }
        fs.mkdirSync(paths[i], { recursive: true });
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
                callback();
            });
        } else {
            console.log(`Error: ` + res.status);
        }
    }).catch(err => {
        console.log(err);
    })
}

function extract(zipPath: string, targetDir: string, unusedLibs: string[]) {
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(targetDir);

    unusedLibs.forEach((lib) => {
        let path = targetDir + lib;
        fs.rmSync(path, { recursive: true });
    });
}

const tempFolder = './temp';
const url = 'https://github.com/danielpalme/ReportGenerator/releases/download/v4.6.1/ReportGenerator_4.6.1.zip';
const path = tempFolder + '/reportGenerator.zip';
const targetFolder = '../PublishParasoftTestResults/lib'
const unusedLibs = ['/netcoreapp2.0_original', '/netcoreapp2.1', '/netcoreapp3.0'];


cleanDir([tempFolder, targetFolder]);
download(url, path, () => {
    console.log("Report Generator: download completed");
    extract(path, targetFolder, unusedLibs);
    console.log("Report Generator: Extract completed");
});
