/*
 * Copyright 2017 Parasoft Corporation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as tl from 'azure-pipelines-task-lib/task';
import * as fs from 'fs';
import * as sax from 'sax';

const enum ReportType {
     SARIF = 0,
     XML_STATIC = 1,
     XML_TESTS = 2,
     XML_SOATEST = 3,
     XML_STATIC_AND_TESTS = 4,
     XML_STATIC_AND_SOATEST = 5,
     XML_XUNIT = 6,
     UNKNOWN = 7
}

const XUNIT_SUFFIX = "-junit.xml";
const SARIF_SUFFIX = "-sast.sarif";
const XML_EXTENSION = ".xml";
const SARIF_EXTENSION = ".sarif";

const SARIF_XSL = "/xsl/sarif.xsl";
const XUNIT_XSL = "/xsl/xunit.xsl";
const SOATEST_XUNIT_XSL = "/xsl/soatest-xunit.xsl";

const SAXON_LIB = "/saxon.jar";

const inputReportFiles: string[] = tl.getDelimitedInput('resultsFiles', '\n', true);
const mergeResults = tl.getInput('mergeTestResults');
const platform = tl.getInput('platform');
const config = tl.getInput('configuration');
const testRunTitle = tl.getInput('testRunTitle');
const publishRunAttachments = tl.getInput('publishRunAttachments');
const failOnFailures = tl.getBoolInput('failOnFailures', true);
let searchFolder = tl.getInput('searchFolder');

tl.debug('searchFolder: ' + searchFolder);
tl.debug('inputReportFiles: ' + inputReportFiles);
tl.debug('mergeResults: ' + mergeResults);
tl.debug('platform: ' + platform);
tl.debug('config: ' + config);
tl.debug('testRunTitle: ' + testRunTitle);
tl.debug('publishRunAttachments: ' + publishRunAttachments);
tl.debug('failOnFailures: ' + failOnFailures);

if (isNullOrWhitespace(searchFolder)) {
    searchFolder = tl.getVariable('System.DefaultWorkingDirectory');
}

let xUnitReports: string[] = [];
let sarifReports: string[] = [];
let matchingInputReportFiles: string[] = tl.findMatch(searchFolder, inputReportFiles);
if (!matchingInputReportFiles || matchingInputReportFiles.length === 0) {
    tl.warning('No test result files matching ' + inputReportFiles + ' were found.');
    tl.setResult(tl.TaskResult.Succeeded, '');
} else {
    transformReports(matchingInputReportFiles, 0);
}

function transformReports(inputReportFiles: string[], index: number)
{
    let reportType: ReportType = ReportType.UNKNOWN;
    let report: string = inputReportFiles[index];
    let bLegacyReport: boolean = false;

    if(report.toLocaleLowerCase().endsWith(SARIF_EXTENSION)) {
        tl.debug("Recognized SARIF report: " + report);
        sarifReports.push(report);
        processResults(inputReportFiles, index);
    } else if (report.toLocaleLowerCase().endsWith(XML_EXTENSION)) {
        const saxStream = sax.createStream(true, {});
        saxStream.on("opentag", function (node) {
            if (node.name == 'StdViols') {
                if (!bLegacyReport){
                    if (reportType == ReportType.UNKNOWN) {
                        tl.debug("Recognized XML Static Analysis report: " + report);
                        reportType = ReportType.XML_STATIC;
                    } else if (reportType == ReportType.XML_SOATEST) {
                        tl.debug("Recognized SOAtest report with Static Analysis results: " + report);
                        reportType = ReportType.XML_STATIC_AND_SOATEST;
                    }
                } else {
                    tl.debug("Recognized and skipped legacy XML Static Analysis report : " + report);
                }

            } else if (node.name == 'Exec') {
                if(reportType == ReportType.XML_STATIC){
                    tl.debug("Recognized Xtest10 test results and static analysis report: " + report);
                    reportType = ReportType.XML_STATIC_AND_TESTS;
                } else if(reportType == ReportType.UNKNOWN){
                    tl.debug("Recognized test results report: " + report);
                    reportType = ReportType.XML_TESTS;
                }

            } else if (node.name == 'ResultsSession' && isSOAtestReport(node)) {
                tl.debug("Recognized SOAtest test results report: " + report);
                reportType = ReportType.XML_SOATEST;

            } else if (node.name == 'StorageInfo' && !bLegacyReport){
                bLegacyReport = isLegacyReport(node);

            } else if (node.name == 'testsuites') {
                tl.debug("Recognized XUnit report: " + report)
                reportType = ReportType.XML_XUNIT;
            }
        });
        saxStream.on("error", function (e) {
            tl.warning('Failed to parse ' + report + '. Error was: ' + e.message);
        });
        saxStream.on("end", function() {
            switch (reportType) {
                case ReportType.XML_STATIC:
                    transformToSarif(report);
                    break;
                case ReportType.XML_TESTS:
                    transformToXUnit(report);
                    break;
                case ReportType.XML_STATIC_AND_TESTS:
                    transformToSarif(report);
                    transformToXUnit(report);
                    break;
                case ReportType.XML_SOATEST:
                    transformToSOATestXUnit(report);
                    break;
                case ReportType.XML_STATIC_AND_SOATEST:
                    transformToSOATestXUnit(report);
                    transformToSarif(report);
                    break;
                case ReportType.XML_XUNIT:
                    xUnitReports.push(report);
                    break;
                default:
                    tl.warning("Skipping unrecognized report file: " + report);
            }
            processResults(inputReportFiles, index);
        });
        fs.createReadStream(report).pipe(saxStream);  
    } else {
        tl.warning("Skipping unrecognized report file: " + report);
        processResults(inputReportFiles, index);
    }
}

function processResults(inputReportFiles: string[], index: number){
    if (index < inputReportFiles.length - 1) {
        transformReports(inputReportFiles, ++index);
    } else {
        if (xUnitReports.length > 0) {
            let tp: tl.TestPublisher = new tl.TestPublisher('JUnit');
            tp.publish(xUnitReports, mergeResults, platform, config, testRunTitle, publishRunAttachments);
        }
        if (sarifReports.length > 0) {
            for (var i = 0; i < sarifReports.length; ++i) {
                tl.uploadArtifact("Container", sarifReports[i], "CodeAnalysisLogs");
            }
        }
        if(failOnFailures){
            checkRunFailures(xUnitReports, sarifReports);
        } else {
            tl.setResult(tl.TaskResult.Succeeded, '');
        }
    }
}

function isLegacyReport(node:any): boolean {
    return !((node.attributes.hasOwnProperty('ver10x')) && (node.attributes['ver10x'] == '1'));
}

function isSOAtestReport(node: any): boolean {
    return node.attributes.hasOwnProperty('toolName') && node.attributes['toolName'] == 'SOAtest';
}

function transformToSarif(sourcePath: string)
{
    transform(sourcePath, __dirname + SARIF_XSL, sourcePath + SARIF_SUFFIX, sarifReports);
}

function transformToXUnit(sourcePath: string)
{
    transform(sourcePath, __dirname + XUNIT_XSL, sourcePath + XUNIT_SUFFIX, xUnitReports);
}

function transformToSOATestXUnit(sourcePath: string)
{
    transform(sourcePath, __dirname + SOATEST_XUNIT_XSL, sourcePath + XUNIT_SUFFIX, xUnitReports);
}

function transform(sourcePath: string, sheetPath: string, outPath: string, transformedReports: string[])
{
    const jarPath = __dirname + SAXON_LIB;
    let result = tl.execSync("java", ["-jar", jarPath, "-o", outPath, sourcePath, sheetPath]);
    if (result.code == 0) {
        transformedReports.push(outPath);
    } else {
        tl.warning("Failed to transform report: " + sourcePath + ". See log for details.");
    }
}

function isNone(node: any, propertyName: string) {
    return !node.attributes.hasOwnProperty(propertyName) || node.attributes[propertyName] == 0;
}

function checkRunFailures(xUnitReports: string[], sarifReports: string[]) {
    if (xUnitReports.length > 0) {
        checkFailures(xUnitReports, sarifReports, 0);
    } else if (sarifReports.length > 0) {
        checkStaticAnalysisViolations(sarifReports, 0);
    }
}

function checkFailures(xUnitReports: string[], sarifReports: string[], index: number) {
    let success: boolean = true;
    let report: string = xUnitReports[index];
    const saxStream = sax.createStream(true, {});
    saxStream.on("opentag", function (node) {
        if (node.name == 'testsuite') {
            success = success && (isNone(node, "failures") && isNone(node, "errors"));
        }
    });
    saxStream.on("error", function (e) {
        tl.warning('Failed to parse ' + report + '. Error was: ' + e.message);
    });
    saxStream.on("end", function() {
        if (success) {
            if (index < xUnitReports.length - 1) {
                checkFailures(xUnitReports, sarifReports, ++index);
            } else if (sarifReports.length > 0) {
                checkStaticAnalysisViolations(sarifReports, 0);
            } else {
                tl.setResult(tl.TaskResult.Succeeded, 'Build succeed. Test failures and/or static analysis violation were not found.');
            }
        } else {
            tl.setResult(tl.TaskResult.Failed, 'Failed build due to test failures and/or static analysis violations.');
        }
    });
    fs.createReadStream(report).pipe(saxStream);
}

function checkStaticAnalysisViolations(sarifReports: string[], index: number) {
    let success: boolean = true;
    let sarifReportPath: string = sarifReports[index];
    let sarifReport = JSON.parse(fs.readFileSync(sarifReportPath,'utf-8'));
    let resultsValue = sarifReport.runs[0].results[0];
 
    success = (resultsValue == null) || (!resultsValue);
    if (success) {
        if (index < sarifReports.length -1) {
            checkStaticAnalysisViolations(sarifReports, ++index);
        } else {
            tl.setResult(tl.TaskResult.Succeeded, 'Build succeed. Test failures and/or static analysis violation were not found.');
        }
    } else {
        tl.setResult(tl.TaskResult.Failed, 'Failed build due to test failures and/or static analysis violations.');
    }
}

function isNullOrWhitespace(input: any) {
    if (typeof input === 'undefined' || input === null) {
        return true;
    }
    return input.replace(/\s/g, '').length < 1;
}