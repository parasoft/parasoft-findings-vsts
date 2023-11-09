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
import { BuildArtifact, BuildDefinitionReference, BuildResult} from 'azure-devops-node-api/interfaces/BuildInterfaces';
import { BuildAPIClient, DefaultBuildReportResults, DefaultBuildReportResultsStatus, FileEntry, FileSuffixEnum } from './BuildApiClient';
import * as sax from 'sax';
import {QualityGateResult} from "./QualityGateResult";

interface ReferenceBuildResult {
    originalPipelineName: string,
    originalBuildNumber: string
}

interface BuildInformation {
    fileEntry: FileEntry | undefined,
    warningMessage: string | undefined,
    isDebugMessage: boolean
}

export const enum TypeEnum {
    OVERALL = "Overall",
    MODIFIED = "Modified",
}

export const enum BuildStatusEnum {
    FAILED = "Failed",
    UNSTABLE = "Unstable"
}

export enum QualityGateStatusEnum {
    PASSED = "PASSED",
    UNSTABLE = "UNSTABLE",
    FAILED = "FAILED"
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
    readonly defaultWorkingDirectory: string;

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

    private overallCoveredLines = 0;
    private overallCoverabledLines = 0;

    constructor() {
        this.projectName = tl.getVariable('System.TeamProject') || '';
        this.pipelineName = tl.getVariable('Build.DefinitionName') || '';
        this.buildNumber = tl.getVariable('Build.BuildNumber') || '';
        this.buildId = tl.getVariable('Build.BuildId') || '';
        this.definitionId = Number(tl.getVariable('System.DefinitionId'));
        this.displayName = tl.getVariable('Task.DisplayName') || '';
        this.defaultWorkingDirectory = tl.getVariable('System.DefaultWorkingDirectory') || '';

        this.fileSuffix = FileSuffixEnum.COBERTURA_SUFFIX;
        this.buildClient = new BuildAPIClient();

        this.typeString = tl.getInput('type') || '';
        this.thresholdString = tl.getInput('threshold') || '';
        this.buildStatusString = tl.getInput('buildStatus') || '';

        this.threshold = parseFloat(this.thresholdString || '0.0');

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
                tl.warning(`Invalid value for 'type': ${this.typeString}, using default value 'Overall'`);
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
                tl.warning(`Invalid value for 'buildStatus': ${this.buildStatusString}, using default value 'Failed'`);
                this.buildStatus = BuildStatusEnum.FAILED;
        }

        tl.debug("Input type: " + this.typeString);
        tl.debug("Code coverage quality type: " + this.type);

        tl.debug("Input threshold: " + this.thresholdString);
        tl.debug("Code coverage quality threshold: " + this.threshold);

