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
import { DOMParser } from 'xmldom'

const enum ReportType {
     SARIF = 0,
     XML_STATIC = 1,
     XML_TESTS = 2,
     XML_SOATEST = 3,
     UNKNOWN = 4,
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
} else {
    for (var i = 0; i < matchingInputReportFiles.length; ++i) {
        const sourcePath = matchingInputReportFiles[i];
        var reportType: ReportType = determineReportType(sourcePath);

        switch (reportType) {
            case ReportType.SARIF:
                sarifReports.push(sourcePath);
                break;
            case ReportType.XML_STATIC:
                transformToSarif(sourcePath);
                reportType = determineExecutionReportType(sourcePath, true);
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

if(failOnFailures){
    checkRunFailures(xUnitReports, sarifReports);
} else {
    tl.setResult(tl.TaskResult.Succeeded, '');
}

function determineReportType(sourcePath: string): ReportType {

    let reportType: ReportType = ReportType.UNKNOWN;
    
    if (sourcePath.toLocaleLowerCase().endsWith(SARIF_EXTENSION)) {
            tl.debug("Recognized SARIF report: " + sourcePath);
            reportType = ReportType.SARIF;
    }
    
    if (sourcePath.toLocaleLowerCase().endsWith(XML_EXTENSION)) {
        const reportDocument = new DOMParser().parseFromString(sourcePath, "text/xml");
        
        if(reportDocument.getElementsByTagName('StdViols') || reportDocument.getElementsByTagName('StdViols').length > 0){
            tl.debug("Recognized XML Static Analysis report: " + sourcePath);
            reportType = ReportType.XML_STATIC;
        }
        reportType = determineExecutionReportType(sourcePath, false);
    }
    return reportType;
}

function determineExecutionReportType(sourcePath:string, containsStaticAnalysis:boolean): ReportType {
    let bExecutionReport: boolean = false;
    let bSOATestReport: boolean = false;

    const reportDocument: Document = new DOMParser().parseFromString(sourcePath, "text/xml");
    if(reportDocument.getElementsByTagName('<Exec') || reportDocument.getElementsByTagName('<Exec').length > 0){
        bExecutionReport = true;
    }
    const resultSessionTag: Element = reportDocument.getElementsByTagName('ResultsSession')[0];
    if(resultSessionTag && (resultSessionTag.getAttribute('toolName') == "SOAtest")){
        bSOATestReport = true;
    }

    if(bExecutionReport){
        if (bSOATestReport){
            tl.debug("Recognized SOATest test results report: " + sourcePath);
            return ReportType.XML_SOATEST;
        } else {
            tl.debug("Recognized Xtest10 test results report: " + sourcePath);
            return ReportType.XML_TESTS;
        }
    }

    if(containsStaticAnalysis){
       return ReportType.XML_STATIC; 
    }
    return ReportType.UNKNOWN;
}

/// TRANSFORM
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
    let result = tl.execSync("java", ["-jar", jarPath, "-versionmsg:off", "-o:"+outPath, "-s:"+sourcePath, "-xsl:"+sheetPath]);
    if (result.code == 0) {
        transformedReports.push(outPath);
    } else {
        tl.warning("Failed to transform report: " + sourcePath + ". See log for details.");
    }
}

function isNone(node: any, propertyName: string) {
    return !node.attributes.hasOwnProperty(propertyName) || node.attributes[propertyName] == 0;
}

/**
 *  Checking failures on reports - static violations and execution errors
 */
function checkRunFailures(xUnitReports: string[], sarifReports: string[]){
    let taskResultStatus: boolean = true;
    if (xUnitReports.length > 0) {
        taskResultStatus = checkExecutionErrors(xUnitReports, 0);
    }
    if (taskResultStatus == true && sarifReports.length > 0) {
        taskResultStatus = checkStaticAnalysisViolations(sarifReports, 0);
    }
    if(taskResultStatus == true){
        tl.setResult(tl.TaskResult.Succeeded, 'Build succeed. Test failures and/or static analysis violation were not found.');
    } else {
        tl.setResult(tl.TaskResult.Failed, 'Failed build due to test failures and/or static analysis violations.');
    }   
}

function checkExecutionErrors(transformedReports: string[], index: number): boolean {
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
                success = checkExecutionErrors(transformedReports, ++index);
            }
        }
    });
    fs.createReadStream(report).pipe(saxStream);
    return success;
}

function checkStaticAnalysisViolations(sarifReports: string[], index: number): boolean {
    let success: boolean = true;
    let sarifReportPath: string = sarifReports[index];
    let sarifReport = JSON.parse(fs.readFileSync(sarifReportPath,'utf-8'));
    let resultsValue = sarifReport.runs[0].results[0];
 
    success = (!resultsValue) || (resultsValue == null);
    if (success) {
        if (index < sarifReports.length -1) {
            success = checkStaticAnalysisViolations(sarifReports, ++index);
        }
    }
    return success; 
}

function isNullOrWhitespace(input: any) {
    if (typeof input === 'undefined' || input === null) {
        return true;
    }
    return input.replace(/\s/g, '').length < 1;
}