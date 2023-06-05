import {DownloadReportGeneratorService} from './DownloadReportGeneratorService'
import {AxiosRequestConfig} from '../PublishParasoftTestResults/node_modules/axios';

// This script is used to download report generator from github and extract needed parts into PublishParasoftTestResults task
// This lib is used to generate html coverage report by xml coverage report
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
