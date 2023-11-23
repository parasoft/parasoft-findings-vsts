/*
 * Copyright 2023 Parasoft Corporation
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
import * as sax from 'sax';
import * as DiffMatchPatch from "diff-match-patch";
import {Diff} from "diff-match-patch";
import { BuildArtifact, BuildDefinitionReference, BuildResult} from 'azure-devops-node-api/interfaces/BuildInterfaces';
import { BuildAPIClient, DefaultBuildReportResults, DefaultBuildReportResultsStatus, FileEntry, FileSuffixEnum } from './BuildApiClient';
import {QualityGateResult} from "./QualityGateResult";

interface ReferenceBuildResult {
    originalPipelineName: string,
    originalBuildNumber: string
}

interface BuildInformation {
    fileEntry: FileEntry | undefined,
    warningMessage: string | undefined
}

export const enum TypeEnum {
    OVERALL = "Overall",
    MODIFIED = "Modified"
}

export const enum BuildStatusEnum {
    FAILED = "Failed",
    UNSTABLE = "Unstable"
}

interface FileInfo {
    fileId: string,
    codeLines: LineInfo[]
}

interface LineInfo {
    lineNumber: number,
    lineHash: string,
    hits: number
}

export enum QualityGateStatusEnum {
    PASSED = "PASSED",
    UNSTABLE = "UNSTABLE",
    FAILED = "FAILED"
}

interface CoverageInfo {
    coveredLines: number,
    coverableLines: number
}

export class CodeCoverageQualityService {
    readonly COBERTURA_ARTIFACT_NAME: string = "ParasoftCoverageLogs";
    // Predefined variables
    readonly projectName: string;
    readonly pipelineName: string;
    readonly buildNumber: string;
    readonly buildId: string;
    readonly definitionId: number;
    readonly displayName: string;
    readonly customMarkdownSummaryDirectory: string;

    readonly fileSuffix: FileSuffixEnum;
    readonly buildClient: BuildAPIClient;
    readonly typeString: string;
    readonly thresholdString: string;
    readonly buildStatusString: string;

    type: TypeEnum;
    threshold: number;
    buildStatus: BuildStatusEnum;


    originalReferencePipelineName: string | undefined;
    originalReferenceBuildNumber: string | undefined;
    referencePipelineName: string | undefined;
    referenceBuildNumber: string | undefined;
    referenceBuildId: string | undefined;

    dmp: DiffMatchPatch;

    constructor() {
        this.projectName = tl.getVariable('System.TeamProject') || '';
        this.pipelineName = tl.getVariable('Build.DefinitionName') || '';
        this.buildNumber = tl.getVariable('Build.BuildNumber') || '';
        this.buildId = tl.getVariable('Build.BuildId') || '';
        this.definitionId = Number(tl.getVariable('System.DefinitionId'));
        this.displayName = tl.getVariable('Task.DisplayName') || '';
        this.customMarkdownSummaryDirectory = tl.resolve(tl.getVariable('System.DefaultWorkingDirectory'), 'ParasoftQualityGatesMD');

        this.fileSuffix = FileSuffixEnum.COBERTURA_SUFFIX;
        this.buildClient = new BuildAPIClient();

        this.typeString = tl.getInput('type') || '';
        this.thresholdString = tl.getInput('threshold') || '';
        this.buildStatusString = tl.getInput('buildStatus') || '';

        this.threshold = parseFloat(this.thresholdString || '0.0');

        this.dmp = new DiffMatchPatch();

        if (isNaN(this.threshold)) {
            tl.warning(`Invalid threshold value '${this.thresholdString}', using default value 0.0`);
            this.threshold = 0.0;
        } else if (this.threshold > 100) {
            tl.warning(`The threshold value '${this.thresholdString}' is more than 100, the value is set to 100.0`);
            this.threshold = 100.0;
        } else if (this.threshold < 0) {
            tl.warning(`The threshold value '${this.thresholdString}' is less than 0, the value is set to 0.0`);
            this.threshold = 0.0;
        }

        switch (this.typeString.toLowerCase()) {
            case TypeEnum.OVERALL.toLowerCase():
                this.type = TypeEnum.OVERALL;
                break;
            case TypeEnum.MODIFIED.toLowerCase():
                this.type = TypeEnum.MODIFIED;
                break;
            default:
                tl.warning(`Invalid value for 'type': ${this.typeString}, using default value 'overall'`);
                this.type = TypeEnum.OVERALL;
        }

        switch (this.buildStatusString.toLowerCase()) {
            case BuildStatusEnum.FAILED.toLowerCase():
                this.buildStatus = BuildStatusEnum.FAILED;
                break;
            case BuildStatusEnum.UNSTABLE.toLowerCase():
                this.buildStatus = BuildStatusEnum.UNSTABLE;
                break;
            default:
                tl.warning(`Invalid value for 'buildStatus': ${this.buildStatusString}, using default value 'failed'`);
                this.buildStatus = BuildStatusEnum.FAILED;
        }
    }

    run = async (): Promise<void> => {
        try {
            let codeCoverageReferenceBuild = tl.getVariable('PF.ReferenceBuildResult');
            if (!codeCoverageReferenceBuild) {
                tl.setResult(tl.TaskResult.SucceededWithIssues, `Quality gate '${this.getQualityGateIdentification()}' skipped; please run 'Publish Parasoft Results' task first`);
                return;
            }
            let referenceBuild: ReferenceBuildResult = JSON.parse(<string> codeCoverageReferenceBuild);
            this.originalReferencePipelineName = referenceBuild.originalPipelineName;
            this.originalReferenceBuildNumber = referenceBuild.originalBuildNumber;

            // To get Cobertura report in current build
            const currentBuildInformation: BuildInformation = await this.getCurrentBuildInformation();
            if (currentBuildInformation.warningMessage) {
                tl.debug(`${currentBuildInformation.warningMessage}`);
                tl.setResult(tl.TaskResult.SucceededWithIssues, `Quality gate '${this.getQualityGateIdentification()}' skipped; ${currentBuildInformation.warningMessage}`);
                return;
            }
            const currentCoberturaReport = currentBuildInformation.fileEntry;
            let coverageInfo: CoverageInfo;
            if (this.type == TypeEnum.OVERALL) {
                let currentCoberturaContentString: string = await (<FileEntry> currentCoberturaReport).contentsPromise;
                try {
                    coverageInfo = this.getOverallCodeCoverage(currentCoberturaContentString);
                } catch (error: any) {
                    tl.setResult(tl.TaskResult.SucceededWithIssues, `Quality gate '${this.getQualityGateIdentification()}' skipped; ${error.message}`);
                    return;
                }
                const qualityGateResult: QualityGateResult = this.evaluateQualityGate(coverageInfo);
                qualityGateResult.uploadQualityGateSummary();

            } else if (this.type == TypeEnum.MODIFIED) {
                // To get Cobertura report in reference build
                const referenceBuildInformation: BuildInformation = await this.getReferenceBuildInformation();
                if (referenceBuildInformation.warningMessage) {
                    tl.debug(`${referenceBuildInformation.warningMessage}`);
                    tl.setResult(tl.TaskResult.SucceededWithIssues, `Quality gate '${this.getQualityGateIdentification()}' skipped; ${referenceBuildInformation.warningMessage}`);
                    return;
                }
                const referenceCoberturaReport = referenceBuildInformation.fileEntry;

                let referenceCoberturaReportContent = await (<FileEntry> referenceCoberturaReport).contentsPromise;
                let currentCoberturaReportContent = await (<FileEntry> currentCoberturaReport).contentsPromise;
                try {
                    coverageInfo = this.getModifiedCodeCoverage(referenceCoberturaReportContent, currentCoberturaReportContent);
                } catch (error: any) {
                    tl.setResult(tl.TaskResult.SucceededWithIssues, `Quality gate '${this.getQualityGateIdentification()}' skipped; ${error.message}`);
                    return;
                }
                const qualityGateResult: QualityGateResult = this.evaluateQualityGate(coverageInfo);
                qualityGateResult.uploadQualityGateSummary();

            }
        } catch(error) {
            tl.warning(`Failed to process the quality gate '${this.getQualityGateIdentification()}'. See logs for details.`);
            console.error(error);
            return;
        }
    }

    private getCurrentBuildInformation = async (): Promise<BuildInformation> => {
        let currentBuildInfo: BuildInformation = {
            fileEntry: undefined,
            warningMessage: undefined
        };
        const currentBuildArtifact: BuildArtifact = await this.buildClient.getBuildArtifact(this.projectName, Number(this.buildId), this.COBERTURA_ARTIFACT_NAME);
        if (!currentBuildArtifact) {
            currentBuildInfo.warningMessage = "no Parasoft coverage results were found in this build";
            return currentBuildInfo;
        }
        const fileEntries = await this.buildClient.getBuildReportsWithId(currentBuildArtifact, Number(this.buildId), this.fileSuffix);
        if (fileEntries.length == 0) {
            currentBuildInfo.warningMessage = "no Parasoft coverage results were found in this build";
            return currentBuildInfo;
        }
        currentBuildInfo.fileEntry = fileEntries[0]; // Only get the first report since there is only one Cobertura report in Azure Artifact
        return currentBuildInfo;
    }

    private getReferenceBuildInformation = async (): Promise<BuildInformation> => {
        let referenceBuildInfo: BuildInformation = {
            fileEntry: undefined,
            warningMessage: undefined
        };
        if ((!this.originalReferencePipelineName || this.originalReferencePipelineName == this.pipelineName) && this.originalReferenceBuildNumber == this.buildNumber) {
            referenceBuildInfo.warningMessage = "the current build is not allowed to use as the reference";
        } else {
            if (!this.originalReferencePipelineName) { // Reference pipeline is not specified
                tl.debug("No reference pipeline has been set; using the current pipeline as reference.");
                referenceBuildInfo = await this.getBuildsForSpecificPipeline(this.definitionId, this.pipelineName);
            } else { // Reference pipeline is specified
                // Get the reference pipeline id based on the reference pipeline name specified in the configuration UI
                const specificPipelines: BuildDefinitionReference[] = await this.buildClient.getSpecificPipelines(this.projectName, this.originalReferencePipelineName);
                // Check for the specific reference pipeline exists
                if (specificPipelines.length == 1) {
                    const specificReferencePipeline = specificPipelines[0];
                    let specificReferencePipelineId : number = Number(specificReferencePipeline.id);
                    referenceBuildInfo = await this.getBuildsForSpecificPipeline(specificReferencePipelineId, specificReferencePipeline.name || '');
                } else if (specificPipelines.length > 1) {
                    referenceBuildInfo.warningMessage = `the specified reference pipeline '${this.originalReferencePipelineName}' is not unique`;
                } else {
                    referenceBuildInfo.warningMessage = `the specified reference pipeline '${this.originalReferencePipelineName}' could not be found`;
                }
            }
        }
        return referenceBuildInfo;
    }

    private getBuildsForSpecificPipeline = async (specificReferencePipelineId: number, pipelineName: string): Promise<BuildInformation> => {
        const referenceBuildInfo: BuildInformation = {
            fileEntry: undefined,
            warningMessage: undefined
        };
        const allBuildsForSpecificPipeline = await this.buildClient.getBuildsForSpecificPipeline(this.projectName, specificReferencePipelineId);
        if (!this.originalReferenceBuildNumber) { // Reference build is not specified
            tl.debug(`No reference build has been set; using the last successful build in pipeline '${pipelineName}' as reference.`);
            let defaultBuildReportResults: DefaultBuildReportResults = await this.buildClient.getDefaultBuildReports(allBuildsForSpecificPipeline, this.projectName, this.COBERTURA_ARTIFACT_NAME, this.fileSuffix, this.buildId);
            switch (defaultBuildReportResults.status) {
                case DefaultBuildReportResultsStatus.OK:
                    referenceBuildInfo.fileEntry = defaultBuildReportResults.reports?.at(0);
                    this.referencePipelineName = pipelineName;
                    this.referenceBuildId = (<number> defaultBuildReportResults.buildId).toString();
                    this.referenceBuildNumber = <string> defaultBuildReportResults.buildNumber;
                    tl.debug(`Set build '${pipelineName}#${defaultBuildReportResults.buildNumber}' as the default reference build`);
                    return referenceBuildInfo;
                case DefaultBuildReportResultsStatus.NO_PARASOFT_RESULTS_IN_PREVIOUS_SUCCESSFUL_BUILDS:
                    referenceBuildInfo.warningMessage = `no Parasoft coverage results were found in any of the previous successful builds in pipeline '${pipelineName}'`;
                    return referenceBuildInfo;
                case DefaultBuildReportResultsStatus.NO_PREVIOUS_BUILD_WAS_FOUND:
                    referenceBuildInfo.warningMessage = `no previous build was found in pipeline '${pipelineName}'`;
                    return referenceBuildInfo;
                case DefaultBuildReportResultsStatus.NO_SUCCESSFUL_BUILD:
                default:
                    referenceBuildInfo.warningMessage = `no successful build was found in pipeline '${pipelineName}'`;
                    return referenceBuildInfo;
            }
        } else { // Reference build is specified
            const specificReferenceBuilds = allBuildsForSpecificPipeline.filter(build => {
                return build.buildNumber == this.originalReferenceBuildNumber;
            });

            if (specificReferenceBuilds.length > 1) {
                referenceBuildInfo.warningMessage = `the specified reference build '${pipelineName}#${this.originalReferenceBuildNumber}' is not unique`;
                return referenceBuildInfo;
            }

            if (specificReferenceBuilds.length == 0) {
                referenceBuildInfo.warningMessage = `the specified reference build '${pipelineName}#${this.originalReferenceBuildNumber}' could not be found`;
                return referenceBuildInfo;
            }

            // When specificReferenceBuilds.length equals 1
            const specificReferenceBuild = specificReferenceBuilds[0];
            // Check for the succeeded or paratially-succeeded results exist in the specific reference build
            if (specificReferenceBuild.result != BuildResult.Succeeded && specificReferenceBuild.result != BuildResult.PartiallySucceeded) {
                referenceBuildInfo.warningMessage = `the specified reference build '${pipelineName}#${this.originalReferenceBuildNumber}' cannot be used. Only successful or unstable builds are valid references`;
                return referenceBuildInfo;
            }

            let specificReferenceBuildId: number = Number(specificReferenceBuild.id);
            // Check for Parasoft results exist in the specific reference build
            const artifact: BuildArtifact = await this.buildClient.getBuildArtifact(this.projectName, specificReferenceBuildId, this.COBERTURA_ARTIFACT_NAME);
            if (!artifact) {
                referenceBuildInfo.warningMessage = `no Parasoft coverage results were found in the specified reference build: '${pipelineName}#${this.originalReferenceBuildNumber}'`;
                return referenceBuildInfo;
            }

            const fileEntries = await this.buildClient.getBuildReportsWithId(artifact, specificReferenceBuildId, this.fileSuffix);
            if (fileEntries.length == 0) {
                referenceBuildInfo.warningMessage = `no Parasoft coverage results were found in the specified reference build: '${pipelineName}#${this.originalReferenceBuildNumber}'`;
                return referenceBuildInfo;
            }
            tl.debug(`Retrieved Parasoft coverage results from the reference build '${pipelineName}#${this.originalReferenceBuildNumber}'`);
            referenceBuildInfo.fileEntry = fileEntries[0]; // Only get the first report since there is only one Cobertura report in Azure Artifact
            this.referencePipelineName = pipelineName;
            this.referenceBuildId = (<number> specificReferenceBuild.id).toString();
            this.referenceBuildNumber = <string> specificReferenceBuild.buildNumber;
            return referenceBuildInfo;
        }
    }

    private evaluateQualityGate = (coverageInfo: CoverageInfo): QualityGateResult => {
        let qualityGateResult: QualityGateResult = new QualityGateResult(
            this.displayName,
            coverageInfo.coverableLines, coverageInfo.coveredLines,
            this.referencePipelineName || '',
            this.referenceBuildNumber || '',
            this.referenceBuildId || '',
            this.type, this.threshold,
            tl.resolve(this.customMarkdownSummaryDirectory, tl.getVariable('System.TaskInstanceId')));

        tl.debug("Evaluating quality gate");
        if (qualityGateResult.codeCoverage == 'N/A' || parseFloat(qualityGateResult.codeCoverage) >= this.threshold) {
            qualityGateResult.status = QualityGateStatusEnum.PASSED;
            tl.setResult(tl.TaskResult.Succeeded, `Quality gate '${this.getQualityGateIdentification()}' passed`);
        } else {
            switch (this.buildStatus) {
                case BuildStatusEnum.UNSTABLE:
                    qualityGateResult.status = QualityGateStatusEnum.UNSTABLE;
                    tl.setResult(tl.TaskResult.SucceededWithIssues, `Quality gate '${this.getQualityGateIdentification()}' failed: build result is UNSTABLE`);
                    break;
                case BuildStatusEnum.FAILED:
                    qualityGateResult.status = QualityGateStatusEnum.FAILED;
                    tl.setResult(tl.TaskResult.Failed, `Quality gate '${this.getQualityGateIdentification()}' failed: build result is FAILED`);
                    break;
                default:
                    // User will never come here
                    tl.error(`The build status should be unstable or failed instead of ${this.buildStatus}`);
            }
        }
        tl.debug(`Quality Gate ${qualityGateResult.status} - ${this.type} code coverage: ${qualityGateResult.codeCoverage} (${coverageInfo.coveredLines}/${coverageInfo.coverableLines}) - Threshold: ${this.threshold}%`);
        return qualityGateResult;
    }

    private getOverallCodeCoverage = (coberturaContentString: string): CoverageInfo => {
        const saxParser = sax.parser(true);
        let coverageInfo: CoverageInfo = {
            coveredLines:0,
            coverableLines: 0
        }
        saxParser.onopentag = (node) => {
            if (node.name == 'coverage') {
                let coveredLines = <string>node.attributes['lines-covered'];
                let coverableLines = <string>node.attributes['lines-valid'];

                if (!coveredLines || isNaN(parseInt(coveredLines))) {
                    throw new Error("error in Cobertura code coverage report: failed to parse 'lines-covered' attribute.");
                } else if (!coverableLines || isNaN(parseInt(coverableLines))) {
                    throw new Error("error in Cobertura code coverage report: failed to parse 'lines-valid' attribute.");
                } else {
                    coverageInfo.coveredLines = parseInt(coveredLines);
                    coverageInfo.coverableLines = parseInt(coverableLines);
                }
            }
        }

        saxParser.onend = () => {
            // do nothing
        };

        saxParser.onerror = (e) => {
            tl.warning('Failed to parse the content of the Cobertura code coverage report.');
            console.error(e);
        };

        saxParser.write(coberturaContentString).close();
        return coverageInfo;
    }


    private getQualityGateIdentification() {
        let text = "Type: " + this.type + ", Threshold: " + this.threshold;
        if (this.type == TypeEnum.MODIFIED) {
            const referencePipeline: string = this.originalReferencePipelineName ? ", Reference pipeline: " + this.originalReferencePipelineName : "";
            const referenceBuild: string = this.originalReferenceBuildNumber ? ", Reference build: " + this.originalReferenceBuildNumber : "";
            text += referencePipeline + referenceBuild;
        }
        return text;
    }

    private getCoverageDataFromReport = (reportContent: string): FileInfo[] => {
        const saxParser = sax.parser(true);
        let fileInfos: FileInfo[] = [];
        let currentFileInfo : FileInfo = {
            fileId: '',
            codeLines: []
        }

        saxParser.onopentag = (node) => {
            if (node.name == 'class') {
                const filename = <string>node.attributes.filename;
                const name = <string>node.attributes.name;
                if (!filename) {
                    throw new Error("error in Cobertura code coverage report: failed to parse 'filename' attribute.");
                } else if (!name) {
                    throw new Error("error in Cobertura code coverage report: failed to parse 'name' attribute.");
                } else {
                    currentFileInfo = {
                        fileId: filename + ':' + name,
                        codeLines: []
                    }
                }
            }
            if (node.name == 'line') {
                let lineNumber = <string>node.attributes.number;
                let lineHash = <string>node.attributes.hash;
                let hits = <string>node.attributes.hits;
                if (!lineNumber || isNaN(parseInt(lineNumber))) {
                    throw new Error("error in Cobertura code coverage report: failed to parse 'number' attribute.");
                } else if (!lineHash) {
                    throw new Error("error in Cobertura code coverage report: failed to parse 'hash' attribute.");
                } else if (!hits || isNaN(parseInt(hits))) {
                    throw new Error("error in Cobertura code coverage report: failed to parse 'hits' attribute.");
                } else {
                    let line: LineInfo = {
                        lineNumber: parseInt(lineNumber),
                        lineHash: lineHash,
                        hits: parseInt(hits)
                    }
                    currentFileInfo.codeLines.push(line);
                }
            }
        };

        saxParser.onerror = (e) => {
            tl.warning('Failed to parse the content of the Cobertura code coverage report.');
            console.error(e);
        };

        saxParser.onclosetag = (nodeName) => {
            if (nodeName == 'class') {
                fileInfos.push(currentFileInfo);
                currentFileInfo = {
                    fileId: '',
                    codeLines: []
                };
            }
        };

        saxParser.onend = () => {
            // do nothing
        };

        saxParser.write(reportContent).close();
        return fileInfos;
    }

    private getModifiedCodeCoverage = (referenceBuildCoverageReport: string, currentBuildCoverageReport: string): CoverageInfo => {
        const currentBuildFileInfos: FileInfo[] = this.getCoverageDataFromReport(currentBuildCoverageReport);
        const referenceBuildFileInfos: FileInfo[] = this.getCoverageDataFromReport(referenceBuildCoverageReport);
        let coverageInfo: CoverageInfo = {
            coveredLines: 0,
            coverableLines: 0
        }

        currentBuildFileInfos.forEach((currentBuildFileInfo) => {
            let referenceBuildFileInfo = referenceBuildFileInfos.find(codeFle => codeFle.fileId === currentBuildFileInfo.fileId);
            if (referenceBuildFileInfo) {
                let referenceBuildFileText = this.getCodeFileContent(referenceBuildFileInfo.codeLines);
                let currentBuildFileText = this.getCodeFileContent(currentBuildFileInfo.codeLines);
                let diffs = this.getDiffLines(referenceBuildFileText, currentBuildFileText);

                let lineCursor = 0;
                diffs.forEach((diff) => {
                    let [modified, text] = diff;

                    if (modified == 0) {  // Unchanged code line
                        let lines = text.split('\n');
                        lines.pop(); // Remove the last empty string
                        lineCursor += lines.length;
                    }
                    if (modified == 1) {// modified code line
                        let modifiedLines = text.split('\n');
                        modifiedLines.pop(); // Remove the last empty string
                        modifiedLines.forEach((modifiedLine) => {
                            lineCursor += 1;
                            coverageInfo.coverableLines += 1;
                            let modifiedLineData = currentBuildFileInfo.codeLines[lineCursor - 1];
                            if (modifiedLineData.hits > 0){
                                coverageInfo.coveredLines += 1;
                            }
                        });
                    }
                });
            } else {
                currentBuildFileInfo.codeLines.forEach((codeLine) => {
                    coverageInfo.coverableLines += 1;
                    if (codeLine.hits > 0) {
                        coverageInfo.coveredLines += 1;
                    }
                });
            }
        });
        return coverageInfo;
    }

    private getCodeFileContent = (lines: LineInfo[]): string => {
        let fileContent: string = '';
        for (let i = 0; i < lines.length; i++) {
            fileContent += lines[i].lineHash + '\n';
        }
        return fileContent;
    }

    private getDiffLines = (referenceFile: string, currentFile: string): Diff[] => {
        let chars = this.dmp.diff_linesToChars_(referenceFile, currentFile);
        let referenceChars = chars.chars1;
        let currentChars = chars.chars2;
        let lineArray = chars.lineArray;
        let diffs = this.dmp.diff_main(referenceChars, currentChars, false);
        this.dmp.diff_charsToLines_(diffs, lineArray);

        return diffs;
    }
}