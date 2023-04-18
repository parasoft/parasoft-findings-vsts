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
import * as dp from 'dot-properties';
import * as SaxonJS from 'saxon-js';
import { URL } from 'url';
import * as https from 'https';
import * as axios from 'axios';

interface ReadOnlyProperties {
    readonly [key: string]: string
}

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

const SARIF_SEF_TEXT = fs.readFileSync(__dirname + "/xsl/sarif.sef.json", 'utf8');
const XUNIT_SEF_TEXT = fs.readFileSync(__dirname + "/xsl/xunit.sef.json", 'utf8');
const SOATEST_XUNIT_SEF_TEXT = fs.readFileSync(__dirname + "/xsl/soatest-xunit.sef.json", 'utf8');


const inputReportFiles: string[] = tl.getDelimitedInput('resultsFiles', '\n', true);
const mergeResults = tl.getInput('mergeTestResults');
const platform = tl.getInput('platform');
const config = tl.getInput('configuration');
const testRunTitle = tl.getInput('testRunTitle');
const publishRunAttachments = tl.getInput('publishRunAttachments');
const failOnFailures = tl.getBoolInput('failOnFailures', true);
let searchFolder = tl.getInput('searchFolder');
const localSettingsPath = tl.getPathInput("localSettingsPath");

tl.debug('searchFolder: ' + searchFolder);
tl.debug('inputReportFiles: ' + inputReportFiles);
tl.debug('localSettingsPath: ' + localSettingsPath)
tl.debug('mergeResults: ' + mergeResults);
tl.debug('platform: ' + platform);
tl.debug('config: ' + config);
tl.debug('testRunTitle: ' + testRunTitle);
tl.debug('publishRunAttachments: ' + publishRunAttachments);
tl.debug('failOnFailures: ' + failOnFailures);

if (isNullOrWhitespace(searchFolder)) {
    searchFolder = tl.getVariable('System.DefaultWorkingDirectory');
}

let isDtpSettingsValid : boolean = false;
let dtpBaseUrl : string;
let dtpUsername : string;
let dtpPassword : string;
const localSettings = loadSettings(localSettingsPath);
if (localSettings) {
    dtpBaseUrl = getDtpBaseUrl(localSettings);
    if (!isNullOrWhitespace(dtpBaseUrl)) {
        dtpUsername = localSettings['dtp.user'];
        dtpPassword = localSettings['dtp.password'];
        isDtpSettingsValid = hasCredentials(dtpUsername, dtpPassword);
    }
    tl.debug(isDtpSettingsValid ? 'DTP settings are loaded successfully.' : 'Failed to load DTP settings.');
}

