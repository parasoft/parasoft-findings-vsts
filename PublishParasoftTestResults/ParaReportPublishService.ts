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

export interface ReadOnlyProperties {
    readonly [key: string]: string
}

export const enum ReportType {
    SARIF = 0,
    XML_STATIC = 1,
    XML_TESTS = 2,
    XML_SOATEST = 3,
    XML_STATIC_AND_TESTS = 4,
    XML_STATIC_AND_SOATEST = 5,
    XML_XUNIT = 6,
    UNKNOWN = 7
}

export class ParaReportPublishService {
    readonly XUNIT_SUFFIX: string = "-junit.xml";
    readonly SARIF_SUFFIX: string = "-sast.sarif";
    readonly XML_EXTENSION: string = ".xml";
    readonly SARIF_EXTENSION: string = ".sarif";
    readonly SARIF_SEF_TEXT: string = fs.readFileSync(__dirname + "/xsl/sarif.sef.json", 'utf8');
    readonly XUNIT_SEF_TEXT: string = fs.readFileSync(__dirname + "/xsl/xunit.sef.json", 'utf8');
    readonly SOATEST_XUNIT_SEF_TEXT: string = fs.readFileSync(__dirname + "/xsl/soatest-xunit.sef.json", 'utf8');

    xUnitReports: string[] = [];
    sarifReports: string[] = [];
    matchingInputReportFiles: string[];
    rulesInGlobalCategory: Set<string> = new Set();
    ruleAnalyzerMap: Map<string, string> = new Map();
    ruleDocUrlMap: Map<string,string> = new Map();
    ruleDocUrlPromises: Promise<any>[] = [];
    httpsAgent = new https.Agent({
        rejectUnauthorized: false,
        maxSockets: 50
    })

    defaultWorkingDirectory: string;
    inputReportFiles: string[];
    mergeResults: string | undefined;
    platform: string | undefined;
    config: string | undefined;
    testRunTitle: string | undefined;
    publishRunAttachments: string | undefined;
    failOnFailures: boolean;
    searchFolder: string | undefined;
    localSettingsPath: string | undefined;

    // DTP settings
    dtpBaseUrl: string = '';
    dtpUsername: string  = '';
    dtpPassword: string  = '';
    isDtpSettingsValid: boolean = false;
    isDTPServiceAvailable: boolean = false;

    constructor() {
        this.defaultWorkingDirectory = tl.getVariable('System.DefaultWorkingDirectory') || '';
        this.inputReportFiles = tl.getDelimitedInput('resultsFiles', '\n', true);
        this.mergeResults = tl.getInput('mergeTestResults');
        this.platform = tl.getInput('platform');
        this.config = tl.getInput('configuration');
        this.testRunTitle = tl.getInput('testRunTitle');
        this.publishRunAttachments = tl.getInput('publishRunAttachments');
        this.failOnFailures = tl.getBoolInput('failOnFailures', true);
        this.searchFolder = this.isNullOrWhitespace(tl.getInput('searchFolder')) ? this.defaultWorkingDirectory : tl.getInput('searchFolder');
        this.localSettingsPath = tl.getPathInput("localSettingsPath");
        const localSettings = this.loadSettings(this.localSettingsPath);
        if (localSettings) {
            this.dtpBaseUrl = this.getDtpBaseUrl(localSettings);
            if (!this.isNullOrWhitespace(this.dtpBaseUrl)) {
                this.dtpUsername = localSettings['dtp.user'];
                this.dtpPassword = localSettings['dtp.password'];
                this.isDtpSettingsValid = this.hasCredentials(this.dtpUsername, this.dtpPassword);
            }
            tl.debug(this.isDtpSettingsValid ? 'DTP settings are loaded successfully.' : 'Failed to load DTP settings.');
        }

        this.matchingInputReportFiles = tl.findMatch(this.searchFolder || '', this.inputReportFiles);

        tl.debug('searchFolder: ' + this.searchFolder);
        tl.debug('inputReportFiles: ' + this.inputReportFiles);
        tl.debug('localSettingsPath: ' + this.localSettingsPath)
        tl.debug('mergeResults: ' + this.mergeResults);
        tl.debug('platform: ' + this.platform);
        tl.debug('config: ' + this.config);
        tl.debug('testRunTitle: ' + this.testRunTitle);
        tl.debug('publishRunAttachments: ' + this.publishRunAttachments);
        tl.debug('failOnFailures: ' + this.failOnFailures);
    }

