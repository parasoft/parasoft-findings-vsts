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
import * as os from 'os';
import * as fs from 'fs';
import * as sax from 'sax';
import * as dp from 'dot-properties';
import * as SaxonJS from 'saxon-js';
import { URL } from 'url';
import * as https from 'https';
import * as axios from 'axios';
import {CoverageReportService} from "./CoverageReportService";
import {StaticAnalysisReportService} from "./StaticAnalysisReportService";
import {ParaReportPublishUtils} from "./ParaReportPublishUtils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(sax as any).MAX_BUFFER_LENGTH = 2 * 1024 * 1024 * 1024; // 2GB

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

const enum PipelineTypeEnum {
    BUILD = 'build',
    RELEASE = 'release'
}

export class ParaReportPublishService {
    private readonly SARIF_XSL: XslInfo = {
        xslPath: __dirname + "/xsl/sarif.xsl",
        jsonText: fs.readFileSync(__dirname + "/xsl/sarif.sef.json", 'utf8')
    };
    private readonly XUNIT_XSL: XslInfo = {
        xslPath: __dirname + "/xsl/xunit.xsl",
        jsonText: fs.readFileSync(__dirname + "/xsl/xunit.sef.json", 'utf8')
    };
    private readonly SOATEST_XUNIT_XSL: XslInfo = {
        xslPath: __dirname + "/xsl/soatest-xunit.xsl",
        jsonText: fs.readFileSync(__dirname + "/xsl/soatest-xunit.sef.json", 'utf8')
    };
    private readonly COBERTURA_XSL: XslInfo = {
        xslPath: __dirname + "/xsl/cobertura.xsl",
        jsonText: fs.readFileSync(__dirname + "/xsl/cobertura.sef.json", 'utf8')
    }

    private readonly pipelineType: PipelineTypeEnum = PipelineTypeEnum.BUILD;

    xUnitReports: string[] = [];
    sarifReports: string[] = [];
    coberturaReports: string[] = [];
    matchingInputReportFiles: string[];
    rulesInGlobalCategory: Set<string> = new Set();
    private ruleAnalyzerMap: Map<string, string> = new Map();
    ruleDocUrlMap: Map<string,string> = new Map();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private ruleDocUrlPromises: Promise<any>[] = [];
    httpsAgent = new https.Agent({
        rejectUnauthorized: false,
        maxSockets: 50
    })

    coverageReportService: CoverageReportService;
    staticAnalysisReportService: StaticAnalysisReportService;

    defaultWorkingDirectory: string;
    inputReportFiles: string[];
    private mergeResults: string | undefined;
    private platform: string | undefined;
    private config: string | undefined;
    private testRunTitle: string | undefined;
    private publishRunAttachments: string | undefined;
    localSettingsPath: string | undefined;

    // DTP settings
    isDtpRuleDocsServiceAvailable: boolean = false;
    dtpBaseUrl: string = '';

    javaPath: string | undefined;

    constructor() {
        this.defaultWorkingDirectory = tl.getVariable('System.DefaultWorkingDirectory') || '';
        if(tl.getVariable('Release.ReleaseId')) {
            this.pipelineType = PipelineTypeEnum.RELEASE;
        }

        // Get inputs of task configuration
        this.inputReportFiles = tl.getDelimitedInput('resultsFiles', '\n', true);
        const searchFolder = this.isNullOrWhitespace(tl.getInput('searchFolder')) ? this.defaultWorkingDirectory : tl.getInput('searchFolder');
        this.matchingInputReportFiles = tl.findMatch(searchFolder || '', this.inputReportFiles);
        const parasoftToolOrJavaRootPath = tl.getPathInput("parasoftToolOrJavaRootPath");
        this.javaPath = this.getJavaPath(parasoftToolOrJavaRootPath);
        this.localSettingsPath = tl.getPathInput("localSettingsPath");
        // Get DTP settings from local settings file
        const localSettings = this.loadSettings(this.localSettingsPath);
        if (localSettings) {
            this.dtpBaseUrl = this.getDtpBaseUrl(localSettings);
            tl.debug(this.isNullOrWhitespace(this.dtpBaseUrl) ? 'Failed to load DTP settings.' : 'DTP settings have been successfully loaded.');
        }

        // Get inputs of Test results options
        this.testRunTitle = tl.getInput('testRunTitle');
        this.publishRunAttachments = tl.getInput('publishRunAttachments');
        this.mergeResults = tl.getInput('mergeTestResults');
        this.platform = tl.getInput('platform');
        this.config = tl.getInput('configuration');

        this.coverageReportService = new CoverageReportService();
        this.staticAnalysisReportService = new StaticAnalysisReportService();

        tl.debug('searchFolder: ' + searchFolder);
        tl.debug('inputReportFiles: ' + this.inputReportFiles);
        tl.debug('parasoftToolOrJavaRootPath: ' + parasoftToolOrJavaRootPath);
        tl.debug('localSettingsPath: ' + this.localSettingsPath);
        tl.debug('mergeResults: ' + this.mergeResults);
        tl.debug('platform: ' + this.platform);
        tl.debug('config: ' + this.config);
        tl.debug('testRunTitle: ' + this.testRunTitle);
        tl.debug('publishRunAttachments: ' + this.publishRunAttachments);
    }

