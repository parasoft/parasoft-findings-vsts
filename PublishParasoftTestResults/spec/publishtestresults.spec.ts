import * as tl from 'azure-pipelines-task-lib/task';
import * as fs from 'fs';
import * as SaxonJS from 'saxon-js';

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
        // stop the script running
        spyOn(tl, 'findMatch').and.returnValue([]);
        publisher = require('../publishtestresults');

    });

    describe('transformToSarif() - transform SA xml report to sarif report', () => {
        let sourcePath: string;

        beforeEach(() => {
            spyOn(SaxonJS, 'transform').and.callThrough();
            spyOn(fs, 'writeFileSync').and.callThrough();

            sourcePath = './resources/dottest_SA_report.xml';

        });

        it('when transform sarif report successfully', () => {
            expect(publisher.sarifReports.length).toBe(0);

            publisher.transformToSarif(sourcePath);
            const jsonReport = fs.readFileSync(sourcePath + publisher.SARIF_SUFFIX, 'utf8');
            const report = JSON.parse(jsonReport);

            expect(publisher.sarifReports.length).toBe(1);
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

            expect(fs.writeFileSync).not.toHaveBeenCalled();
            expect(tl.warning).toHaveBeenCalledWith("Failed to transform report: not found. See log for details.");
        });
    });
});