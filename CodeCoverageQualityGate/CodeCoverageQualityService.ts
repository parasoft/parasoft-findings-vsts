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
import { Diff } from "diff-match-patch";
import { BuildArtifact, BuildResult } from 'azure-devops-node-api/interfaces/BuildInterfaces';
import { BuildAPIClient, FileEntry } from './BuildApiClient';
import { QualityGateStatusEnum, QualityGateResult } from "./QualityGateResult";

export const enum TypeEnum {
    OVERALL = "Overall",
    MODIFIED = "Modified"
}

export const enum BuildStatusEnum {
    FAILED = "failed",
    UNSTABLE = "unstable"
}

export interface ReferenceBuildInfo {
    pipelineName?: string,
    buildNumber?: string,
    buildId?: string
}

export interface CoverageInfo {
    coveredLines: number,
    coverableLines: number
}

const enum PipelineTypeEnum {
    BUILD = 'build',
    RELEASE = 'release'
}

interface CoverageFileInfo {
    fileId: string,
    codeLines: LineInfo[]
}

interface LineInfo {
    lineNumber: number,
    lineHash: string,
    hits: number
}

interface ReferenceBuildInputs {
    pipelineName?: string,
    buildNumber?: string
}

export class CodeCoverageQualityService {
    private readonly MERGED_COBERTURA_REPORT_NAME: string = 'parasoft-merged-cobertura.xml';
    // Predefined variables
    private readonly pipelineName: string;
    private readonly buildNumber: string;
    private readonly buildId: string;
    private readonly definitionId: number;
    private readonly displayName: string;
    private readonly pipelineType: PipelineTypeEnum = PipelineTypeEnum.BUILD;

    readonly type: TypeEnum;
    readonly threshold: number;
    readonly buildStatus: BuildStatusEnum;

    readonly buildClient: BuildAPIClient;

    referenceInputs: ReferenceBuildInputs = {};
    private referenceBuildInfo: ReferenceBuildInfo = {};

    private dmp: DiffMatchPatch;

    constructor() {
        this.pipelineName = tl.getVariable('Build.DefinitionName') || '';
        this.buildNumber = tl.getVariable('Build.BuildNumber') || '';
        this.buildId = tl.getVariable('Build.BuildId') || '';
        this.definitionId = Number(tl.getVariable('System.DefinitionId'));
        this.displayName = tl.getVariable('Task.DisplayName') || '';
        this.threshold = this.getThreshold(tl.getInput('threshold') || '');
        this.type = this.getType(tl.getInput('type') || '');
        this.buildStatus = this.getBuildStatus(tl.getInput('buildStatus') || '');

        this.buildClient = new BuildAPIClient();
        this.dmp = new DiffMatchPatch();

        if(tl.getVariable('Release.ReleaseId')) {
            this.pipelineType = PipelineTypeEnum.RELEASE;
        }
    }


    run = async (): Promise<void> => {
        try {
            if (this.pipelineType == PipelineTypeEnum.RELEASE) {
                tl.warning("Code coverage quality gates are not supported in the release pipeline");
                return;
            }
            // Get reference build result from 'Publish Parasoft Results' task execution
            if (!this.readReferenceBuildInfo()) {
                return;
            }
            // Get Merged Cobertura report in current build
            const currentCoberturaReport = await this.getMergedCoberturaReportOfCurrentBuild();
            if (!currentCoberturaReport) {
                this.skipQualityGateWithWarning(`no merged Parasoft coverage report is found in this build`);
            } else {
                // Get coverage data from Cobertura report
                const coverageInfo = await this.getCoverageInfo(currentCoberturaReport);
                if (!coverageInfo) {
                    return;
                }
                const qualityGateResult = this.evaluateQualityGate(coverageInfo);
                qualityGateResult.uploadQualityGateSummary();
            }
        } catch(error) {
            tl.warning(`Failed to process the quality gate '${this.generateQualityGateString()}'. See logs for details.`);
            console.error(error);
            return;
        }
    };