    run = async (): Promise<void> => {
        // Check if there are multiple "Publish Parasoft Results" tasks in the pipeline to prevent confusion
        const publishTaskExists = tl.getVariable('PF.PublishTaskExists');
        if (publishTaskExists !== 'true') {
            // Clean up the old custom markdown summary storage directory when running the first PublishParasoftResults task
            tl.rmRF(tl.resolve(this.defaultWorkingDirectory, 'ParasoftQualityGatesMD'));
        }

        tl.setVariable('PF.PublishTaskExists', 'true');

        // Get matching input report files and perform transformations
        if (!this.matchingInputReportFiles || this.matchingInputReportFiles.length === 0) {
            tl.warning('No test result files matching ' + this.inputReportFiles + ' were found.');
            tl.setResult(tl.TaskResult.Succeeded, '');
        } else {
            try {
                if (!this.isNullOrWhitespace(this.dtpBaseUrl)) {
                    // Check if the DTP service is available before transforming the reports when DTP settings are provided
                    this.verifyDtpRuleDocsService().then(async () => await this.transformReports(this.matchingInputReportFiles, 0));
                } else {
                    await this.transformReports(this.matchingInputReportFiles, 0);
                }
            } catch (error) {
                tl.error('Error. See log for details');
                console.error(error);
                return;
            }
        }
    }

    transformReports = async (inputReportFiles: string[], index: number): Promise<void> => {
        let reportType: ReportType = ReportType.UNKNOWN;
        let report: string = inputReportFiles[index];
        let bLegacyReport: boolean = false;
        let bCPPProReport: boolean = false;
        let bParsingStaticAnalysisResult: boolean = false;

        if (report.toLocaleLowerCase().endsWith(ParaReportPublishUtils.SARIF_EXTENSION)) {
            // SARIF report generated by Parasoft tools
            if (this.pipelineType == PipelineTypeEnum.RELEASE) {
                tl.warning("Parsing static analysis reports is not supported in the release pipeline - skipping report: " + report);
            } else {
                tl.debug("Recognized SARIF report: " + report);
                // new SARIF report needs to be processed
                report = this.staticAnalysisReportService.processParasoftSarifReport(report);
                this.sarifReports.push(report);
            }
            await this.processResults(inputReportFiles, index);
        } else if (report.toLocaleLowerCase().endsWith(ParaReportPublishUtils.XML_EXTENSION)) {
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
                        tl.debug("Recognized and skipped legacy XML Static Analysis report: " + report);
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
                    const ruleId = node.attributes.id as string;
                    const analyzerId = node.attributes.analyzer as string;
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
                    const ruleId = node.attributes.rule as string;
                    if(!this.ruleAnalyzerMap.has(ruleId)) {
                        const analyzerId = this.mapToAnalyzer(ruleId, node.name);
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
                Promise.all(this.ruleDocUrlPromises).then(async (errors) =>{
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const firstError: any = errors.find(error => error !== null && error !== undefined);
                    if (firstError) {
                        this.ruleDocUrlMap.clear();
                        const errorCode = firstError.status;
                        tl.warning("Failed to get documentation for rules with provided settings: Error code " + errorCode);
                    } else if (this.ruleDocUrlPromises.length > 0) {
                        tl.debug("The documentation for rules has been successfully loaded.");
                    }
                    this.transformToReport(reportType, report);
                    await this.processResults(inputReportFiles, index);
                });
            });
            fs.createReadStream(report).pipe(saxStream);
        } else {
            tl.warning("Skipping unrecognized report file: " + report);
            await this.processResults(inputReportFiles, index);
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
        if (this.pipelineType == PipelineTypeEnum.RELEASE) {
            tl.warning("Parsing static analysis reports is not supported in the release pipeline - skipping report: " + sourcePath);
            return;
        }
        this.transform(sourcePath, this.SARIF_XSL, ParaReportPublishUtils.generateReportNameWithPFSuffix(this.staticAnalysisReportService.generateUniqueFileName(sourcePath), ParaReportPublishUtils.SARIF_SUFFIX), this.sarifReports);
    }

