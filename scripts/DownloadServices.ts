import * as fs from 'fs';
import Axios from '../PublishParasoftTestResults/node_modules/axios';
import {AxiosRequestConfig} from '../PublishParasoftTestResults/node_modules/axios';
import * as AdmZip from 'adm-zip'

export interface IDownloadServices {
    download(option: AxiosRequestConfig<any>, path: string, callback: any): void;
    cleanDir(paths: string[]): void;
    extract(zipPath: string, targetDir: string, usedLibs: string[]): void;
}

export class DownloadServices implements IDownloadServices {

    download = (option: AxiosRequestConfig<any>, path: string, callback: any): void => {
        Axios(option).then(res => {
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

    cleanDir = (paths: string[]): void => {
        for (let i = 0; i < paths.length; i++) {
            if (fs.existsSync(paths[i])) {
                try {
                    fs.rmSync(paths[i], {recursive: true});
                    console.log(`Removed ${paths[i]}`)
                } catch (e) {
                    console.error(`Error removing ${paths[i]}:`, e);
                }
            }
            try {
                fs.mkdirSync(paths[i], {recursive: true});
                console.log(`Created directory ${paths[i]}`);
            } catch (e) {
                console.error(`Error creating directory ${paths[i]}:`, e);
            }
        }
    }

    extract = (zipPath: string, targetDir: string, usedLibs: string[]): void => {
        const zip = new AdmZip(zipPath);
        usedLibs.forEach((lib) => {
            zip.extractEntryTo(lib, targetDir)
        });
        console.log("Report Generator: Extract completed");
    }
}