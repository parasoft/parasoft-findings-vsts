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
import * as path from 'path';
import * as os from 'os';
import * as tr from 'azure-pipelines-task-lib/toolrunner';
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

interface XslInfo {
    xslPath: string;
    jsonText: string;
}

export const enum ReportType {
    SARIF = 0,
    XML_STATIC = 1,
    XML_TESTS = 2,
    XML_SOATEST = 3,
    XML_STATIC_AND_TESTS = 4,
    XML_STATIC_AND_SOATEST = 5,
    XML_XUNIT = 6,
    UNKNOWN = 7,
    XML_COVERAGE = 8
}

export class ParaReportPublishService {
    readonly XUNIT_SUFFIX: string = "-junit.xml";
    readonly SARIF_SUFFIX: string = "-sast.sarif";
    readonly COBERTURA_SUFFIX: string = "-cobertura.xml";
    readonly XML_EXTENSION: string = ".xml";
    readonly SARIF_EXTENSION: string = ".sarif";

    readonly SARIF_XSL: XslInfo = {
        xslPath: __dirname + "/xsl/sarif.xsl",
        jsonText: fs.readFileSync(__dirname + "/xsl/sarif.sef.json", 'utf8')
    };
    readonly XUNIT_XSL: XslInfo = {
        xslPath: __dirname + "/xsl/xunit.xsl",
        jsonText: fs.readFileSync(__dirname + "/xsl/xunit.sef.json", 'utf8')
    };
    readonly SOATEST_XUNIT_XSL: XslInfo = {
        xslPath: __dirname + "/xsl/soatest-xunit.xsl",
        jsonText: fs.readFileSync(__dirname + "/xsl/soatest-xunit.sef.json", 'utf8')
    };
    readonly COBERTURA_XSL: XslInfo = {
        xslPath: __dirname + "/xsl/cobertura.xsl",
        jsonText: fs.readFileSync(__dirname + "/xsl/cobertura.sef.json", 'utf8')
    }

    xUnitReports: string[] = [];
    sarifReports: string[] = [];
    coberturaReports: string[] = [];
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
    parasoftToolOrJavaRootPath: string | undefined;

    // DTP settings
    isDtpRuleDocsServiceAvailable: boolean = false;
    dtpBaseUrl: string = '';

    javaPath: string | undefined;

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
        this.parasoftToolOrJavaRootPath = tl.getPathInput("parasoftToolOrJavaRootPath");
        const localSettings = this.loadSettings(this.localSettingsPath);

        if (localSettings) {
            this.dtpBaseUrl = this.getDtpBaseUrl(localSettings);
            tl.debug(this.isNullOrWhitespace(this.dtpBaseUrl) ? 'Failed to load DTP settings.' : 'DTP settings are loaded successfully.');
        }

        this.javaPath = this.getJavaPath(this.parasoftToolOrJavaRootPath);
        this.matchingInputReportFiles = tl.findMatch(this.searchFolder || '', this.inputReportFiles);