    transformToXUnit = (sourcePath: string): void => {
        this.transform(sourcePath, this.XUNIT_XSL, ParaReportPublishUtils.generateReportNameWithPFSuffix(sourcePath, ParaReportPublishUtils.XUNIT_SUFFIX), this.xUnitReports);
    }

    transformToSOATestXUnit = (sourcePath: string): void => {
        this.transform(sourcePath, this.SOATEST_XUNIT_XSL, ParaReportPublishUtils.generateReportNameWithPFSuffix(sourcePath, ParaReportPublishUtils.XUNIT_SUFFIX), this.xUnitReports);
    }

    transformToCobertura = (sourcePath: string): void => {
        if (this.pipelineType == PipelineTypeEnum.RELEASE) {
            tl.warning("Parsing code coverage reports is not supported in the release pipeline - skipping report: " + sourcePath);
            return;
        }
        this.transform(sourcePath, this.COBERTURA_XSL, ParaReportPublishUtils.generateReportNameWithPFSuffix(sourcePath, ParaReportPublishUtils.COBERTURA_SUFFIX), this.coberturaReports, true)
    }

    transform = (sourcePath: string, xslInfo: XslInfo, outPath: string, transformedReports: string[], isCoberturaReport?: boolean): void => {
        try {
            let needRuleDocs = false;
            if (this.ruleDocUrlMap.size != 0 && outPath.endsWith(ParaReportPublishUtils.SARIF_SUFFIX)) {
                needRuleDocs = true;
            }
            let attributeName = "pipelineBuildWorkingDirectory";
            if (outPath.endsWith(ParaReportPublishUtils.SARIF_SUFFIX)) {
                attributeName = "projectRootPaths";
            }
            if (this.javaPath) {
                // Transform with java
                const jarPath = tl.resolve(__dirname, "lib/SaxonHE12-2J/saxon-he-12.2.jar");
                const result = tl.execSync(this.javaPath, ["-jar", jarPath, "-s:"+sourcePath, "-xsl:"+xslInfo.xslPath, "-o:"+outPath, "-versionmsg:off", attributeName+"="+this.defaultWorkingDirectory]);
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
                } else if (outPath.endsWith(ParaReportPublishUtils.SARIF_SUFFIX) || outPath.endsWith(ParaReportPublishUtils.XUNIT_SUFFIX)) {
                    xmlReport = xmlReport.replace("<ResultsSession ", "<ResultsSession " + attributeName + "=\"" + this.defaultWorkingDirectory + "\" ");
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
            console.error(error);
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private isCoverageReport = (node: any): boolean => {
        // The "ver" attribute is present in <Coverage> in coverage.xml but absent in <Coverage> within <Exec> in report.xml.
        return node.attributes.hasOwnProperty('ver');
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private isLegacyReport = (node:any): boolean => {
        return !((node.attributes.hasOwnProperty('ver10x')) && (node.attributes['ver10x'] == '1'));
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private isSOAtestReport = (node: any): boolean => {
        return node.attributes.hasOwnProperty('toolName') && node.attributes['toolName'] == 'SOAtest';
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private isCPPProReport = (node: any): boolean => {
        return node.attributes.hasOwnProperty('toolName') && node.attributes['toolName'] == 'C++test' && !node.attributes.hasOwnProperty('prjModule');
    }

    private processResults = async (inputReportFiles: string[], index: number): Promise<void> =>{
        if (index < inputReportFiles.length - 1) {
            await this.transformReports(inputReportFiles, index + 1);
            return;
        }
        await this.processXUnitResults();
        await this.staticAnalysisReportService.processSarifResults(this.sarifReports);
        await this.coverageReportService.processCoberturaResults(this.coberturaReports);

        tl.setResult(tl.TaskResult.Succeeded, '');
    }

    private async processXUnitResults(): Promise<void> {
        if (this.xUnitReports.length > 0) {
            const tp = new tl.TestPublisher('JUnit');
            tp.publish(this.xUnitReports, this.mergeResults, this.platform, this.config, this.testRunTitle, this.publishRunAttachments);
        }
    }

    private isNullOrWhitespace = (input: string | undefined | null): boolean => {
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

        const localSettingsFile = tl.resolve(this.defaultWorkingDirectory, localSettingsPath);
        tl.debug('Settings file found: ' + localSettingsFile);

        return this.loadProperties(localSettingsFile);
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
        // Check if the DTP rule documentation service is available by calling the API with a non-existing rule id and analyzer id pair.
        // If the API call returns a 404 error, it means the service is available.
        return axios.default
            .get(
                this.dtpBaseUrl + "grs/api/v1.0/rules/doc?rule=notExistingRule&analyzerId=notExistingAnalyzerId",
                { httpsAgent: this.httpsAgent }
            ).then(() => {
                // Should not reach here because "nonExistingRule" and "nonExistingAnalyzerId" is not a valid pair
                this.isDtpRuleDocsServiceAvailable = true;
            }).catch((error) => {
                const status =  error && error.response && error.response.data ? error.response.data.status : undefined;
                if (status == 404) {
                    this.isDtpRuleDocsServiceAvailable = true;
                } else if (status == 401) {
                    // Authentication is required to access the rule documentation service for DTP versions older than 2023.1
                    this.isDtpRuleDocsServiceAvailable = false;
                    tl.warning("Unable to retrieve the documentation for rules from DTP. It is likely that the current DTP version is older than 2023.1 and is no longer supported.");
                } else {
                    this.isDtpRuleDocsServiceAvailable = false;
                    tl.warning("Unable to connect to DTP and retrieve the documentation for rules using the provided settings (error code: " + status + "). " +
                        "Please make sure the values of 'dtp.*' in " + this.localSettingsPath + " are correct.");
                }
            });
    }

    private isValidPort = (port: number):boolean => {
        return Number.isSafeInteger(port) && (port >= 0 && port <= 65535);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    doGetRuleDoc = (ruleId: string, analyzerId: string, apiVersion: number): Promise<any> => {
        const url = this.dtpBaseUrl + "grs/api/v" + apiVersion +"/rules/doc?rule=" + ruleId + "&analyzerId=" + analyzerId;
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
        const sarifJson = JSON.parse(sarifReport);
        /* eslint-disable @typescript-eslint/no-explicit-any */
        sarifJson.runs.forEach((run: any) => {
            run.tool.driver.rules.forEach((rule: any) => {
                const helpUri = this.ruleDocUrlMap.get(rule.id);
                if (helpUri) {
                    rule.helpUri = helpUri;
                }
            })
        })
        /* eslint-enable @typescript-eslint/no-explicit-any */
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
        const javaPaths = [
            "bin", // Java installation
            "bin/dottest/Jre_x64/bin", // dotTEST installation
            "bin/jre/bin" // C/C++test or Jtest installation
        ];
        for (const path of javaPaths) {
            const javaFilePath = tl.resolve(parasoftToolOrJavaRootPath, path, javaFileName);
            if (fs.existsSync(javaFilePath)) {
                tl.debug("Using Java to process report(s), Java path: " + javaFilePath);
                return javaFilePath;
            }
        }
        tl.debug("Using built-in Node.js to process report(s).");
        return undefined;
    }
}