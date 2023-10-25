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
import * as uuid from 'uuid';
import { BuildAPIClient, FileEntry, FileSuffixEnum, DefaultBuildReportResults, DefaultBuildReportResultsStatus } from './BuildApiClient';
import { BuildArtifact, BuildDefinitionReference, BuildResult } from 'azure-devops-node-api/interfaces/BuildInterfaces';

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

const enum BaselineStateEnum {
    NEW = 'new',
    UNCHANGED = 'unchanged'
}

interface ReferenceBuildResult {
    originalPipelineName: string,
    originalBuildNumber: string,
    staticAnalysis?: {
        pipelineName: string | undefined,
        buildId: number | undefined,
        buildNumber:  string | undefined,
        warningMessage: string | undefined
    }
}

interface ReferenceBuildInformation {
    fileEntries: FileEntry[],
    staticAnalysis: {
        pipelineName: string | undefined,
        buildId: number | undefined,
        buildNumber:  string | undefined,
        warningMessage: string | undefined
    },
    warningMessage: string | undefined,
    isDebugMessage: boolean
}

export class ParaReportPublishService {
    readonly XUNIT_SUFFIX: string = "-junit.xml";
    readonly SARIF_SUFFIX: string = "-pf-sast.sarif";
    readonly COBERTURA_SUFFIX: string = "-cobertura.xml";
    readonly XML_EXTENSION: string = ".xml";
    readonly SARIF_EXTENSION: string = ".sarif";
    readonly SARIF_ARTIFACT_NAME: string = "CodeAnalysisLogs";

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
    originalStaticAnalysisReportMap: Map<string, string> = new Map<string, string>();
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

    referencePipeline: string;
    referenceBuild: string;
    buildClient: BuildAPIClient;
    projectName: string;
    pipelineName: string;
    buildNumber: string;
    definitionId: number;
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

    referenceBuildResult: ReferenceBuildResult;

