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

interface ReferenceBuildResult {
    originalPipelineName: string,
    originalBuildNumber: string,
}

interface ReferenceBuildInformation {
    fileEntries: FileEntry[],
    codeCoverage: {
        pipelineName: string | undefined,
        buildId: number | undefined,
        buildNumber:  string | undefined,
        warningMessage: string | undefined
    },
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

export class CodeCoverageQualityService {
    readonly COBERTURA_ARTIFACT_NAME: string = "ParasoftCoverageLogs";
    // Predefined variables
    readonly projectName: string;
    readonly pipelineName: string;
    readonly buildNumber: string;
    readonly buildId: string;
    readonly definitionId: number;

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
    referenceBuildWarningMessage: string | undefined;

    constructor() {
        this.projectName = tl.getVariable('System.TeamProject') || '';
        this.pipelineName = tl.getVariable('Build.DefinitionName') || '';
        this.buildNumber = tl.getVariable('Build.BuildNumber') || '';
        this.buildId = tl.getVariable('Build.BuildId') || '';
        this.definitionId = Number(tl.getVariable('System.DefinitionId'));

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
            // To get Cobertura report in current build
            // Check for coverage results exist in current build
            const currentBuildArtifact: BuildArtifact = await this.buildClient.getBuildArtifact(this.projectName, Number(this.buildId), this.COBERTURA_ARTIFACT_NAME);
            if (!currentBuildArtifact) {
                tl.warning(`Quality gate '${this.getQualityGateIdentification()}' was skipped; no Parasoft cobertura results were found in this build`);
                return;
            }
            const fileEntries = await this.buildClient.getBuildReportsWithId(currentBuildArtifact, Number(this.buildId), this.fileSuffix);
            if (fileEntries.length == 0) { // When current cobertura report does not exist
                tl.warning(`Quality gate '${this.getQualityGateIdentification()}' was skipped; no Parasoft cobertura results were found in this build`);
                return;
            }
            const currentCoberturaReport: FileEntry = fileEntries[0];

            // To get Cobertura report in reference build
            let codeCoverageReferenceBuild = tl.getVariable('PF.ReferenceBuildResult');
            if (!codeCoverageReferenceBuild) {
                tl.warning(`Quality gate '${this.getQualityGateIdentification()}' was skipped: please run 'Publish Parasoft Results' task first`);
                return;
            }
            let referenceBuild: ReferenceBuildResult = JSON.parse(<string> codeCoverageReferenceBuild);
            this.originalReferencePipelineName = referenceBuild.originalPipelineName;
            this.originalReferenceBuildNumber = referenceBuild.originalBuildNumber;

            const referenceCoberturaReport: FileEntry = await this.getReferenceCoberturaReport();

            // TODO (CICD-532)Calculate modified code coverage
            // TODO The following four lines can be removed in CICD-532, just used to verify whether to get the cobertura report
            let currentCoberturaContentString: string = await currentCoberturaReport.contentsPromise;
            console.log("currentCoberturaContentString::: " + currentCoberturaContentString);
            let referenceCoberturaContentString: string = await referenceCoberturaReport.contentsPromise;
            console.log("referenceCoberturaContentString::: " + referenceCoberturaContentString);
        } catch(error) {
            tl.warning(`Failed to process the quality gate '${this.getQualityGateIdentification()}'. See logs for details.`);
            console.error(error);
            return;
        }
            
        tl.debug('originalReferencePipelineName: ' + this.originalReferencePipelineName);
        tl.debug('originalReferenceBuildNumber: ' + this.originalReferenceBuildNumber);
    }

