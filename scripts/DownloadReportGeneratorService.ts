import * as fs from 'fs';
import Axios from '../PublishParasoftResults/node_modules/axios';
import {AxiosRequestConfig} from '../PublishParasoftResults/node_modules/axios';
import * as AdmZip from 'adm-zip'

export class DownloadReportGeneratorService {

    download = (option: AxiosRequestConfig<any>, pathToStore: string, callback: any): Promise<any> => {
        return Axios(option).then(res => {
            if (res.status == 200) {
                res.data.on("end", () => {
                    console.log("Report Generator: Download completed");
                    callback();
                });
                const writer = fs.createWriteStream(pathToStore);
                return new Promise((resolve, reject) => {
                    res.data.pipe(writer);
                    let error: any = null;
                    writer.on('error', err => {
                        error = err;
                        writer.close();
                        reject(err);
                    });
                    writer.on('close', () => {
                        if (!error) {
                            resolve(true);
                        }
                    });
                });
            } else {
                return Promise.reject(`Download failed - ` + res.status);
            }
        }).catch((error) => {
            return Promise.reject(`Download failed - ` + error.message);
        });
    }

    cleanDir = (paths: string[]): void => {
        for (let i = 0; i < paths.length; i++) {
            if (fs.existsSync(paths[i])) {
                try {
                    fs.rmSync(paths[i], {recursive: true});
                    console.log(`Removed ${paths[i]}`);
                } catch (e) {
                    console.error(`Error removing ${paths[i]}:`, e);
                    throw(e);
                }
            }
            try {
                fs.mkdirSync(paths[i], {recursive: true});
                console.log(`Created directory ${paths[i]}`);
            } catch (e) {
                console.error(`Error creating directory ${paths[i]}:`, e);
                throw(e);
            }
        }
    }

    extract = (zipPath: string, targetDir: string, usedLibs: string[]): void => {
        const zip = new AdmZip(zipPath);
        usedLibs.forEach((lib) => {
            zip.extractEntryTo(lib, targetDir);
        });
        console.log("Report Generator: Extract completed");
    }
}