    private readReferenceBuildInfo = (): boolean => {
        const referenceBuildResult = tl.getVariable('PF.ReferenceBuildResult');
        if (!referenceBuildResult) {
            this.skipQualityGateWithWarning(`please run 'Publish Parasoft Results' task first`);
            return false;
        }
        const referenceBuild = JSON.parse(<string> referenceBuildResult);
        this.referenceInputs = {
            pipelineName: referenceBuild.referencePipelineInput,
            buildNumber: referenceBuild.referenceBuildInput
        };
        return true;
    };

    private getCoverageInfo = async (currentCoberturaReport: FileEntry): Promise<CoverageInfo | undefined> => {
        let coverageInfo : CoverageInfo | undefined;
        try {
            const currentCoberturaReportContent = await currentCoberturaReport.contentsPromise;
            if (this.type == TypeEnum.OVERALL) {
                coverageInfo = this.getOverallCodeCoverage(currentCoberturaReportContent);
            } else if (this.type == TypeEnum.MODIFIED) {
                const referenceCoberturaReport = await this.getMergedCoberturaReportOfReferenceBuild();
                if (!referenceCoberturaReport) return;
                const referenceCoberturaReportContent = await referenceCoberturaReport.contentsPromise;
                coverageInfo = this.getModifiedCodeCoverage(referenceCoberturaReportContent, currentCoberturaReportContent);
            }
        } catch (error){
            if (error instanceof Error) {
                this.skipQualityGateWithWarning(`${error.message}`);
            } else {
                // Will not reach here
                this.skipQualityGateWithWarning(`Failed to get coverage data: ${error} `);
            }

        }
        return coverageInfo;
    };

    private getMergedCoberturaReportOfCurrentBuild = async (): Promise<FileEntry | undefined> => {
        const currentBuildArtifact = await this.buildClient.getCoberturaArtifactOfBuildById(Number(this.buildId));
        if (!currentBuildArtifact) {
            return;
        }
        const coberturaReports = (await this.buildClient.getMergedCoberturaReportsOfArtifact(currentBuildArtifact)).filter((file) => file.name.includes(this.MERGED_COBERTURA_REPORT_NAME));
        if (coberturaReports.length == 0) {
            return;
        }
        // Using first report When multiple merged Cobertura reports or only one merged Cobertura report exist
        return coberturaReports[0];
    };

    private getMergedCoberturaReportOfReferenceBuild = async (): Promise<FileEntry | undefined> => {
        if ((!this.referenceInputs.pipelineName || this.referenceInputs.pipelineName == this.pipelineName) && this.referenceInputs.buildNumber == this.buildNumber) { // Reference build is the current build
            this.skipQualityGateWithWarning("the current build is not allowed to be used as the reference");
            return;
        }
        if (!this.referenceInputs.pipelineName) { // Reference pipeline is not specified
            tl.debug("No reference pipeline has been set; using the current pipeline as reference.");
            return this.getMergedCoberturaReportOfPipeline(this.definitionId, this.pipelineName);
        }
        // Reference pipeline is specified; Get the reference pipeline id based on the reference pipeline name specified in the configuration UI
        const pipelines = await this.buildClient.getPipelinesByName(this.referenceInputs.pipelineName);
        if (pipelines.length == 1) {
            return this.getMergedCoberturaReportOfPipeline(Number(pipelines[0].id), pipelines[0].name || '');
        } else if (pipelines.length > 1) {
            this.skipQualityGateWithWarning(`the specified reference pipeline '${this.referenceInputs.pipelineName}' is not unique`);
            return;
        } else {
            this.skipQualityGateWithWarning(`the specified reference pipeline '${this.referenceInputs.pipelineName}' could not be found`);
            return;
        }
    };