let xUnitReports: string[] = [];
let sarifReports: string[] = [];
let matchingInputReportFiles: string[] = tl.findMatch(searchFolder || '', inputReportFiles);
let rulesInGlobalCategory: Set<string> = new Set();
let ruleAnalyzerMap: Map<string, string> = new Map();
let ruleDocUrlMap: Map<string,string> = new Map();
let ruleDocUrlPromises: Promise<any>[] = [];
let httpsAgent = new https.Agent({
    rejectUnauthorized: false,
    maxSockets: 50
})
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
    let bCPPProReport: boolean = false;
    let bParsingStaticAnalysisResult: boolean = false;

    if(report.toLocaleLowerCase().endsWith(SARIF_EXTENSION)) {
        tl.debug("Recognized SARIF report: " + report);
        sarifReports.push(report);
        processResults(inputReportFiles, index);
    } else if (report.toLocaleLowerCase().endsWith(XML_EXTENSION)) {
        const saxStream = sax.createStream(true, {});
        saxStream.on("opentag", function (node) {
            rulesInGlobalCategory.clear();
            ruleAnalyzerMap.clear();
            ruleDocUrlMap.clear();
            ruleDocUrlPromises = [];
            if (node.name == 'StdViols') {
                if (!bLegacyReport || bCPPProReport) {
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

            } else if (node.name == 'ResultsSession') {
                if (isSOAtestReport(node)) {
                    tl.debug("Recognized SOAtest test results report: " + report);
                    reportType = ReportType.XML_SOATEST;
                } else if (isCPPProReport(node)) {
                    bCPPProReport = true;
                }

            } else if (node.name == 'StorageInfo' && !bLegacyReport){
                bLegacyReport = isLegacyReport(node);

            } else if (node.name == 'testsuites') {
                tl.debug("Recognized XUnit report: " + report)
                reportType = ReportType.XML_XUNIT;

            } else if (node.name == 'CodingStandards') {
                bParsingStaticAnalysisResult = true;

            } else if (node.name == 'Rule') {
                let ruleId = node.attributes.id;
                let analyzerId = node.attributes.analyzer;
                if (!bLegacyReport) {
                    // A <Rule> has a rule ID and analyzer ID in a non-legacy report
                    if (isDtpSettingsValid) {
                        ruleDocUrlPromises.push(getRuleDoc(ruleId, analyzerId));
                    }
                    ruleAnalyzerMap.set(ruleId, analyzerId);
                } else if (node.attributes.cat == 'GLOBAL') {
                    rulesInGlobalCategory.add(ruleId);
                }

            } else if (bParsingStaticAnalysisResult && bLegacyReport && node.name.endsWith('Viol')) {
                let ruleId = node.attributes.rule;
                if(!ruleAnalyzerMap.has(ruleId)) {
                    let analyzerId = mapToAnalyzer(ruleId, node.name);
                    if (isDtpSettingsValid) {
                        ruleDocUrlPromises.push(getRuleDoc(ruleId, analyzerId));
                    }
                    ruleAnalyzerMap.set(ruleId, analyzerId);
                }
            }
        });
        saxStream.on("closeTag", function (nodeName) {
            if (nodeName == 'CodingStandards') {
                bParsingStaticAnalysisResult = false;
            }
        });
        saxStream.on("error", function (e) {
            tl.warning('Failed to parse ' + report + '. Error was: ' + e.message);
        });
        saxStream.on("end", function() {
            switch (reportType) {
                case ReportType.XML_STATIC:
                    transformToSarif(report, ruleDocUrlPromises.length > 0);
                    break;
                case ReportType.XML_TESTS:
                    transformToXUnit(report);
                    break;
                case ReportType.XML_STATIC_AND_TESTS:
                    transformToSarif(report, ruleDocUrlPromises.length > 0);
                    transformToXUnit(report);
                    break;
                case ReportType.XML_SOATEST:
                    transformToSOATestXUnit(report);
                    break;
                case ReportType.XML_STATIC_AND_SOATEST:
                    transformToSOATestXUnit(report);
                    transformToSarif(report, ruleDocUrlPromises.length > 0);
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

function mapToAnalyzer(ruleId: string, violationType: string) {
    switch (violationType) {
        case 'DupViol':
            return "com.parasoft.xtest.cpp.analyzer.static.dupcode";
        case 'FlowViol':
            return "com.parasoft.xtest.cpp.analyzer.static.flow";
        case 'MetViol':
            return "com.parasoft.xtest.cpp.analyzer.static.metrics";
        default:
            if (rulesInGlobalCategory.has((ruleId))) {
                return "com.parasoft.xtest.cpp.analyzer.static.global";
            } else {
                return "com.parasoft.xtest.cpp.analyzer.static.pattern";
            }
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

function isCPPProReport(node: any): boolean {
    return node.attributes.hasOwnProperty('toolName') && node.attributes['toolName'] == 'C++test';
}

function transformToSarif(sourcePath: string, hasRuleDocUrls: boolean)
{
    transform(sourcePath, SARIF_SEF_TEXT, sourcePath + SARIF_SUFFIX, sarifReports, hasRuleDocUrls);
}

function transformToXUnit(sourcePath: string)
{
    transform(sourcePath, XUNIT_SEF_TEXT, sourcePath + XUNIT_SUFFIX, xUnitReports, false);
}

function transformToSOATestXUnit(sourcePath: string)
{
    transform(sourcePath, SOATEST_XUNIT_SEF_TEXT, sourcePath + XUNIT_SUFFIX, xUnitReports, false);
}

function transform(sourcePath: string, sheetText: string, outPath: string, transformedReports: string[], hasRuleDocUrls: boolean)
{
    try {
        const xmlReport = fs.readFileSync(sourcePath, 'utf8');
        const options: SaxonJS.options = {
            stylesheetText: sheetText,
            sourceText: xmlReport,
            destination: "serialized"
        };
        const result = SaxonJS.transform(options);
        if (hasRuleDocUrls) {
            handleRuleDocsPromises(ruleDocUrlPromises).then(() => {
                // TODO CICD-125 include rule doc url into the report here
                fs.writeFileSync(outPath, result.principalResult);
            });
        } else {
            fs.writeFileSync(outPath, result.principalResult);
        }
        transformedReports.push(outPath);
    } catch (error) {
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

function loadSettings(localSettingsPath : string | undefined) : ReadOnlyProperties | null {
    if (isNullOrWhitespace(localSettingsPath)) {
        tl.warning('No settings file specified.');
        return null;
    }

    let localSettingsFile = tl.resolve(tl.getVariable('System.DefaultWorkingDirectory'), localSettingsPath);
    tl.debug('Settings file found: ' + localSettingsFile);

    return loadProperties(localSettingsFile);
}

function loadProperties(localSettingsFile : string) : ReadOnlyProperties | null {
    let input: string;
    try {
        input = fs.readFileSync(localSettingsFile, 'utf-8');
    } catch (err) {
        tl.warning('Failed to read settings file.');
        return null;
    }

    try {
        return dp.parse(input, false) as ReadOnlyProperties;
    } catch (err) {
        tl.warning('Failed to parse settings file.');
        return null;
    }
}

function getDtpBaseUrl(settings : ReadOnlyProperties) : string {
    let dtpBaseUrl : URL;
    const dtpUrl = settings['dtp.url'];
    const dtpServer = settings['dtp.server'];

    if (!isNullOrWhitespace(dtpUrl)) {
        try {
            dtpBaseUrl = new URL(dtpUrl);
        } catch (err) {
            tl.warning('Invalid dtp.url.');
            return '';
        }
    } else if (!isNullOrWhitespace(dtpServer)) {
        try {
            dtpBaseUrl = new URL('https://' + dtpServer);
        } catch (err) {
            tl.warning('Invalid dtp.server.');
            return '';
        }

        const dtpPort = settings['dtp.port'];
        if (!isNullOrWhitespace(dtpPort)) {
            if (isValidPort(parseInt(dtpPort))) {
                dtpBaseUrl.port = dtpPort;
            } else {
                tl.warning('Invalid dtp.port.');
            }
        }

        const dtpContextPath = settings['dtp.context.path'];
        if (!isNullOrWhitespace(dtpContextPath)) {
            dtpBaseUrl.pathname = dtpContextPath;
        }
    } else {
        tl.warning('dtp.url (since 10.6.1) or dtp.server is required in settings file.');
        return '';
    }

    return dtpBaseUrl.href;
}

function hasCredentials(username : string, password : string) {
    if (isNullOrWhitespace(username)) {
        tl.warning('dtp.user is required in settings file.');
        return false;
    }
    if (isNullOrWhitespace(password)) {
        tl.warning('dtp.password is required in settings file.');
        return false;
    }
    return true;
}

function isNullOrWhitespace(input: any) {
    if (typeof input === 'undefined' || input === null) {
        return true;
    }
    return input.replace(/\s/g, '').length < 1;
}

function isValidPort(port : any) {
    return Number.isSafeInteger(port) && (port >= 0 && port <= 65535);
}

async function handleRuleDocsPromises(promises: Promise<any>[]) {
    try {
        await Promise.all(promises);
    } catch (error) {
        ruleDocUrlMap.clear();
        if (error === 401) {
            tl.warning("Access to the DTP API is unauthorized with the provided DTP username and password.");
        } else {
            tl.warning("Failed to connect to DTP server.");
        }
    }
}

function getRuleDoc(ruleId: string, analyzerId: string): Promise<any> {
    return doGetRuleDoc(ruleId, analyzerId, 1.6)
        .then((response) => {
            ruleDocUrlMap.set(ruleId, response.data.docsUrl);
            return Promise.resolve();
        }).catch((error) => {
            let status = error.response ? error.response.status : -1;
            if (status === 404) {
                return doGetRuleDoc(ruleId, analyzerId, 1) // legacy DTP API with version 1.0
                    .then((result) => {
                        ruleDocUrlMap.set(ruleId, result.data.docsUrl);
                        return Promise.resolve();
                    }).catch((e) => {
                        status = e.response ? e.response.status : -1;
                        if(status === 404) {
                            // There are cases where a matching rule document URL cannot be found
                            // due to incompatible DTP versions or legacy versions of Parasoft tools
                            ruleDocUrlMap.set(ruleId, "");
                            return Promise.resolve();
                        } else {
                            return Promise.reject(status);
                        }
                    });
            } else {
                return Promise.reject(status);
            }
        });
}

function doGetRuleDoc(ruleId: string, analyzerId: string, apiVersion: number): Promise<any> {
    let url = dtpBaseUrl + "grs/api/v" + apiVersion +"/rules/doc?rule=" + ruleId + "&analyzerId=" + analyzerId;
    return axios.default.get(url, {
        httpsAgent: httpsAgent,
        auth: {
            username: dtpUsername,
            password: dtpPassword
        }
    });
}