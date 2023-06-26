import {DownloadReportGeneratorService} from './DownloadReportGeneratorService'
import {AxiosRequestConfig} from '../PublishParasoftTestResults/node_modules/axios';

// This script is used to download the report generator from GitHub and extract the necessary components into the PublishParasoftTestResults task. 
// These componenets is used to generate HTML coverage report from XML coverage report.
const tempFolder = './scripts/temp';
const pathToStore = tempFolder + '/reportGenerator.zip';
const pathToExtract = './PublishParasoftTestResults/lib';
const libsToUse = ['netcoreapp2.0/', 'net47/'];
let downloadOptions: AxiosRequestConfig<any> = {
    url: 'https://github.com/danielpalme/ReportGenerator/releases/download/v4.6.1/ReportGenerator_4.6.1.zip',
    method: 'GET',
    responseType: 'stream'
}

let downloadService: DownloadReportGeneratorService = new DownloadReportGeneratorService();
downloadService.cleanDir([tempFolder, pathToExtract]);
downloadService.download(downloadOptions, pathToStore, () => {
    downloadService.extract(pathToStore, pathToExtract, libsToUse);
}).catch((error) =>{throw new Error(error)});