    run = (): void => {
        if (!this.matchingInputReportFiles || this.matchingInputReportFiles.length === 0) {
            tl.warning('No test result files matching ' + this.inputReportFiles + ' were found.');
            tl.setResult(tl.TaskResult.Succeeded, '');
        } else {
            if (this.isDtpSettingsValid) {
                this.verifyDTPService().then(() => this.transformReports(this.matchingInputReportFiles, 0));
            } else {
                this.transformReports(this.matchingInputReportFiles, 0);
            }
        }
    }

    transformReports = (inputReportFiles: string[], index: number): void => {
        let reportType: ReportType = ReportType.UNKNOWN;
        let report: string = inputReportFiles[index];
        let bLegacyReport: boolean = false;
        let bCPPProReport: boolean = false;
        let bParsingStaticAnalysisResult: boolean = false;

        if(report.toLocaleLowerCase().endsWith(this.SARIF_EXTENSION)) {
            tl.debug("Recognized SARIF report: " + report);
            this.sarifReports.push(report);
            this.processResults(inputReportFiles, index);
        } else if (report.toLocaleLowerCase().endsWith(this.XML_EXTENSION)) {
            this.rulesInGlobalCategory.clear();
            this.ruleAnalyzerMap.clear();
            this.ruleDocUrlMap.clear();
            this.ruleDocUrlPromises = [];

            const saxStream = sax.createStream(true, {});
            saxStream.on("opentag", (node) => {
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
                    if (this.isSOAtestReport(node)) {
                        tl.debug("Recognized SOAtest test results report: " + report);
                        reportType = ReportType.XML_SOATEST;
                    } else if (this.isCPPProReport(node)) {
                        bCPPProReport = true;
                    }

                } else if (node.name == 'StorageInfo' && !bLegacyReport){
                    bLegacyReport = this.isLegacyReport(node);

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
                        if (this.isDTPServiceAvailable) {
                            this.ruleDocUrlPromises.push(this.getRuleDoc(ruleId, analyzerId));
                        }
                        this.ruleAnalyzerMap.set(ruleId, analyzerId);
                    } else if (node.attributes.cat == 'GLOBAL') {
                        this.rulesInGlobalCategory.add(ruleId);
                    }

                } else if (bParsingStaticAnalysisResult && bLegacyReport && node.name.endsWith('Viol')) {
                    let ruleId = node.attributes.rule;
                    if(!this.ruleAnalyzerMap.has(ruleId)) {
                        let analyzerId = this.mapToAnalyzer(ruleId, node.name);
                        if (this.isDTPServiceAvailable) {
                            this.ruleDocUrlPromises.push(this.getRuleDoc(ruleId, analyzerId));
                        }
                        this.ruleAnalyzerMap.set(ruleId, analyzerId);
                    }
                }
            });
            saxStream.on("closeTag", (nodeName) => {
                if (nodeName == 'CodingStandards') {
                    bParsingStaticAnalysisResult = false;
                }
            });
            saxStream.on("error",(e) => {
                tl.warning('Failed to parse ' + report + '. Error was: ' + e.message);
            });
            saxStream.on("end", () => {
                // "ruleDocUrlPromises" will only be non-empty if this is a static analysis report
                Promise.all(this.ruleDocUrlPromises).then((errors) =>{
                    let firstError: any = errors.find(error => error !== null && error !== undefined);
                    if (firstError) {
                        this.ruleDocUrlMap.clear();
                        const errorCode = firstError.status;
                        tl.warning("Failed to get documentation for rules with provided settings: Error code " + errorCode);
                    } else if (this.ruleDocUrlPromises.length > 0) {
                        tl.debug("The documentation for rules has been successfully loaded.");
                    }
                    this.transformToReport(reportType, report);
                    this.processResults(inputReportFiles, index);
                });
            });
            fs.createReadStream(report).pipe(saxStream);
        } else {
            tl.warning("Skipping unrecognized report file: " + report);
            this.processResults(inputReportFiles, index);
        }
    }

    transformToReport = (reportType: ReportType, report: string): void => {
        switch (reportType) {
            case ReportType.XML_STATIC:
                this.transformToSarif(report);
                break;
            case ReportType.XML_TESTS:
                this.transformToXUnit(report);
                break;
            case ReportType.XML_STATIC_AND_TESTS:
                this.transformToSarif(report);
                this.transformToXUnit(report);
                break;
            case ReportType.XML_SOATEST:
                this.transformToSOATestXUnit(report);
                break;
            case ReportType.XML_STATIC_AND_SOATEST:
                this.transformToSOATestXUnit(report);
                this.transformToSarif(report);
                break;
            case ReportType.XML_XUNIT:
                this.xUnitReports.push(report);
                break;
            default:
                tl.warning("Skipping unrecognized report file: " + report);
        }
    }


    transformToSarif = (sourcePath: string): void => {
        this.transform(sourcePath, this.SARIF_SEF_TEXT, sourcePath + this.SARIF_SUFFIX, this.sarifReports);
    }

    transformToXUnit = (sourcePath: string): void => {
        this.transform(sourcePath, this.XUNIT_SEF_TEXT, sourcePath + this.XUNIT_SUFFIX, this.xUnitReports);
    }

    transformToSOATestXUnit = (sourcePath: string): void => {
        this.transform(sourcePath, this.SOATEST_XUNIT_SEF_TEXT, sourcePath + this.XUNIT_SUFFIX, this.xUnitReports);
    }

    transform = (sourcePath: string, sheetText: string, outPath: string, transformedReports: string[]): void => {
        try {
            let xmlReport = fs.readFileSync(sourcePath, 'utf8');
            if(outPath.endsWith(this.SARIF_SUFFIX)) {
                xmlReport = xmlReport.replace("<ResultsSession ", "<ResultsSession pipelineBuildWorkingDirectory=\"" + this.defaultWorkingDirectory + "\" ");
            }
            const options: SaxonJS.options = {
                stylesheetText: sheetText,
                sourceText: xmlReport,
                destination: "serialized"
            };
            const result = SaxonJS.transform(options);
            let resultString = result.principalResult;
            if (this.ruleDocUrlMap.size != 0 && outPath.endsWith(this.SARIF_SUFFIX)) {
                resultString = this.appendRuleDocUrls(result.principalResult);
            }
            fs.writeFileSync(outPath, resultString);
            transformedReports.push(outPath);
        } catch (error) {
            tl.warning("Failed to transform report: " + sourcePath + ". See log for details.");
        }
    }

    isLegacyReport = (node:any): boolean => {
        return !((node.attributes.hasOwnProperty('ver10x')) && (node.attributes['ver10x'] == '1'));
    }

    isSOAtestReport = (node: any): boolean => {
        return node.attributes.hasOwnProperty('toolName') && node.attributes['toolName'] == 'SOAtest';
    }

    isCPPProReport = (node: any): boolean => {
        return node.attributes.hasOwnProperty('toolName') && node.attributes['toolName'] == 'C++test' && !node.attributes.hasOwnProperty('prjModule');
    }

    processResults = (inputReportFiles: string[], index: number): void =>{
        if (index < inputReportFiles.length - 1) {
            this.transformReports(inputReportFiles, ++index);
        } else {
            if (this.xUnitReports.length > 0) {
                let tp: tl.TestPublisher = new tl.TestPublisher('JUnit');
                tp.publish(this.xUnitReports, this.mergeResults, this.platform, this.config, this.testRunTitle, this.publishRunAttachments);
            }
            if (this.sarifReports.length > 0) {
                for (var i = 0; i < this.sarifReports.length; ++i) {
                    tl.uploadArtifact("Container", this.sarifReports[i], "CodeAnalysisLogs");
                }
            }
            if(this.failOnFailures){
                this.checkRunFailures(this.xUnitReports, this.sarifReports);
            } else {
                tl.setResult(tl.TaskResult.Succeeded, '');
            }
        }
    }

    isNullOrWhitespace = (input: any): boolean => {
        if (typeof input === 'undefined' || input === null) {
            return true;
        }
        return input.replace(/\s/g, '').length < 1;
    }

    loadSettings = (localSettingsPath: string | undefined): ReadOnlyProperties | null => {
        if (this.isNullOrWhitespace(localSettingsPath)) {
            tl.debug('No settings file specified.');
            return null;
        }

        let localSettingsFile = tl.resolve(this.defaultWorkingDirectory, localSettingsPath);
        tl.debug('Settings file found: ' + localSettingsFile);

        return this.loadProperties(localSettingsFile);
    }

    hasCredentials = (username: string, password: string): boolean => {
        if (this.isNullOrWhitespace(username)) {
            tl.warning('dtp.user is required in settings file.');
            return false;
        }
        if (this.isNullOrWhitespace(password)) {
            tl.warning('dtp.password is required in settings file.');
            return false;
        }
        return true;
    }

    getDtpBaseUrl = (settings: ReadOnlyProperties): string => {
        let dtpBaseUrl: URL;
        const dtpUrl = settings['dtp.url'];
        const dtpServer = settings['dtp.server'];

        if (!this.isNullOrWhitespace(dtpUrl)) {
            try {
                dtpBaseUrl = new URL(dtpUrl);
            } catch (err) {
                tl.warning('Invalid dtp.url.');
                return '';
            }
        } else if (!this.isNullOrWhitespace(dtpServer)) {
            try {
                dtpBaseUrl = new URL('https://' + dtpServer);
            } catch (err) {
                tl.warning('Invalid dtp.server.');
                return '';
            }

            const dtpPort = settings['dtp.port'];
            if (!this.isNullOrWhitespace(dtpPort)) {
                if (this.isValidPort(parseInt(dtpPort))) {
                    dtpBaseUrl.port = dtpPort;
                } else {
                    tl.warning('Invalid dtp.port.');
                }
            }

            const dtpContextPath = settings['dtp.context.path'];
            if (!this.isNullOrWhitespace(dtpContextPath)) {
                dtpBaseUrl.pathname = dtpContextPath.endsWith("/") ? dtpContextPath : (dtpContextPath + "/");
            }
        } else {
            tl.warning('dtp.url (since 10.6.1) or dtp.server is required in settings file.');
            return '';
        }

        return dtpBaseUrl.href;
    }

    verifyDTPService = (): Promise<any> => {
        let url = this.dtpBaseUrl + "grs/api/v1/dtpServices";
        return axios.default.get(url, {
            httpsAgent: this.httpsAgent,
            auth: {
                username: this.dtpUsername,
                password: this.dtpPassword
            }
        }).then(() => {
            this.isDTPServiceAvailable = true;
        }).catch((error) => {
            this.isDTPServiceAvailable = false;
            tl.warning("Unable to connect to DTP to retrieve documentation for rules using the provided settings: Error code " + (error.response ? error.response.status : undefined));
        });
    }

    isValidPort = (port: any):boolean => {
        return Number.isSafeInteger(port) && (port >= 0 && port <= 65535);
    }

    getRuleDoc = (ruleId: string, analyzerId: string): Promise<any> => {
        return this.doGetRuleDoc(ruleId, analyzerId, 1.6)
            .catch((error) => {
                if (error.status != 404) {
                    return Promise.resolve(error);
                }
                // If the API call to get rule documentation URL fails and returns a 404 error,
                // we'll try to call the legacy DTP API with version 1.0 as a fallback.
                return this.doGetRuleDoc(ruleId, analyzerId, 1)
                    .catch((error) => {
                        if (error.status != 404) {
                            return Promise.resolve(error);
                        }
                        // It's important to note that in some cases, a matching rule documentation URL may not be available
                        // due to known limitations, such as an incompatible DTP version with language tools or a legacy report
                        // that lacks the required data.
                        this.ruleDocUrlMap.set(ruleId, "");
                        return Promise.resolve();
                    });
            });
    }

    doGetRuleDoc = (ruleId: string, analyzerId: string, apiVersion: number): Promise<any> => {
        let url = this.dtpBaseUrl + "grs/api/v" + apiVersion +"/rules/doc?rule=" + ruleId + "&analyzerId=" + analyzerId;
        return axios.default.get(url, {
            httpsAgent: this.httpsAgent,
            auth: {
                username: this.dtpUsername,
                password: this.dtpPassword
            }
        }).then((response) => {
            this.ruleDocUrlMap.set(ruleId, response.data.docsUrl);
            return Promise.resolve();
        }).catch((error) => {
            return Promise.reject(error.response.data);
        });
    }

    mapToAnalyzer = (ruleId: string, violationType: string):string => {
        switch (violationType) {
            case 'DupViol':
                return "com.parasoft.xtest.cpp.analyzer.static.dupcode";
            case 'FlowViol':
                return "com.parasoft.xtest.cpp.analyzer.static.flow";
            case 'MetViol':
                return "com.parasoft.xtest.cpp.analyzer.static.metrics";
            default:
                if (this.rulesInGlobalCategory.has((ruleId))) {
                    return "com.parasoft.xtest.cpp.analyzer.static.global";
                } else {
                    return "com.parasoft.xtest.cpp.analyzer.static.pattern";
                }
        }
    }

    appendRuleDocUrls = (sarifReport: string):string => {
        let sarifJson = JSON.parse(sarifReport);
        sarifJson.runs.forEach((run: any) => {
            run.tool.driver.rules.forEach((rule: any) => {
                let helpUri = this.ruleDocUrlMap.get(rule.id);
                if (helpUri) {
                    rule.helpUri = helpUri;
                }
            })
        })
        return JSON.stringify(sarifJson);
    }

    loadProperties = (localSettingsFile: string): ReadOnlyProperties | null => {
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

    checkRunFailures = (xUnitReports: string[], sarifReports: string[]):void => {
        if (xUnitReports.length > 0) {
            this.checkFailures(xUnitReports, sarifReports, 0);
        } else if (sarifReports.length > 0) {
            this.checkStaticAnalysisViolations(sarifReports, 0);
        }
    }

    isNone = (node: any, propertyName: string):boolean => {
        return !node.attributes.hasOwnProperty(propertyName) || node.attributes[propertyName] == 0;
    }

    checkFailures = (xUnitReports: string[], sarifReports: string[], index: number):void => {
        let success: boolean = true;
        let report: string = xUnitReports[index];
        const saxStream = sax.createStream(true, {});
        saxStream.on("opentag", (node) => {
            if (node.name == 'testsuite') {
                success = success && (this.isNone(node, "failures") && this.isNone(node, "errors"));
            }
        });
        saxStream.on("error", (e) => {
            tl.warning('Failed to parse ' + report + '. Error was: ' + e.message);
        });
        saxStream.on("end", () => {
            if (success) {
                if (index < xUnitReports.length - 1) {
                    this.checkFailures(xUnitReports, sarifReports, ++index);
                } else if (sarifReports.length > 0) {
                    this.checkStaticAnalysisViolations(sarifReports, 0);
                } else {
                    tl.setResult(tl.TaskResult.Succeeded, 'Build succeed. Test failures and/or static analysis violation were not found.');
                }
            } else {
                tl.setResult(tl.TaskResult.Failed, 'Failed build due to test failures and/or static analysis violations.');
            }
        });
        fs.createReadStream(report).pipe(saxStream);
    }

    checkStaticAnalysisViolations = (sarifReports: string[], index: number):void => {
        let success: boolean = true;
        let sarifReportPath: string = sarifReports[index];
        let sarifReport = JSON.parse(fs.readFileSync(sarifReportPath,'utf-8'));
        let resultsValue = sarifReport.runs[0].results[0];

        success = (resultsValue == null) || (!resultsValue);
        if (success) {
            if (index < sarifReports.length -1) {
                this.checkStaticAnalysisViolations(sarifReports, ++index);
            } else {
                tl.setResult(tl.TaskResult.Succeeded, 'Build succeed. Test failures and/or static analysis violation were not found.');
            }
        } else {
            tl.setResult(tl.TaskResult.Failed, 'Failed build due to test failures and/or static analysis violations.');
        }
    }
}