    private getMergedCoberturaReportOfPipeline = async (pipelineId: number, pipelineName: string): Promise<FileEntry | undefined> => {
        const buildsOfPipeline = await this.buildClient.getBuildsOfPipelineById(pipelineId);
        if (!this.referenceInputs.buildNumber) { // Reference build is not specified
            tl.debug(`No reference build has been set; using the last successful build in pipeline '${pipelineName}' as reference.`);
            if (buildsOfPipeline.length == 1 && buildsOfPipeline[0].id?.toString() == this.buildId) { // only include current build
                this.skipQualityGateWithWarning(`no previous build was found in pipeline '${pipelineName}'`);
		        return;
            } else {
                const allSuccessfulBuilds = buildsOfPipeline.filter(build => {
                    return build.result == BuildResult.Succeeded;
                });
                if (allSuccessfulBuilds.length > 0) {
                    let coberturaReports: FileEntry[] = [];
                    let buildId: number | undefined, buildNumber: string | undefined;
                    // Use the last successful build with Parasoft Cobertura results as the default reference build
                    for (let index = 0; index < allSuccessfulBuilds.length; index++) {
                        const lastSuccessfulBuildId: number = Number(allSuccessfulBuilds[index].id);
                        const artifact: BuildArtifact = await this.buildClient.getCoberturaArtifactOfBuildById(lastSuccessfulBuildId);
                        if (artifact) {
                            coberturaReports = await this.buildClient.getMergedCoberturaReportsOfArtifact(artifact);
                            buildId = lastSuccessfulBuildId;
                            buildNumber = allSuccessfulBuilds[index].buildNumber;
                            break;
                        }
                    }
                    if (coberturaReports.length == 0) {
                        this.skipQualityGateWithWarning(`no Merged Parasoft coverage report is found in any of the previous successful builds in pipeline '${pipelineName}'`);
		                return;
                    }
                    this.referenceBuildInfo = {
                        pipelineName: pipelineName,
                        buildNumber: (<number> buildId).toString(),
                        buildId: <string> buildNumber
                    };
                    tl.debug(`Set build '${pipelineName}#${buildNumber}' as the default reference build`);
                    return coberturaReports?.at(0);
                } else {
                    this.skipQualityGateWithWarning(`no successful build was found in pipeline '${pipelineName}'`);
		            return;
                }
            }
        } else { // Reference build is specified
            const referenceBuilds = buildsOfPipeline.filter(build => {
                return build.buildNumber == this.referenceInputs.buildNumber;
            });
            // Check for uniqueness of the reference build
            if (referenceBuilds.length > 1) {
                this.skipQualityGateWithWarning(`the specified reference build '${pipelineName}#${this.referenceInputs.buildNumber}' is not unique`);
                return;
            }
            // Check for the existence of the reference build
            if (referenceBuilds.length == 0) {
                this.skipQualityGateWithWarning(`the specified reference build '${pipelineName}#${this.referenceInputs.buildNumber}' could not be found`);
                return;
            }
            const referenceBuild = referenceBuilds[0];
            // Check for the succeeded or paratially-succeeded results exist in the reference build
            if (referenceBuild.result != BuildResult.Succeeded && referenceBuild.result != BuildResult.PartiallySucceeded) {
                this.skipQualityGateWithWarning(`the specified reference build '${pipelineName}#${this.referenceInputs.buildNumber}' could not be used. Only successful or unstable builds are valid references`);
                return;
            }
            // Check for the existence of Parasoft Cobertura artifact in reference build
            const artifact: BuildArtifact = await this.buildClient.getCoberturaArtifactOfBuildById(Number(referenceBuild.id));
            if (!artifact) {
                this.skipQualityGateWithWarning(`no merged Parasoft coverage results is found in the specified reference build: '${pipelineName}#${this.referenceInputs.buildNumber}'`);
                return;
            }
            // Check for the existence of Parasoft Cobertura report in reference build
            const coberturaReports = await this.buildClient.getMergedCoberturaReportsOfArtifact(artifact);
            if (coberturaReports.length == 0) {
                this.skipQualityGateWithWarning(`no merged Parasoft coverage results is found in the specified reference build: '${pipelineName}#${this.referenceInputs.buildNumber}'`);
                return;
            }
            // Set the reference build
            tl.debug(`Retrieved Parasoft coverage results from the reference build '${pipelineName}#${this.referenceInputs.buildNumber}'`);
            this.referenceBuildInfo = {
                pipelineName: pipelineName,
                buildNumber: (<number> referenceBuild.id).toString(),
                buildId: <string> referenceBuild.buildNumber
            };
            // Using first report When multiple merged Cobertura reports or only one merged Cobertura report exist
            return coberturaReports[0];
        }
    };

