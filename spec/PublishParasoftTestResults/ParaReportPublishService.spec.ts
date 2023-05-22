import * as tl from '../../PublishParasoftTestResults/node_modules/azure-pipelines-task-lib';
import * as fs from 'fs';
import {ParaReportPublishService} from "../../PublishParasoftTestResults/ParaReportPublishService";

let publisher: any;

describe("Parasoft findings Azure", () => {
    beforeEach(() => {
        spyOn(tl, 'getDelimitedInput').and.returnValue(['foobar']);
        spyOn(tl, 'getInput').and.returnValue('foobar');
        spyOn(tl, 'getBoolInput').and.returnValue(false);
        spyOn(tl, 'debug');
        spyOn(tl, 'setResult');
        spyOn(tl, 'warning');
        spyOn(tl, 'getPathInput').and.returnValue(undefined);
        spyOn(tl, 'findMatch').and.returnValue([]);

        publisher = new ParaReportPublishService();
    });

    describe('transformReports() - transform report and input report type is', () => {
        let retryTimes: number;

        async function sleep(ms: number) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        async function waitForTransform(filePath: string) {
            for (let i = 0; i < retryTimes; i++) {
                if (fs.existsSync(filePath)){
                    break;
                }
                await sleep(1000);
            }
        }

        beforeEach(() => {
            spyOn(publisher, 'transform').and.callThrough();

            jasmine.DEFAULT_TIMEOUT_INTERVAL = 200000;
            retryTimes = 20;

            expect(publisher.sarifReports.length).toBe(0);
            expect(publisher.xUnitReports.length).toBe(0);
            expect(publisher.transform).not.toHaveBeenCalled();
        });

        it('SARIF', () => {
            publisher.transformReports([__dirname + '/resources/expect/SARIF.sarif'], 0);

            expect(publisher.transform).not.toHaveBeenCalled();
            expect(publisher.sarifReports.length).toBe(1);
        });

        it('XML_STATIC', async () => {
            publisher.transformReports([__dirname + '/resources/XML_STATIC.xml'], 0);
            await waitForTransform(__dirname + '/resources/XML_STATIC.xml-sast.sarif');

            let expectedReport = fs.readFileSync(__dirname + '/resources/expect/XML_STATIC.xml-sast.sarif', 'utf8');
            let result = fs.readFileSync(__dirname + '/resources/XML_STATIC.xml-sast.sarif', 'utf-8');

            expect(result).toEqual(expectedReport);
            expect(publisher.transform).toHaveBeenCalled();
            expect(publisher.sarifReports.length).toBe(1);

            fs.unlink(__dirname + '/resources/XML_STATIC.xml-sast.sarif', () => {});
        });

        it('XML_TESTS', async () => {
            publisher.transformReports([__dirname + '/resources/XML_TESTS.xml'], 0);
            await waitForTransform(__dirname + '/resources/XML_TESTS.xml-junit.xml');

            let expectedReport = fs.readFileSync(__dirname + '/resources/expect/XML_TESTS.xml-junit.xml', 'utf8');
            let result = fs.readFileSync(__dirname + '/resources/XML_TESTS.xml-junit.xml', 'utf-8');

            expect(result).toEqual(expectedReport);
            expect(publisher.transform).toHaveBeenCalled();
            expect(publisher.xUnitReports.length).toBe(1);

            fs.unlink(__dirname + '/resources/XML_TESTS.xml-junit.xml', () => {});
        });

        it('XML_STATIC_AND_TESTS', async () => {
            publisher.transformReports([__dirname + '/resources/XML_STATIC_AND_TESTS.xml'], 0);
            await waitForTransform(__dirname + '/resources/XML_STATIC_AND_TESTS.xml-sast.sarif');
            await waitForTransform(__dirname + '/resources/XML_STATIC_AND_TESTS.xml-junit.xml');

            let expectedSarifReport = fs.readFileSync(__dirname + '/resources/expect/XML_STATIC_AND_TESTS.xml-sast.sarif', 'utf8');
            let sarifResult = fs.readFileSync(__dirname + '/resources/XML_STATIC_AND_TESTS.xml-sast.sarif', 'utf-8');
            let expectedJunitReport = fs.readFileSync(__dirname + '/resources/expect/XML_STATIC_AND_TESTS.xml-junit.xml', 'utf8');
            let junitResult = fs.readFileSync(__dirname + '/resources/XML_STATIC_AND_TESTS.xml-junit.xml', 'utf-8');

            expect(sarifResult).toEqual(expectedSarifReport);
            expect(junitResult).toEqual(expectedJunitReport);
            expect(publisher.transform).toHaveBeenCalled();
            expect(publisher.sarifReports.length).toBe(1);
            expect(publisher.xUnitReports.length).toBe(1);
            fs.unlink(__dirname + '/resources/XML_STATIC_AND_TESTS.xml-sast.sarif', () => {});
            fs.unlink(__dirname + '/resources/XML_STATIC_AND_TESTS.xml-junit.xml', () => {});
        });

        it('XML_SOATEST', async () => {
            publisher.transformReports([__dirname + '/resources/XML_SOATEST.xml'], 0);
            await waitForTransform(__dirname + '/resources/XML_SOATEST.xml-junit.xml');

            let expectedReport = fs.readFileSync(__dirname + '/resources/expect/XML_SOATEST.xml-junit.xml', 'utf8');
            let result = fs.readFileSync(__dirname + '/resources/XML_SOATEST.xml-junit.xml', 'utf-8');

            expect(result).toEqual(expectedReport);
            expect(publisher.transform).toHaveBeenCalled();
            expect(publisher.xUnitReports.length).toBe(1);
            fs.unlink(__dirname + '/resources/XML_SOATEST.xml-junit.xml', () => {});
        });

        it('XML_STATIC_AND_SOATEST', async () => {
            publisher.transformReports([__dirname + '/resources/XML_STATIC_AND_SOATEST.xml'], 0);
            await waitForTransform(__dirname + '/resources/XML_STATIC_AND_SOATEST.xml-sast.sarif');

            let expectedSarifReport = fs.readFileSync(__dirname + '/resources/expect/XML_STATIC_AND_SOATEST.xml-sast.sarif', 'utf8');
            let sarifResult = fs.readFileSync(__dirname + '/resources/XML_STATIC_AND_SOATEST.xml-sast.sarif', 'utf-8');
            let expectedJunitReport = fs.readFileSync(__dirname + '/resources/expect/XML_STATIC_AND_SOATEST.xml-junit.xml', 'utf8');
            let junitResult = fs.readFileSync(__dirname + '/resources/XML_STATIC_AND_SOATEST.xml-junit.xml', 'utf-8');

            expect(sarifResult).toEqual(expectedSarifReport);
            expect(junitResult).toEqual(expectedJunitReport);
            expect(publisher.transform).toHaveBeenCalled();
            expect(publisher.sarifReports.length).toBe(1);
            expect(publisher.xUnitReports.length).toBe(1);
            fs.unlink(__dirname + '/resources/XML_STATIC_AND_SOATEST.xml-sast.sarif', () => {});
            fs.unlink(__dirname + '/resources/XML_STATIC_AND_SOATEST.xml-junit.xml', () => {});
        });

        it('XML_XUNIT', async () => {
            publisher.transformReports([__dirname + '/resources/XML_XUNIT.xml'], 0);
            await sleep(5000);

            expect(publisher.transform).not.toHaveBeenCalled();
            expect(publisher.xUnitReports.length).toBe(1);
        });

    });
});