        tl.debug("Input buildStatus: " + this.buildStatusString);
        tl.debug("Code coverage quality buildStatus: " + this.buildStatus);
    }

    run = async (): Promise<void> => {
        try {
            let codeCoverageReferenceBuild = tl.getVariable('PF.ReferenceBuildResult');
            if (!codeCoverageReferenceBuild) {
                tl.setResult(tl.TaskResult.SucceededWithIssues, `Quality gate '${this.getQualityGateIdentification()}' was skipped; please run 'Publish Parasoft Results' task first`);
                return;
            }
            let referenceBuild: ReferenceBuildResult = JSON.parse(<string> codeCoverageReferenceBuild);
            this.originalReferencePipelineName = referenceBuild.originalPipelineName;
            this.originalReferenceBuildNumber = referenceBuild.originalBuildNumber;

            // To get Cobertura report in current build
            const currentBuildInformation: BuildInformation = await this.getCurrentBuildInformation();
            if (currentBuildInformation.warningMessage) {
                if (currentBuildInformation.isDebugMessage) {
                    tl.debug(`${currentBuildInformation.warningMessage}`);
                } else {
                    tl.setResult(tl.TaskResult.SucceededWithIssues, `Quality gate '${this.getQualityGateIdentification()}' was skipped; ${currentBuildInformation.warningMessage}`);
                    return;
                }
            }
            const currentCoberturaReport = currentBuildInformation.fileEntry;

            if (this.type == TypeEnum.OVERALL) {
                let currentCoberturaContentString: string = await (<FileEntry> currentCoberturaReport).contentsPromise;
                this.getOverallCodeCoverage(currentCoberturaContentString);
                const qualityGateResult: QualityGateResult = this.evaluateQualityGate(this.overallCoverabledLines, this.overallCoveredLines);
                // TODO - Display result, will be implemented in separate task.
            } else if (this.type == TypeEnum.MODIFIED) {
                // To get Cobertura report in reference build
                const referenceBuildInformation: BuildInformation = await this.getReferenceBuildInformation();
                if (referenceBuildInformation.warningMessage) {
                    if (referenceBuildInformation.isDebugMessage) {
                        tl.debug(`${referenceBuildInformation.warningMessage}`);
                    } else {
                        tl.setResult(tl.TaskResult.SucceededWithIssues, `Quality gate '${this.getQualityGateIdentification()}' was skipped; ${referenceBuildInformation.warningMessage}`);
                        return;
                    }
                }
                const referenceCoberturaReport = referenceBuildInformation.fileEntry;
                // TODO (CICD-534)Calculate modified code coverage
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
            warningMessage: undefined,
            isDebugMessage: false
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
        currentBuildInfo.fileEntry = fileEntries[0]; // Only get the first report since there is only one cobertura report in Azure Artifact
        return currentBuildInfo;
    }

    private getReferenceBuildInformation = async (): Promise<BuildInformation> => {
        let referenceBuildInfo: BuildInformation = {
            fileEntry: undefined,
            warningMessage: undefined,
            isDebugMessage: false
        };
        if (this.originalReferencePipelineName == this.pipelineName && this.originalReferenceBuildNumber == this.buildNumber) {
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

    private async getBuildsForSpecificPipeline(specificReferencePipelineId: number, pipelineName: string): Promise<BuildInformation> {
        const referenceBuildInfo: BuildInformation = {
            fileEntry: undefined,
            warningMessage: undefined,
            isDebugMessage: false
        };
        const allBuildsForSpecificPipeline = await this.buildClient.getBuildsForSpecificPipeline(this.projectName, specificReferencePipelineId);
        if (!this.originalReferenceBuildNumber) { // Reference build is not specified
            tl.debug(`No reference build has been set; using the last successful build in pipeline '${pipelineName}' as reference.`);
            let defaultBuildReportResults: DefaultBuildReportResults = await this.buildClient.getDefaultBuildReports(allBuildsForSpecificPipeline, this.projectName, this.COBERTURA_ARTIFACT_NAME, this.fileSuffix, this.buildId);
            switch (defaultBuildReportResults.status) {
                case DefaultBuildReportResultsStatus.OK:
                    referenceBuildInfo.fileEntry = defaultBuildReportResults.reports?.at(0);
                    tl.debug(`Set build '${pipelineName}#${defaultBuildReportResults.buildNumber}' as the default reference build`);
                    return referenceBuildInfo;
                case DefaultBuildReportResultsStatus.NO_PARASOFT_RESULTS_IN_PREVIOUS_SUCCESSFUL_BUILDS:
                    referenceBuildInfo.warningMessage = `no Parasoft coverage results were found in any of the previous successful builds in pipeline '${pipelineName}'`;
                    return referenceBuildInfo;
                case DefaultBuildReportResultsStatus.NO_PREVIOUS_BUILD_WAS_FOUND:
                    referenceBuildInfo.warningMessage = `No previous build was found in pipeline '${pipelineName}'`;
                    referenceBuildInfo.isDebugMessage = true;
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
            referenceBuildInfo.fileEntry = fileEntries[0]; // Only get the first report since there is only one cobertura report in Azure Artifact
            return referenceBuildInfo;
        }
    }

    private evaluateQualityGate = (coverableLines: number, coveredLines: number): QualityGateResult => {
        let qualityGateResult: QualityGateResult = new QualityGateResult(
            this.displayName,
            coverableLines, coveredLines,
            this.referencePipelineName || '',
            this.referenceBuildNumber || '',
            this.referenceBuildId || '',
            this.type, this.threshold,
            this.defaultWorkingDirectory);

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
        tl.debug(`Quality Gate ${qualityGateResult.status} - ${this.type} code coverage: ${qualityGateResult.codeCoverage} (${coveredLines}/${coverableLines}) - Threshold: ${this.threshold}%`);
        return qualityGateResult;
    }

    private getOverallCodeCoverage = (coberturaContentString: string): void => {
        const saxParser = sax.parser(true);
        saxParser.onopentag = (node) => {
            if (node.name == 'coverage') {
                this.overallCoveredLines = parseInt(<string>node.attributes['lines-covered']);
                this.overallCoverabledLines = parseInt(<string>node.attributes['lines-valid']);
            }
        }

        saxParser.onend = () => {
            // do nothing
        };

        saxParser.onerror = (e) => {
            tl.warning('Failed to parse cobertura code coverage report content.');
            console.error(e);
        };

        saxParser.write(coberturaContentString).close();
    }


    private getQualityGateIdentification() {
        const referencePipeline: string = this.originalReferencePipelineName ? ", Reference pipeline: " + this.originalReferencePipelineName : "";
        const referenceBuild: string = this.originalReferenceBuildNumber ? ", Reference build: " + this.originalReferenceBuildNumber : "";
        return "Type: " + this.type + ", Threshold: " + this.threshold + referencePipeline + referenceBuild;
    }
}