    private evaluateQualityGate = (coverageInfo: CoverageInfo): QualityGateResult => {
        const qualityGateResult = new QualityGateResult(
            this.displayName,
            coverageInfo,
            this.referenceBuildInfo,
            this.type,
            this.threshold
        );
        tl.debug("Evaluating quality gate");
        if (qualityGateResult.codeCoverage == 'N/A' || parseFloat(qualityGateResult.codeCoverage) >= this.threshold) {
            qualityGateResult.status = QualityGateStatusEnum.PASSED;
            tl.setResult(tl.TaskResult.Succeeded, `Quality gate '${this.generateQualityGateString()}' passed`);
        } else {
            switch (this.buildStatus) {
                case BuildStatusEnum.UNSTABLE:
                    qualityGateResult.status = QualityGateStatusEnum.UNSTABLE;
                    tl.setResult(tl.TaskResult.SucceededWithIssues, `Quality gate '${this.generateQualityGateString()}' failed: build result is UNSTABLE`);
                    break;
                case BuildStatusEnum.FAILED:
                    qualityGateResult.status = QualityGateStatusEnum.FAILED;
                    tl.setResult(tl.TaskResult.Failed, `Quality gate '${this.generateQualityGateString()}' failed: build result is FAILED`);
                    break;
                default:
                    // User should never come here
                    tl.error(`The build status should be unstable or failed instead of ${this.buildStatus}`);
            }
        }
        tl.debug(`Quality Gate ${qualityGateResult.status} - ${this.type} code coverage: ${qualityGateResult.codeCoverage} (${coverageInfo.coveredLines}/${coverageInfo.coverableLines}) - Threshold: ${this.threshold}%`);
        return qualityGateResult;
    };

    private generateQualityGateString() {
        let text = "Type: " + this.type + ", Threshold: " + this.threshold;
        if (this.type == TypeEnum.MODIFIED) {
            const referencePipeline = this.referenceInputs.pipelineName ? ", Reference pipeline: " + this.referenceInputs.pipelineName : "";
            const referenceBuild = this.referenceInputs.buildNumber ? ", Reference build: " + this.referenceInputs.buildNumber : "";
            text += referencePipeline + referenceBuild;
        }
        return text;
    }