        tl.debug('searchFolder: ' + this.searchFolder);
        tl.debug('inputReportFiles: ' + this.inputReportFiles);
        tl.debug('parasoftToolOrJavaRootPath: ' + this.parasoftToolOrJavaRootPath);
        tl.debug('localSettingsPath: ' + this.localSettingsPath);
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
            if (!this.isNullOrWhitespace(this.dtpBaseUrl)) {
                this.verifyDtpRuleDocsService().then(() => this.transformReports(this.matchingInputReportFiles, 0));
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
                if (node.name == 'Coverage') {
                    if (this.isCoverageReport(node)){
                        tl.debug("Recognized XML Coverage report: " + report);
                        reportType = ReportType.XML_COVERAGE;
                    }
                } else if (node.name == 'StdViols') {
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
                    let ruleId = node.attributes.id as string;
                    let analyzerId = node.attributes.analyzer as string;
                    if (!bLegacyReport) {
                        // A <Rule> has a rule ID and analyzer ID in a non-legacy report
                        if (this.isDtpRuleDocsServiceAvailable) {
                            this.ruleDocUrlPromises.push(this.getRuleDoc(ruleId, analyzerId));
                        }
                        this.ruleAnalyzerMap.set(ruleId, analyzerId);
                    } else if (node.attributes.cat == 'GLOBAL') {
                        this.rulesInGlobalCategory.add(ruleId);
                    }

                } else if (bParsingStaticAnalysisResult && bLegacyReport && node.name.endsWith('Viol')) {
                    let ruleId = node.attributes.rule as string;
                    if(!this.ruleAnalyzerMap.has(ruleId)) {
                        let analyzerId = this.mapToAnalyzer(ruleId, node.name);
                        if (this.isDtpRuleDocsServiceAvailable) {
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
            case ReportType.XML_COVERAGE:
                this.transformToCobertura(report)
                break;
            default:
                tl.warning("Skipping unrecognized report file: " + report);
        }
    }


    transformToSarif = (sourcePath: string): void => {
        this.transform(sourcePath, this.SARIF_XSL, sourcePath + this.SARIF_SUFFIX, this.sarifReports);
    }

    transformToXUnit = (sourcePath: string): void => {
        this.transform(sourcePath, this.XUNIT_XSL, sourcePath + this.XUNIT_SUFFIX, this.xUnitReports);
    }

    transformToSOATestXUnit = (sourcePath: string): void => {
        this.transform(sourcePath, this.SOATEST_XUNIT_XSL, sourcePath + this.XUNIT_SUFFIX, this.xUnitReports);
    }

    transformToCobertura = (sourcePath: string): void => {
        this.transform(sourcePath, this.COBERTURA_XSL, sourcePath + this.COBERTURA_SUFFIX, this.coberturaReports, true)
    }

    transform = (sourcePath: string, xslInfo: XslInfo, outPath: string, transformedReports: string[], isCoberturaReport?: boolean): void => {
        try {
            let needRuleDocs = false;
            if (this.ruleDocUrlMap.size != 0 && outPath.endsWith(this.SARIF_SUFFIX)) {
                needRuleDocs = true;
            }
            if (this.javaPath) {
                // Transform with java
                const jarPath = tl.resolve(__dirname, "lib/SaxonHE12-2J/saxon-he-12.2.jar");
                let result = tl.execSync(this.javaPath, ["-jar", jarPath, "-s:"+sourcePath, "-xsl:"+xslInfo.xslPath, "-o:"+outPath, "-versionmsg:off", "pipelineBuildWorkingDirectory="+this.defaultWorkingDirectory]);
                if (result.code != 0) {
                    throw result.error;
                }
                if (needRuleDocs) {
                    let resultString = fs.readFileSync(outPath, 'utf8');
                    resultString = this.appendRuleDocUrls(resultString);
                    fs.writeFileSync(outPath, resultString);
                }
            } else {
                // Transform with built-in nodejs in agent
                let xmlReport = fs.readFileSync(sourcePath, 'utf8');
                if (isCoberturaReport) {
                    xmlReport = xmlReport.replace("<Coverage ", "<Coverage pipelineBuildWorkingDirectory=\"" + this.defaultWorkingDirectory + "\" ");
                } else if (outPath.endsWith(this.SARIF_SUFFIX)) {
                    xmlReport = xmlReport.replace("<ResultsSession ", "<ResultsSession pipelineBuildWorkingDirectory=\"" + this.defaultWorkingDirectory + "\" ");
                }
                const options: SaxonJS.options = {
                    stylesheetText: xslInfo.jsonText,
                    sourceText: xmlReport,
                    destination: "serialized"
                };
                let resultString = SaxonJS.transform(options).principalResult;
                if (needRuleDocs) {
                    resultString = this.appendRuleDocUrls(resultString);
                }
                fs.writeFileSync(outPath, resultString);
            }
            transformedReports.push(outPath);
        } catch (error) {
            tl.warning("Failed to transform report: " + sourcePath + ". See log for details.");
        }
    }

    isCoverageReport = (node: any): boolean => {
        // To differentiate <Coverage> in coverage.xml with <Coverage> inside <Exec> in report.xml
        return node.attributes.hasOwnProperty('ver');
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
            if (this.coberturaReports.length > 0) {
                let tempFolder = path.join(this.getTempFolder(), 'CodeCoverageHtml');
                let coverageReport: string = <string> this.coberturaReports[this.coberturaReports.length - 1];
                this.generateHtmlReport(coverageReport, tempFolder);

                const coveragePublisher = new tl.CodeCoveragePublisher();
                coveragePublisher.publish('Cobertura', coverageReport, tempFolder, '');
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
    // code from azure-pipelines-tasks/Tasks/PublishCodeCoverageResultsV1
    getTempFolder = (): string => {
        try {
            tl.assertAgent('2.115.0');
            const tmpDir = tl.getVariable('Agent.TempDirectory');
            return <string>tmpDir;
        } catch (err) {
            tl.warning('Please upgrade your agent version. https://github.com/Microsoft/vsts-agent/releases')
            return os.tmpdir();
        }
    }
    // code from azure-pipelines-tasks/Tasks/PublishCodeCoverageResultsV1
    generateHtmlReport = (summaryFile: string, targetDir: string): boolean => {
        const platform = os.platform();
        let dotnet: tr.ToolRunner;

        const dotnetPath = tl.which('dotnet', false);
        if (!dotnetPath && platform !== 'win32') {
            tl.warning("Please install dotnet core to enable automatic generation of coverage Html report.");
            return false;
        }

        if (!dotnetPath && platform === 'win32') {
            // use full .NET to execute
            dotnet = tl.tool(path.join(__dirname, 'lib', 'net47', 'ReportGenerator.exe'));
        } else {
            dotnet = tl.tool(dotnetPath);
            dotnet.arg(path.join(__dirname, 'lib', 'netcoreapp2.0', 'ReportGenerator.dll'));
        }

        dotnet.arg('-reports:' + summaryFile);
        dotnet.arg('-targetdir:' + targetDir);
        dotnet.arg('-reporttypes:HtmlInline_AzurePipelines');

        try {
            const result = dotnet.execSync(<tr.IExecOptions>{
                ignoreReturnCode: true,
                failOnStdErr: false,
                errStream: process.stdout,
                outStream: process.stdout
            });

            let isError = false;
            dotnet.on('stderr', (data: Buffer) => {
                console.error(data.toString());
                isError = true;
            });

            if (result.code === 0 && !isError) {
                console.log("Generated code coverage html report: " + targetDir);
                return true;
            } else {
                tl.warning("Failed to generate Html report. Error: " + result);
            }
        } catch (err) {
            tl.warning("Failed to generate Html report. Error: " + err);
        }
        return false;
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
                dtpBaseUrl.pathname = dtpContextPath;
            }
        } else {
            tl.warning('dtp.url (since 10.6.1) or dtp.server is required in settings file.');
            return '';
        }

        const dtpBaseUrlHref = dtpBaseUrl.href.endsWith("/") ? dtpBaseUrl.href : (dtpBaseUrl.href + "/");
        tl.debug('Dtp base url is: ' + dtpBaseUrlHref);

        return dtpBaseUrlHref;
    }

    verifyDtpRuleDocsService = () => {
        // Try to get not existing rule doc url, 404 is expected when response is returned as normal.
        return axios.default.get(this.dtpBaseUrl + "grs/api/v1.0/rules/doc?rule=notExistingRule&analyzerId=notExistingAnalyzerId", {httpsAgent: this.httpsAgent})
            .then(() => {
                // Should never reach this block unless there is a `notExistingRule` rule id
                // and `notExistingAnalyzerId` analyzer id pair in the future.
                this.isDtpRuleDocsServiceAvailable = true;
            }).catch((error) => {
                const status =  error && error.response && error.response.data ? error.response.data.status : undefined;
                if (status == 404) {
                    this.isDtpRuleDocsServiceAvailable = true;
                } else if (status == 401) {
                    // Need auth to get doc url for DTP version below 2023.1.
                    this.isDtpRuleDocsServiceAvailable = false;
                    tl.warning("Unable to retrieve the documentation for the rules from DTP. It is highly possible that the current version of DTP is older than the 2023.1 which is not supported.");
                } else {
                    this.isDtpRuleDocsServiceAvailable = false;
                    tl.warning("Unable to connect to DTP and retrieve the documentation for rules using the provided settings (error code: " + status + "). " +
                        "Please make sure the values for 'dtp.*' in " + this.localSettingsPath + " are correct.");
                }
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
            httpsAgent: this.httpsAgent
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

    getJavaPath = (parasoftToolOrJavaRootPath: string | undefined): string | undefined => {
        if (!parasoftToolOrJavaRootPath || !fs.existsSync(parasoftToolOrJavaRootPath)) {
            tl.debug("Using built-in Node.js to process report(s).");
            return undefined;
        }

        const javaFileName = os.platform() == 'win32' ? "java.exe" : "java";
        // Java in Java installation
        let javaFilePath = tl.resolve(parasoftToolOrJavaRootPath, "bin", javaFileName);
        if (!fs.existsSync(javaFilePath)) {
            if (fs.existsSync(tl.resolve(parasoftToolOrJavaRootPath, "dottestcli.exe"))) {
                // Java in dotTEST installation
                javaFilePath = tl.resolve(parasoftToolOrJavaRootPath, 'bin/dottest/Jre_x64/bin', javaFileName);
            } else {
                // Java in C/C++test or Jtest installation
                javaFilePath = tl.resolve(parasoftToolOrJavaRootPath, 'bin/jre/bin', javaFileName);
            }
        }

        if (fs.existsSync(javaFilePath)) {
            tl.debug("Using Java to process report(s), Java path: " + javaFilePath);
            return javaFilePath;
        }

        tl.debug("Using built-in Node.js to process report(s).");
        return undefined;
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