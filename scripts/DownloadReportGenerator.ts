import * as DownloadService from './DownloadServices'
import {IDownloadServices} from "./DownloadServices";
import {AxiosRequestConfig} from '../PublishParasoftTestResults/node_modules/axios';


const tempFolder = './scripts/temp';
const path = tempFolder + '/reportGenerator.zip';
const targetFolder = './PublishParasoftTestResults/lib'
const usedLibs = ['netcoreapp2.0/', 'net47/'];
let options: AxiosRequestConfig<any> = {
    url: 'https://github.com/danielpalme/ReportGenerator/releases/download/v4.6.1/ReportGenerator_4.6.1.zip',
    method: 'GET',
    responseType: 'stream'
}

let downloadService: IDownloadServices = new DownloadService.DownloadServices();
downloadService.cleanDir([tempFolder, targetFolder]);
downloadService.download(options, path, () => {
    downloadService.extract(path, targetFolder, usedLibs);
});
