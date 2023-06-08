import {AxiosRequestConfig} from '../../PublishParasoftTestResults/node_modules/axios';
import * as fs from 'fs';
import {DownloadReportGeneratorService} from "../../scripts/DownloadReportGeneratorService";

let downloadService: DownloadReportGeneratorService;

describe("Parasoft findings Azure -- DownloadReportGeneratorService", () => {
    beforeEach(() => {
        downloadService = new DownloadReportGeneratorService();
    });

    describe('cleanDir()', () => {
        afterEach(() => {
            const pathToRemove = './spec/scripts/test';
            if(fs.existsSync(pathToRemove)) {
                fs.rmSync(pathToRemove, {recursive: true});
            }
        });

        it('should remove and recreate target dir when it is already existing', () => {
            fs.mkdirSync('./spec/scripts/test');
            spyOn(fs, 'rmSync').and.callThrough();
            spyOn(fs, 'mkdirSync').and.callThrough();
            spyOn(console, 'log').and.callThrough();

            downloadService.cleanDir(['./spec/scripts/test']);

            expect(fs.rmSync).toHaveBeenCalledWith('./spec/scripts/test', {recursive: true});
            expect(fs.mkdirSync).toHaveBeenCalledWith('./spec/scripts/test', {recursive: true});
        });

        it('should only create dir when target dir is not existing', () => {
            spyOn(fs, 'rmSync').and.callThrough();
            spyOn(fs, 'mkdirSync').and.callThrough();

            downloadService.cleanDir(['./spec/scripts/test']);

            expect(fs.rmSync).not.toHaveBeenCalled();
            expect(fs.mkdirSync).toHaveBeenCalledWith('./spec/scripts/test', {recursive: true});
        });

    });

    describe('extract()', () => {
        afterEach(() => {
            const pathToRemove = './spec/scripts/resources/folder1';
            if(fs.existsSync(pathToRemove)) {
                fs.rmSync(pathToRemove, {recursive: true});
            }
        });

        it('should extract specific folder', () => {
            downloadService.extract('./spec/scripts/resources/testZip.zip', './spec/scripts/resources/', ['folder1/']);

            expect(fs.existsSync('./spec/scripts/resources/folder1')).toBeTruthy();
        })
    });

    describe('download()', () => {
        let downloadOption: AxiosRequestConfig<any> = {
            method: 'GET',
            url: 'http://github.com/danielpalme/ReportGenerator/releases/download/v4.6.1/ReportGenerator_4.6.1.zip',
            responseType: 'stream'
        };

        beforeEach(() => {
            jasmine.DEFAULT_TIMEOUT_INTERVAL = 210000;
            spyOn(downloadService, 'extract');
        });

        it('should download Report Generator libs when url is available', async () => {
            let path = './spec/scripts/test.zip'
            await downloadService.download(downloadOption, path, () => {})
                .then(() => {
                    expect(fs.existsSync(path)).toBeTruthy();
                }).catch(() => {
                    fail("Download failed, download successfully is expected");
                }).finally(() => {
                    if(fs.existsSync(path)) {
                        fs.rmSync(path);
                    }
                });
        });

        it('should show warning when url is unavailable ', async () => {
            let path = './spec/scripts/test.zip';
            downloadOption.url = 'http://github.com/danielpalme/ReportGenerator/releases/download/v4.6.1/404';

            await downloadService.download(downloadOption, path, () => {
                downloadService.extract(path, 'fakeTargetDir', []);
            }).then(() => {
                fail("Download successfully, download failed is expected");
            }).catch(() => {
                expect(downloadService.extract).not.toHaveBeenCalled();
            });
        });

    });
});