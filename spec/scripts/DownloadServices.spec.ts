import {AxiosRequestConfig} from '../../PublishParasoftTestResults/node_modules/axios';
import * as fs from 'fs';
import {DownloadServices, IDownloadServices} from "../../scripts/DownloadServices";

let downloadService: IDownloadServices;

describe("Parasoft findings Azure -- DownloadServices", () => {
    beforeEach(() => {
        downloadService = new DownloadServices();
    });

    describe('cleanDir()', () => {
        afterEach(() => {
            fs.rmSync('./spec/scripts/test', {recursive: true});
        });

        it('when target dir exist should clean first', () => {
            fs.mkdirSync('./spec/scripts/test');
            spyOn(fs, 'rmSync').and.callThrough();
            spyOn(fs, 'mkdirSync').and.callThrough();
            spyOn(console, 'log').and.callThrough();

            downloadService.cleanDir(['./spec/scripts/test']);

            expect(fs.rmSync).toHaveBeenCalledWith('./spec/scripts/test', {recursive: true});
            expect(fs.mkdirSync).toHaveBeenCalledWith('./spec/scripts/test', {recursive: true});
        });

        it('when target dir not exist should only create dir', () => {
            spyOn(fs, 'rmSync').and.callThrough();
            spyOn(fs, 'mkdirSync').and.callThrough();

            downloadService.cleanDir(['./spec/scripts/test']);

            expect(fs.rmSync).not.toHaveBeenCalled();
            expect(fs.mkdirSync).toHaveBeenCalledWith('./spec/scripts/test', {recursive: true});
        });

    });

    it('extract() -- should extract specific folder', () => {
        downloadService.extract('./spec/scripts/resources/testZip.zip', './spec/scripts/resources/', ['folder1/']);

        expect(fs.existsSync('./spec/scripts/resources/folder1')).toBeTruthy();
        fs.rmSync('./spec/scripts/resources/folder1', {recursive: true});
    });

    describe('download()', () => {
        let retryTimes:number ;

        async function sleep(ms: number) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        async function waitForDownload(filePath: string) {
            for (let i = 0; i < retryTimes; i++) {
                if (fs.existsSync(filePath)){
                    break;
                }
                await sleep(1000);
            }
        }

        beforeEach(() => {
            jasmine.DEFAULT_TIMEOUT_INTERVAL = 200000;
            retryTimes = 20;
            spyOn(downloadService, 'extract');
        });

        it('when url is available should download lib', async () => {
            let path = './spec/scripts/test.zip'
            let downloadOption: AxiosRequestConfig<any> = {
                method: 'GET',
                url: 'https://github.com/danielpalme/ReportGenerator/releases/download/v4.6.1/ReportGenerator_4.6.1.zip',
                responseType: 'stream'
            };
            downloadService.download(downloadOption, path, () => {});

            await waitForDownload(path);
            expect(fs.existsSync(path)).toBeTruthy();
            // expect(downloadService.extract).toHaveBeenCalled();
            fs.unlink(path, () => {});

        });

        it('when url is unavailable should warning', async () => {
            spyOn(console, 'log');
            let path = './spec/scripts/test.zip'
            let downloadOption: AxiosRequestConfig<any>= {
                method: 'GET',
                url: 'https://github.com/danielpalme/ReportGenerator/releases/download/v4.6.1/404',
                responseType: 'stream'
            };

            downloadService.download(downloadOption, path, () => {
                downloadService.extract(path, '404', []);
            });
            await sleep(5000);
            expect(downloadService.extract).not.toHaveBeenCalledWith(path, '404', []);
        });

    });
});