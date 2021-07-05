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
     UNKNOWN = 4,
}

const XUNIT_SUFFIX = "-junit.xml";
const SARIF_SUFFIX = "-sast.sarif";

const inputReportFiles: string[] = tl.getDelimitedInput('resultsFiles', '\n', true);
const mergeResults = tl.getInput('mergeTestResults');
const platform = tl.getInput('platform');
const config = tl.getInput('configuration');
const testRunTitle = tl.getInput('testRunTitle');
const publishRunAttachments = tl.getInput('publishRunAttachments');
const failOnFailures = tl.getInput('failOnFailures');
let searchFolder = tl.getInput('searchFolder');

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
} else {
    for (var i = 0; i < matchingInputReportFiles.length; ++i) {
        const sourcePath = matchingInputReportFiles[i];
        const reportType = determineReportType(sourcePath);
        switch (reportType) {
            case ReportType.SARIF:
                sarifReports.push(sourcePath);
                break;
            case ReportType.XML_STATIC:
                transformToSarif(sourcePath);
                break;
            case ReportType.XML_TESTS:
                transformToXUnit(sourcePath);
                break;
            case ReportType.XML_SOATEST:
                transformToSOATestXUnit(sourcePath);
                break;
            default:
                tl.warning("Skipping unrecognized report file: " + sourcePath);
        }
    }
    if (xUnitReports.length > 0) {
        let tp: tl.TestPublisher = new tl.TestPublisher('JUnit');
        tp.publish(xUnitReports, mergeResults, platform, config, testRunTitle, publishRunAttachments);
    }
    if (sarifReports.length > 0) {
        for (var i = 0; i < sarifReports.length; ++i) {
            tl.uploadArtifact("Container", sarifReports[i], "CodeAnalysisLogs");
        }
    }
}

// TODO fail on static errors
if (xUnitReports.length > 0 && failOnFailures == 'true') {
    setResultUsingReportOutput(xUnitReports, 0);
} else {
    tl.setResult(tl.TaskResult.Succeeded, '');
}

function determineReportType(sourcePath: string) : ReportType
{
    // TODO parse xml reports, handle execution reports
    if (sourcePath.toLocaleLowerCase().endsWith(".xml")) {
        return ReportType.XML_STATIC;
    } else if (sourcePath.toLocaleLowerCase().endsWith(".sarif")) {
        return ReportType.SARIF;
    }
    return ReportType.UNKNOWN;
}

function transformToSarif(sourcePath: string)
{
    transform(sourcePath, __dirname + "/xsl/sarif.xsl", sourcePath + SARIF_SUFFIX, sarifReports);
}

function transformToXUnit(sourcePath: string)
{
    const sheetPath = __dirname + "/xsl/xunit.xsl";
    transform(sourcePath, __dirname + "/xsl/xunit.xsl", sourcePath + XUNIT_SUFFIX, xUnitReports);
}

function transformToSOATestXUnit(sourcePath: string)
{
    transform(sourcePath, __dirname + "/xsl/soatest-xunit.xsl", sourcePath + XUNIT_SUFFIX, xUnitReports);
}

function transform(sourcePath: string, sheetPath: string, outPath: string, transformedReports: string[])
{
    const jarPath = __dirname + "/saxon.jar";
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

function setResultUsingReportOutput(transformedReports: string[], index: number) {
    let success: boolean = true;
    let report: string = transformedReports[index];
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
            if (index < transformedReports.length - 1) {
                setResultUsingReportOutput(transformedReports, ++index);
            } else {
                tl.setResult(tl.TaskResult.Succeeded, '');
            }
        } else {
            tl.setResult(tl.TaskResult.Failed, 'Failed build due to test failures.');
        }
    });
    fs.createReadStream(report).pipe(saxStream);
}

function isNullOrWhitespace(input: any) {
    if (typeof input === 'undefined' || input === null) {
        return true;
    }
    return input.replace(/\s/g, '').length < 1;
}