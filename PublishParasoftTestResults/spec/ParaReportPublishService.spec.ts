import * as tl from 'azure-pipelines-task-lib/task';
import * as fs from 'fs';
import * as SaxonJS from 'saxon-js';
import {ParaReportPublishService} from "../ParaReportPublishService";

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

    describe('transformToSarif() - transform SA xml report to sarif report', () => {
        let sourcePath: string;

        beforeEach(() => {
            sourcePath = './resources/dottest_SA_report.xml';

            spyOn(publisher, 'transform').and.callThrough();
            spyOn(SaxonJS, 'transform').and.callThrough();
            spyOn(fs, 'writeFileSync').and.callThrough();

            expect(publisher.sarifReports.length).toBe(0);
            expect(publisher.transform).not.toHaveBeenCalled();
        });

        it('when transform sarif report successfully', () => {
            publisher.transformToSarif(sourcePath);
            const jsonReport = fs.readFileSync(sourcePath + publisher.SARIF_SUFFIX, 'utf8');
            const report = JSON.parse(jsonReport);

            expect(publisher.sarifReports.length).toBe(1);
            expect(publisher.transform).toHaveBeenCalled();
            expect(publisher.transform).toHaveBeenCalledWith(sourcePath, publisher.SARIF_SEF_TEXT, sourcePath + publisher.SARIF_SUFFIX, publisher.sarifReports);
            expect(SaxonJS.transform).toHaveBeenCalled();
            expect(fs.writeFileSync).toHaveBeenCalled();
            expect(tl.warning).not.toHaveBeenCalledWith("Failed to transform report: " + sourcePath + ". See log for details.");
            // sarif content
            expect(report).toBeDefined();
            expect(report.runs[0].tool.driver.name).toEqual('dotTEST');
            expect(report.runs[0].tool.driver.rules.length).toBe(99);
            expect(report.runs[0].results.length).toBe(1582);
        });

        it('when transform sarif report failed', () => {
            publisher.transformToSarif('not found');

            expect(publisher.sarifReports.length).toBe(0);
            expect(publisher.transform).toHaveBeenCalled();
            expect(publisher.transform).toHaveBeenCalledWith('not found', publisher.SARIF_SEF_TEXT, 'not found' + publisher.SARIF_SUFFIX, publisher.sarifReports);
            expect(fs.writeFileSync).not.toHaveBeenCalled();
            expect(tl.warning).toHaveBeenCalledWith("Failed to transform report: not found. See log for details.");
        });
    });
});