    constructor() {
        this.referencePipeline = tl.getInput('referencePipeline') || '';
        this.referenceBuild = tl.getInput('referenceBuild') || '';
        this.referenceBuildResult = {
            originalPipelineName: this.referencePipeline,
            originalBuildNumber: this.referenceBuild
        }
         // Pass the reference build to subsequent quality gate tasks
        tl.setVariable('PF.ReferenceBuildResult', JSON.stringify(this.referenceBuildResult));

        this.buildClient = new BuildAPIClient();
        this.projectName = tl.getVariable('System.TeamProject') || '';
        this.buildNumber = tl.getVariable('Build.BuildNumber') || '';
        this.pipelineName = tl.getVariable('Build.DefinitionName') || '';
        this.definitionId = Number(tl.getVariable('System.DefinitionId'));

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

        tl.debug('referencePipeline: ' + this.referencePipeline);
        tl.debug('referenceBuild: ' + this.referenceBuild);
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

    run = async (): Promise<void> => {
        if (!this.matchingInputReportFiles || this.matchingInputReportFiles.length === 0) {
            tl.warning('No test result files matching ' + this.inputReportFiles + ' were found.');
            tl.setResult(tl.TaskResult.Succeeded, '');
        } else {
            try {
                if (!this.isNullOrWhitespace(this.dtpBaseUrl)) {
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

        if(report.toLocaleLowerCase().endsWith(this.SARIF_EXTENSION)) {
            tl.debug("Recognized SARIF report: " + report);
            if (!this.checkDuplicatedStaticAnalysisReportName(report)){
                report = this.processParasoftSarifReport(report);
                this.sarifReports.push(report);
            }
            await this.processResults(inputReportFiles, index);
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
                Promise.all(this.ruleDocUrlPromises).then(async (errors) =>{
                    let firstError: any = errors.find(error => error !== null && error !== undefined);
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
        if (this.checkDuplicatedStaticAnalysisReportName(sourcePath)){
            return;
        }
        this.transform(sourcePath, this.SARIF_XSL, this.getOutputReportFilePath(sourcePath, this.SARIF_SUFFIX), this.sarifReports);
    }

    transformToXUnit = (sourcePath: string): void => {
        this.transform(sourcePath, this.XUNIT_XSL, this.getOutputReportFilePath(sourcePath, this.XUNIT_SUFFIX), this.xUnitReports);
    }

    transformToSOATestXUnit = (sourcePath: string): void => {
        this.transform(sourcePath, this.SOATEST_XUNIT_XSL, this.getOutputReportFilePath(sourcePath, this.XUNIT_SUFFIX), this.xUnitReports);
    }

    transformToCobertura = (sourcePath: string): void => {
        this.transform(sourcePath, this.COBERTURA_XSL, this.getOutputReportFilePath(sourcePath, this.COBERTURA_SUFFIX), this.coberturaReports, true)
    }

    getOutputReportFilePath  = (sourcePath: string, reportSuffix: string) : string => {
        const fileName = path.basename(sourcePath);
        const dotIndex = fileName.lastIndexOf(".");
        const fileNameWithoutExt = dotIndex > -1 ? fileName.substring(0, dotIndex) : fileName;
        const extension = dotIndex > -1 ? fileName.substring(dotIndex + 1) : '';
        return sourcePath.replace(fileName, fileNameWithoutExt) + (extension ? ('-' + extension) : '') + reportSuffix;
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
            console.error(error);
        }
    }

    processParasoftSarifReport = (report: string): string => {
        let contentString = fs.readFileSync(report, 'utf8');
        let contentJson = JSON.parse(contentString);
        if (contentJson.runs) {
            contentJson.runs.forEach((run: any) => {
                if (run.results) {
                    run.results.forEach((result: any) => {
                        if (result.locations) {
                            result.locations.forEach((location: any) => {
                                const relativeUri = this.getRelativeUri(location);
                                if (relativeUri) {
                                    // Overwrite uri to be relative path
                                    location.physicalLocation.artifactLocation.uri = relativeUri;
                                }
                            });
                        }
                    });
                }
            });
        }
        contentString = JSON.stringify(contentJson);
        report = this.getOutputReportFilePath(report, this.SARIF_SUFFIX);
        fs.writeFileSync(report, contentString, 'utf8');

        return report;
    }

    private getRelativeUri = (location: any): string | undefined => {
        if (location.physicalLocation && location.physicalLocation.artifactLocation
            && location.physicalLocation.artifactLocation.uri) {
            let uri: string = location.physicalLocation.artifactLocation.uri;
            let start = -1;
            if (this.defaultWorkingDirectory) {
                let processedDefaultWorkingDirectory = this.defaultWorkingDirectory.replaceAll('\\', '/');
                // To check uri contains the path of working directory
                start = uri.lastIndexOf(processedDefaultWorkingDirectory);
                if (start == -1) {
                    // Encoding and used to check again since uri value may be encoded
                    processedDefaultWorkingDirectory = processedDefaultWorkingDirectory.replaceAll('%', '%25').replaceAll(' ', '%20');
                    start = uri.lastIndexOf(processedDefaultWorkingDirectory);
                }
                if (start != -1) {
                    return uri.substring(start + processedDefaultWorkingDirectory.length);
                }
                return undefined;
            }
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

    processResults = async (inputReportFiles: string[], index: number): Promise<void> =>{
        if (index < inputReportFiles.length - 1) {
            await this.transformReports(inputReportFiles, ++index);
        } else {
            if (this.xUnitReports.length > 0) {
                let tp: tl.TestPublisher = new tl.TestPublisher('JUnit');
                tp.publish(this.xUnitReports, this.mergeResults, this.platform, this.config, this.testRunTitle, this.publishRunAttachments);
            }
            if (this.sarifReports.length > 0) {
                let referenceSarifReports: FileEntry[] = [];
                referenceSarifReports = await this.getReferenceSarifReports();

                for (var i = 0; i < this.sarifReports.length; i++) {
                    let currentSarifReport = this.sarifReports[i];
                    let currentSarifContentString = fs.readFileSync(currentSarifReport, 'utf8');
                    let currentSarifContentJson = JSON.parse(currentSarifContentString);

                    currentSarifContentJson = this.checkAndAddUnbViolIdForSarifReport(currentSarifContentJson);
                    let referenceSarifReport: FileEntry | undefined = referenceSarifReports.find((referenceSarifReport) => referenceSarifReport.name == 'Container/' + path.basename(currentSarifReport));
                    await this.appendBaselineState(currentSarifContentJson, referenceSarifReport);

                    currentSarifContentString = JSON.stringify(currentSarifContentJson);
                    fs.writeFileSync(currentSarifReport, currentSarifContentString, 'utf8');
                    tl.uploadArtifact("Container", this.sarifReports[i], this.SARIF_ARTIFACT_NAME);
                }
                // Pass the reference build and static analysis info to subsequent static analysis quality gate tasks
                tl.setVariable('PF.ReferenceBuildResult', JSON.stringify(this.referenceBuildResult));
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

    private checkAndAddUnbViolIdForSarifReport = (sarifContentJson: any): string => {
        if (sarifContentJson.runs) {
            sarifContentJson.runs.forEach((run: any) => {
                let unbViolIdMap: Map<string, number> = new Map();

                if (run.results) {
                    for (let i = 0; i < run.results.length; i++) {
                        if (run.results[i].partialFingerprints && run.results[i].partialFingerprints.unbViolId) {
                            break;
                        }
                        if (!run.results[i].partialFingerprints) {
                            run.results[i].partialFingerprints = {};
                        }
                        let order: number = 0;
                        let unbViolId = this.generateUnbViolId(run.results[i], order);
                        if (unbViolIdMap.has(unbViolId)) {
                            order = <number> unbViolIdMap.get(unbViolId);
                            run.results[i].partialFingerprints.unbViolId = this.generateUnbViolId(run.results[i], order);
                        } else {
                            run.results[i].partialFingerprints.unbViolId = unbViolId;
                        }
                        unbViolIdMap.set(unbViolId, order + 1);
                    }
                }
            });
        }
        return sarifContentJson;
    }

    private generateUnbViolId = (result: any, order: number): string => {
        const namespace = '6af5b03d-5276-49ef-bfed-d445f2752b02';
        let violType = result.partialFingerprints?.violType || '';
        let ruleId = result.ruleId || '';
        let msg = result.message?.text || '';
        let severity = result.level || '';
        let lineHash = result.partialFingerprints?.lineHash || '';
        let uri = result.locations?.[0]?.physicalLocation?.artifactLocation?.uri || '';

        return uuid.v5(violType + ruleId + msg + severity + lineHash + uri + order, namespace);
    }

    private checkDuplicatedStaticAnalysisReportName = (sourcePath: string): boolean => {
        let filename = path.basename(sourcePath);
        if (this.originalStaticAnalysisReportMap.has(filename)) {
            tl.warning(`Skipping ${sourcePath} since reports with duplicate names are not supported.`);
            return true;
        }
        this.originalStaticAnalysisReportMap.set(filename, sourcePath);
        return false;
    }

    private getReferenceSarifReports = async (): Promise<FileEntry[]> => {
        let referenceBuildInfo: ReferenceBuildInformation = {
            fileEntries: [],
            staticAnalysis: {
                pipelineName: undefined,
                buildId: undefined,
                buildNumber: undefined,
                warningMessage: undefined
            },
            warningMessage: undefined,
            isDebugMessage: false
        };
        if (this.referencePipeline == this.pipelineName && this.referenceBuild == this.buildNumber) {
            referenceBuildInfo.warningMessage = 'Using the current build as the reference';
        } else {
            if (!this.referencePipeline) { // Reference pipeline is not specified
                tl.debug("No reference pipeline has been set; using the current pipeline as reference.");
                referenceBuildInfo = await this.getBuildsForSpecificPipeline(this.definitionId);
                referenceBuildInfo.staticAnalysis.pipelineName = this.pipelineName;
            } else { // Reference pipeline is specified
                // Get the reference pipeline id based on the reference pipeline name specified in the configuration UI
                const specificPipelines: BuildDefinitionReference[] = await this.buildClient.getSpecificPipelines(this.projectName, this.referencePipeline);
                // Check for the specific reference pipeline exists
                if (specificPipelines.length == 1) {
                    const specificReferencePipeline = specificPipelines[0];
                    let specificReferencePipelineId : number = Number(specificReferencePipeline.id);
                    referenceBuildInfo = await this.getBuildsForSpecificPipeline(specificReferencePipelineId);
                    referenceBuildInfo.staticAnalysis.pipelineName = specificReferencePipeline.name;
                } else if (specificPipelines.length > 1) {
                    referenceBuildInfo.warningMessage = `The specified reference pipeline '${this.referencePipeline}' is not unique`;
                } else {
                    referenceBuildInfo.warningMessage = `The specified reference pipeline '${this.referencePipeline}' could not be found`;
                }
            }
        }
        if (referenceBuildInfo.warningMessage) {
            if (referenceBuildInfo.isDebugMessage) {
                tl.debug(`${referenceBuildInfo.warningMessage} - all issues will be treated as new`);
            } else {
                tl.warning(`${referenceBuildInfo.warningMessage} - all issues will be treated as new`);
            }
            referenceBuildInfo.staticAnalysis.warningMessage = referenceBuildInfo.warningMessage + ' - all issues were treated as new';
        }
        this.referenceBuildResult.staticAnalysis = referenceBuildInfo.staticAnalysis;
        return Promise.resolve(referenceBuildInfo.fileEntries);
    }

    private async getBuildsForSpecificPipeline(specificReferencePipelineId: number): Promise<ReferenceBuildInformation> {
        const referenceBuildInfo: ReferenceBuildInformation = {
            fileEntries: [],
            staticAnalysis: {
                pipelineName: undefined,
                buildId: undefined,
                buildNumber: undefined,
                warningMessage: undefined
            },
            warningMessage: undefined,
            isDebugMessage: false
        };
        const allBuildsForSpecificPipeline = await this.buildClient.getBuildsForSpecificPipeline(this.projectName, specificReferencePipelineId);
        if (!this.referenceBuild) { // Reference build is not specified
            tl.debug("No reference build has been set; using the last successful build as reference.");
            let defaultBuildReportResults: DefaultBuildReportResults = await this.buildClient.getDefaultBuildReports(allBuildsForSpecificPipeline, this.projectName, this.SARIF_ARTIFACT_NAME, FileSuffixEnum.SARIF_SUFFIX);
            switch (defaultBuildReportResults.status) {
                case DefaultBuildReportResultsStatus.OK:
                    referenceBuildInfo.fileEntries = defaultBuildReportResults.reports || [];
                    tl.debug(`Set build '${defaultBuildReportResults.buildNumber}' as the default reference build`);
                    referenceBuildInfo.staticAnalysis.buildId = defaultBuildReportResults.buildId;
                    referenceBuildInfo.staticAnalysis.buildNumber = defaultBuildReportResults.buildNumber;
                    return referenceBuildInfo;
                case DefaultBuildReportResultsStatus.NO_PARASOFT_RESULTS_IN_PREVIOUS_SUCCESSFUL_BUILDS:
                    referenceBuildInfo.warningMessage = 'No Parasoft static analysis results were found in any of the previous successful builds';
                    return referenceBuildInfo;
                case DefaultBuildReportResultsStatus.NO_PREVIOUS_BUILD_WAS_FOUND:
                    referenceBuildInfo.warningMessage = 'No previous build was found';
                    referenceBuildInfo.isDebugMessage = true;
                    return referenceBuildInfo;
                case DefaultBuildReportResultsStatus.NO_SUCCESSFUL_BUILD:
                default:
                    referenceBuildInfo.warningMessage = 'No successful build was found';
                    return referenceBuildInfo;
            }
        } else { // Reference build is specified
            const specificReferenceBuilds = allBuildsForSpecificPipeline.filter(build => {
                return build.buildNumber == this.referenceBuild;
            });

            if (specificReferenceBuilds.length > 1) {
                referenceBuildInfo.warningMessage = `The specified reference build '${this.referenceBuild}' is not unique`;
                return referenceBuildInfo;
            }

            if (specificReferenceBuilds.length == 0) {
                referenceBuildInfo.warningMessage = `The specified reference build '${this.referenceBuild}' could not be found`;
                return referenceBuildInfo;
            }

            // When specificReferenceBuilds.length equals 1
            const specificReferenceBuild = specificReferenceBuilds[0];
            // Check for the succeeded or paratially-succeeded results exist in the specific reference build
            if (specificReferenceBuild.result != BuildResult.Succeeded && specificReferenceBuild.result != BuildResult.PartiallySucceeded) {
                referenceBuildInfo.warningMessage = `The specified reference build '${this.referenceBuild}' cannot be used. Only successful or unstable builds are valid references`;
                return referenceBuildInfo;
            }

            let specificReferenceBuildId: number = Number(specificReferenceBuild.id);
            // Check for Parasoft results exist in the specific reference build
            const artifact: BuildArtifact = await this.buildClient.getBuildArtifact(this.projectName, specificReferenceBuildId, this.SARIF_ARTIFACT_NAME);
            if (!artifact) {
                referenceBuildInfo.warningMessage = `No Parasoft static analysis results were found in the specified reference build: '${this.referenceBuild}'`;
                return referenceBuildInfo;
            }

            referenceBuildInfo.fileEntries = await this.buildClient.getBuildReportsWithId(artifact, specificReferenceBuildId, FileSuffixEnum.SARIF_SUFFIX);

            if (referenceBuildInfo.fileEntries.length == 0) {
                referenceBuildInfo.warningMessage = `No Parasoft static analysis results were found in the specified reference build: '${this.referenceBuild}'`;
                return referenceBuildInfo;
            }

            tl.debug(`Retrieved Parasoft static analysis results from the reference build '${this.referenceBuild}'`);
            referenceBuildInfo.staticAnalysis.buildId = specificReferenceBuildId;
            referenceBuildInfo.staticAnalysis.buildNumber = this.referenceBuild;
            return referenceBuildInfo;
        }
    }

    private appendBaselineState = async (currentSarifContentJson: any, referenceSarifReport: FileEntry | undefined): Promise<string> => {
        let referenceUnbViolIds: string[] = await this.getUnbViolIdsFromReferenceSarifReport(referenceSarifReport);
        if (currentSarifContentJson.runs) {
            currentSarifContentJson.runs.forEach((run: any) => {
                if (run.results) {
                    run.results.forEach((result: any) => {
                        let unbViolId: string = result.partialFingerprints?.unbViolId;

                        if (unbViolId && referenceUnbViolIds.includes(unbViolId)) {
                            result.baselineState = BaselineStateEnum.UNCHANGED;
                        } else {
                            result.baselineState = BaselineStateEnum.NEW;
                        }
                    })
                }
            })
        }
        return currentSarifContentJson;
    }

    private getUnbViolIdsFromReferenceSarifReport = async (referenceSarifReport: FileEntry | undefined): Promise<string[]> => {
        let referenceUnbViolIds: string[] = [];
        if (referenceSarifReport) {
            let referenceSarifContentString: string = await referenceSarifReport.contentsPromise;
                let referenceSarifContentJson: any = JSON.parse(referenceSarifContentString);
                if (referenceSarifContentJson.runs) {
                    referenceSarifContentJson.runs.forEach((run: any) => {
                        if (run.results) {
                            run.results.forEach(async (result: any) => {
                                let unbViolId: string = result.partialFingerprints?.unbViolId;
                                if (unbViolId) {
                                    referenceUnbViolIds.push(unbViolId);
                                }
                            })
                        }
                    })
                }
        }
        return referenceUnbViolIds;
    }
}