    private getReferenceCoberturaReport = async (): Promise<FileEntry> => {
        let referenceBuildInfo: ReferenceBuildInformation = {
            fileEntries: [],
            codeCoverage: {
                pipelineName: undefined,
                buildId: undefined,
                buildNumber: undefined,
                warningMessage: undefined
            },
            isDebugMessage: false
        };
        if (this.originalReferencePipelineName == this.pipelineName && this.originalReferenceBuildNumber == this.buildNumber) {
            tl.warning('Using the current build as the reference');
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
                    referenceBuildInfo.codeCoverage.warningMessage = `The specified reference pipeline '${this.originalReferencePipelineName}' is not unique`;
                } else {
                    referenceBuildInfo.codeCoverage.warningMessage = `The specified reference pipeline '${this.originalReferencePipelineName}' could not be found`;
                }
            }
        }
        if (referenceBuildInfo.codeCoverage.warningMessage) {
            if (referenceBuildInfo.isDebugMessage) {
                tl.debug(`${referenceBuildInfo.codeCoverage.warningMessage} - type of code coverage calculation will use default value Overall`);
            } else {
                tl.warning(`${referenceBuildInfo.codeCoverage.warningMessage} - type of code coverage calculation will use default value Overall`);
            }
            referenceBuildInfo.codeCoverage.warningMessage = referenceBuildInfo.codeCoverage.warningMessage + ' - type of code coverage calculation used default value Overall';
        }
        return Promise.resolve(referenceBuildInfo.fileEntries[0]);
    }

    private async getBuildsForSpecificPipeline(specificReferencePipelineId: number, pipelineName: string): Promise<ReferenceBuildInformation> {
        const referenceBuildInfo: ReferenceBuildInformation = {
            fileEntries: [],
            codeCoverage: {
                pipelineName: pipelineName,
                buildId: undefined,
                buildNumber: undefined,
                warningMessage: undefined
            },
            isDebugMessage: false
        };
        const allBuildsForSpecificPipeline = await this.buildClient.getBuildsForSpecificPipeline(this.projectName, specificReferencePipelineId);
        if (!this.originalReferenceBuildNumber) { // Reference build is not specified
            tl.debug(`No reference build has been set; using the last successful build in pipeline '${pipelineName}' as reference.`);
            let defaultBuildReportResults: DefaultBuildReportResults = await this.buildClient.getDefaultBuildReports(allBuildsForSpecificPipeline, this.projectName, this.COBERTURA_ARTIFACT_NAME, FileSuffixEnum.COBERTURA_SUFFIX, this.buildId);
            switch (defaultBuildReportResults.status) {
                case DefaultBuildReportResultsStatus.OK:
                    referenceBuildInfo.fileEntries = defaultBuildReportResults.reports || [];
                    tl.debug(`Set build '${pipelineName}#${defaultBuildReportResults.buildNumber}' as the default reference build`);
                    referenceBuildInfo.codeCoverage.buildId = defaultBuildReportResults.buildId;
                    referenceBuildInfo.codeCoverage.buildNumber = defaultBuildReportResults.buildNumber;
                    return referenceBuildInfo;
                case DefaultBuildReportResultsStatus.NO_PARASOFT_RESULTS_IN_PREVIOUS_SUCCESSFUL_BUILDS:
                    referenceBuildInfo.codeCoverage.warningMessage = `No Parasoft coverage results were found in any of the previous successful builds in pipeline '${pipelineName}'`;
                    return referenceBuildInfo;
                case DefaultBuildReportResultsStatus.NO_PREVIOUS_BUILD_WAS_FOUND:
                    referenceBuildInfo.codeCoverage.warningMessage = `No previous build was found in pipeline '${pipelineName}'`;
                    referenceBuildInfo.isDebugMessage = true;
                    return referenceBuildInfo;
                case DefaultBuildReportResultsStatus.NO_SUCCESSFUL_BUILD:
                default:
                    referenceBuildInfo.codeCoverage.warningMessage = `No successful build was found in pipeline '${pipelineName}'`;
                    return referenceBuildInfo;
            }
        } else { // Reference build is specified
            const specificReferenceBuilds = allBuildsForSpecificPipeline.filter(build => {
                return build.buildNumber == this.originalReferenceBuildNumber;
            });

            if (specificReferenceBuilds.length > 1) {
                referenceBuildInfo.codeCoverage.warningMessage = `The specified reference build '${pipelineName}#${this.originalReferenceBuildNumber}' is not unique`;
                return referenceBuildInfo;
            }

            if (specificReferenceBuilds.length == 0) {
                referenceBuildInfo.codeCoverage.warningMessage = `The specified reference build '${pipelineName}#${this.originalReferenceBuildNumber}' could not be found`;
                return referenceBuildInfo;
            }

            // When specificReferenceBuilds.length equals 1
            const specificReferenceBuild = specificReferenceBuilds[0];
            // Check for the succeeded or paratially-succeeded results exist in the specific reference build
            if (specificReferenceBuild.result != BuildResult.Succeeded && specificReferenceBuild.result != BuildResult.PartiallySucceeded) {
                referenceBuildInfo.codeCoverage.warningMessage = `The specified reference build '${pipelineName}#${this.originalReferenceBuildNumber}' cannot be used. Only successful or unstable builds are valid references`;
                return referenceBuildInfo;
            }

            let specificReferenceBuildId: number = Number(specificReferenceBuild.id);
            // Check for Parasoft results exist in the specific reference build
            const artifact: BuildArtifact = await this.buildClient.getBuildArtifact(this.projectName, specificReferenceBuildId, this.COBERTURA_ARTIFACT_NAME);
            if (!artifact) {
                referenceBuildInfo.codeCoverage.warningMessage = `No Parasoft coverage results were found in the specified reference build: '${pipelineName}#${this.originalReferenceBuildNumber}'`;
                return referenceBuildInfo;
            }

            referenceBuildInfo.fileEntries = await this.buildClient.getBuildReportsWithId(artifact, specificReferenceBuildId, FileSuffixEnum.COBERTURA_SUFFIX);

            if (referenceBuildInfo.fileEntries.length != 1) { // There will be only one cobertura report in Azure Artifact
                referenceBuildInfo.codeCoverage.warningMessage = `No Parasoft coverage results were found in the specified reference build: '${pipelineName}#${this.originalReferenceBuildNumber}'`;
                return referenceBuildInfo;
            }

            tl.debug(`Retrieved Parasoft coverage results from the reference build '${pipelineName}#${this.originalReferenceBuildNumber}'`);
            referenceBuildInfo.codeCoverage.buildId = specificReferenceBuildId;
            referenceBuildInfo.codeCoverage.buildNumber = this.originalReferenceBuildNumber;
            return referenceBuildInfo;
        }
    }

    private getQualityGateIdentification() {
        const referencePipeline: string = this.originalReferencePipelineName ? ", Reference pipeline: " + this.originalReferencePipelineName : "";
        const referenceBuild: string = this.originalReferenceBuildNumber ? ", Reference build: " + this.originalReferenceBuildNumber : "";
        return "Type: " + this.type + ", Threshold: " + this.threshold + referencePipeline + referenceBuild;
    }
}