    private getOverallCodeCoverage = (coberturaContentString: string): CoverageInfo => {
        const saxParser = sax.parser(true);
        const coverageInfo: CoverageInfo = {
            coveredLines: 0,
            coverableLines: 0
        };
        saxParser.onopentag = (node) => {
            if (node.name == 'coverage') {
                const coveredLines = <string>node.attributes['lines-covered'];
                const coverableLines = <string>node.attributes['lines-valid'];

                if (!coveredLines || isNaN(parseInt(coveredLines))) {
                    throw new Error("error in Cobertura code coverage report: failed to parse 'lines-covered' attribute.");
                } else if (!coverableLines || isNaN(parseInt(coverableLines))) {
                    throw new Error("error in Cobertura code coverage report: failed to parse 'lines-valid' attribute.");
                } else {
                    coverageInfo.coveredLines = parseInt(coveredLines);
                    coverageInfo.coverableLines = parseInt(coverableLines);
                }
            }
        };

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

    private getModifiedCodeCoverage = (referenceBuildCoverageReport: string, currentBuildCoverageReport: string): CoverageInfo => {
        const currentBuildFilesInfo = this.getCoverageFileInfo(currentBuildCoverageReport);
        const referenceBuildFilesInfo = this.getCoverageFileInfo(referenceBuildCoverageReport);
        const coverageInfo: CoverageInfo = {
            coveredLines: 0,
            coverableLines: 0
        }
        currentBuildFilesInfo.forEach((currentBuildFileInfo) => {
            const referenceBuildFileInfo = referenceBuildFilesInfo.find(codeFle => codeFle.fileId === currentBuildFileInfo.fileId);
            if (referenceBuildFileInfo) {
                const referenceBuildFileText = this.getCodeFileContent(referenceBuildFileInfo.codeLines);
                const currentBuildFileText = this.getCodeFileContent(currentBuildFileInfo.codeLines);
                const diffs = this.getDiffLines(referenceBuildFileText, currentBuildFileText);

                let lineCursor = 0;
                diffs.forEach((diff) => {
                    const [modified, text] = diff;

                    if (modified == 0) {  // Unchanged code line
                        const lines = text.split('\n');
                        lineCursor += lines.length - 1;
                    } else if (modified == 1) {// modified code line
                        const modifiedLines = text.split('\n').slice(0, -1);
                        modifiedLines.forEach(() => {
                            const modifiedLineData = currentBuildFileInfo.codeLines[lineCursor];
                            if (modifiedLineData && modifiedLineData.hits > 0) {
                                coverageInfo.coveredLines++;
                            }
                            coverageInfo.coverableLines++;
                            lineCursor++;
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

    private getCoverageFileInfo = (reportContent: string): CoverageFileInfo[] => {
        const saxParser = sax.parser(true);
        const filesInfo: CoverageFileInfo[] = [];
        let currentFileInfo : CoverageFileInfo = {
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
                const lineNumber = <string>node.attributes.number;
                const lineHash = <string>node.attributes.hash;
                const hits = <string>node.attributes.hits;
                if (!lineNumber || isNaN(parseInt(lineNumber))) {
                    throw new Error("error in Cobertura code coverage report: failed to parse 'number' attribute.");
                } else if (!lineHash) {
                    throw new Error("error in Cobertura code coverage report: failed to parse 'hash' attribute.");
                } else if (!hits || isNaN(parseInt(hits))) {
                    throw new Error("error in Cobertura code coverage report: failed to parse 'hits' attribute.");
                } else {
                    const line: LineInfo = {
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
                filesInfo.push(currentFileInfo);
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
        return filesInfo;
    }

    private getCodeFileContent = (lines: LineInfo[]): string => {
        let fileContent = '';
        for (let i = 0; i < lines.length; i++) {
            fileContent += lines[i].lineHash + '\n';
        }
        return fileContent;
    }

    private getDiffLines = (referenceFile: string, currentFile: string): Diff[] => {
        const chars = this.dmp.diff_linesToChars_(referenceFile, currentFile);
        const referenceChars = chars.chars1;
        const currentChars = chars.chars2;
        const lineArray = chars.lineArray;
        const diffs = this.dmp.diff_main(referenceChars, currentChars, false);
        this.dmp.diff_charsToLines_(diffs, lineArray);

        return diffs;
    }

    private getBuildStatus(buildStatusString: string): BuildStatusEnum {
        switch (buildStatusString.toLowerCase()) {
            case BuildStatusEnum.FAILED:
                return BuildStatusEnum.FAILED;
            case BuildStatusEnum.UNSTABLE:
                return BuildStatusEnum.UNSTABLE;
            default:
                tl.warning(`Invalid value for 'buildStatus': ${buildStatusString}, using default value 'failed'`);
                return BuildStatusEnum.FAILED;
        }
    }

    private getType(typeString: string): TypeEnum {
        switch (typeString.toLowerCase()) {
            case TypeEnum.OVERALL.toLowerCase():
                return TypeEnum.OVERALL;
            case TypeEnum.MODIFIED.toLowerCase():
                return TypeEnum.MODIFIED;
            default:
                tl.warning(`Invalid value for 'type': ${typeString}, using default value 'overall'`);
                return TypeEnum.OVERALL;
        }
    }

    private getThreshold(thresholdString: string): number {
        const threshold = parseFloat(thresholdString || '0.0');
        if (isNaN(threshold)) {
            tl.warning(`Invalid value for 'threshold': '${thresholdString}', using default value 0.0`);
            return 0.0;
        }
        if (threshold > 100) {
            tl.warning(`The threshold value '${thresholdString}' is more than 100, the value is set to 100.0`);
            return 100.0;
        }
        if (threshold < 0) {
            tl.warning(`The threshold value '${thresholdString}' is less than 0, the value is set to 0.0`);
            return 0.0;
        }
        return threshold;
    }

    private skipQualityGateWithWarning = (message: string): void => {
        tl.setResult(tl.TaskResult.SucceededWithIssues, `Quality gate '${this.generateQualityGateString()}' skipped; ${message}`);
    }
}