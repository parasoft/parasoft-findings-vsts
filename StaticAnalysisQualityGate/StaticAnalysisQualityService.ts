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
import { Build, BuildArtifact, BuildResult } from 'azure-devops-node-api/interfaces/BuildInterfaces';
import { BuildAPIClient, FileEntry, FileSuffixEnum } from './BuildApiClient';

 export const enum TypeEnum {
     NEW = "new",
     TOTAl = "total",
 }

 export const enum SeverityEnum {
     ERROR = "error",
     WARNING = "warning",
     NOTE = "note"
 }

 export const enum BuildStatusEnum {
     FAILED = "failed",
     UNSTABLE = "unstable"
 }

 export class StaticAnalysisQualityService {
    readonly artifactName: string = 'CodeAnalysisLogs';
    readonly fileSuffix: FileSuffixEnum;
    readonly buildClient: BuildAPIClient;

    // Predefined variables
    readonly projectName: string;
    readonly buildId: number;
    readonly buildNumber: string;
    readonly definitionId: number;

    readonly typeString: string;
    readonly severityString: string;
    readonly buildStatusString: string;
    readonly referenceBuildString: string;
    readonly thresholdString: string;

    readonly type: TypeEnum;
    readonly severity: SeverityEnum;
    readonly buildStatus: BuildStatusEnum;
    readonly referenceBuild: string;
    readonly threshold: number;

    constructor() {
        this.fileSuffix = FileSuffixEnum.SARIF_SUFFIX;
        this.buildClient = new BuildAPIClient();

        this.projectName = tl.getVariable('System.TeamProject') || '';
        this.buildId = Number(tl.getVariable('Build.BuildId'));
        this.buildNumber = tl.getVariable('Build.BuildNumber') || '';
        this.definitionId = Number(tl.getVariable('System.DefinitionId'));

        this.typeString = tl.getInput('type') || '';
        this.severityString = tl.getInput('severity') || '';
        this.buildStatusString = tl.getInput('buildStatus') || '';
        this.referenceBuildString = tl.getInput('referenceBuild') || '';
        this.thresholdString = tl.getInput('threshold') || '';

        this.referenceBuild = this.referenceBuildString;
        this.threshold = parseFloat(this.thresholdString || '0.0');

        if (isNaN(this.threshold)) {
            tl.warning('Illegal threshold value \'' + this.thresholdString + '\', using default value 0.0');
            this.threshold = 0.0;
        }

        switch (this.typeString) {
            case TypeEnum.NEW:
                this.type = TypeEnum.NEW;
                break;
            case TypeEnum.TOTAl:
                this.type = TypeEnum.TOTAl;
                break;
            default:
                this.type = TypeEnum.TOTAl;
        }

        switch (this.buildStatusString) {
            case BuildStatusEnum.FAILED:
                this.buildStatus = BuildStatusEnum.FAILED;
                break;
            case BuildStatusEnum.UNSTABLE:
                this.buildStatus = BuildStatusEnum.UNSTABLE;
                break;
            default:
                this.buildStatus = BuildStatusEnum.FAILED;
        }

        switch (this.severityString) {
            case SeverityEnum.ERROR:
                this.severity = SeverityEnum.ERROR;
                break;
            case SeverityEnum.WARNING:
                this.severity = SeverityEnum.WARNING;
                break;
            case SeverityEnum.NOTE:
                this.severity = SeverityEnum.NOTE;
                break;
            default:
                this.severity = SeverityEnum.ERROR;
        }
    }

    run = async (): Promise<void> => {
        try {
            // Check for static analysis results exist in current build
            const currentBuildArtifact: BuildArtifact = await this.buildClient.getBuildArtifact(this.projectName, this.buildId, this.artifactName);
            if (!currentBuildArtifact) {
                tl.warning(`Quality gate '${this.getQualityGateIdentification()}' is skipped，no static analysis results found in this build`);
                return;
            }

            if (this.type == TypeEnum.TOTAl) {
                // TODO - Will be implemented in separate task.
                // If type is set to 'total', there will be no need to make comparison
                // Only need to calculate the total number of result in current build, then check the quality gate.
                return;
            } else if (this.type == TypeEnum.NEW) {
                if (this.referenceBuild == this.buildNumber) {
                    tl.warning(`Quality gate '${this.getQualityGateIdentification()}' is skipped, current build is used as the reference build`);
                    return;
                }

                const fileEntries = await this.getReferenceReports();
                if (!fileEntries) {
                    return;
                }
                if (fileEntries.length > 0) {
                    fileEntries.map(async (fileEntry) => {
                        tl.debug(`Found SARIF report: ${fileEntry.artifactName}/${fileEntry.filePath}`);
                        const sarifContents = await fileEntry.contentsPromise;
                        // TODO: Will be implemented in a separate task - Can get content of the reports here
                        tl.debug("The content of SARIF report: " + sarifContents);
                    })
                } else {
                    tl.warning(`Quality gate '${this.getQualityGateIdentification()}' is skipped, no static analysis results found`);
                }
            }
        } catch(error) {
            tl.warning(`Failed to process the quality gate '${this.getQualityGateIdentification()}'. See logs for details.`);
            console.error(error);
            return;
        }
    }

    getReferenceReports = async (): Promise<FileEntry[] | undefined> => {
        const allBuildsForCurrentPipeline: Build[] = await this.buildClient.getBuildsForSpecificPipeline(this.projectName, this.definitionId);
        let fileEntries: FileEntry[] | undefined = undefined;
        if (!this.referenceBuild) {
            tl.debug("No reference build has been set, will use the last successful build which has static analysis results");
            fileEntries = await this.buildClient.getDefaultBuildReports(allBuildsForCurrentPipeline, this.projectName, this.artifactName, this.fileSuffix);
        } else {
            const specificReferenceBuilds = allBuildsForCurrentPipeline.filter(build => {
                return build.buildNumber == this.referenceBuild;
            });

            // Check for the specific reference build exist in current pipeline
            if (specificReferenceBuilds.length == 1) {
                const specificReferenceBuild = specificReferenceBuilds[0];

                // Check for the succeeded or paratially-succeeded results exist in the specific reference build
                if(specificReferenceBuild.result == BuildResult.Succeeded || specificReferenceBuild.result == BuildResult.PartiallySucceeded) {
                    let specificReferenceBuildId: number = Number(specificReferenceBuild.id);
                    // Check for Parasoft results exist in the specific reference build
                    const artifact: BuildArtifact = await this.buildClient.getBuildArtifact(this.projectName, specificReferenceBuildId, this.artifactName);
                    if (artifact) {
                        fileEntries = await this.buildClient.getSpecificBuildReports(artifact, specificReferenceBuildId, this.fileSuffix);
                        tl.debug(`Obtained static analysis results form reference build '${this.referenceBuild}'`);
                    } else {
                        tl.warning(`Quality gate '${this.getQualityGateIdentification()}' is skipped，no static analysis results found in the specific reference build '${this.referenceBuild}'`);
                    }
                } else {
                    tl.warning(`Quality gate '${this.getQualityGateIdentification()}' is skipped，the status of specific reference build '${this.referenceBuild}' is not successful or unstable`);
                }
            } else if (specificReferenceBuilds.length > 1) {
                tl.warning(`Quality gate '${this.getQualityGateIdentification()}' is skipped，specific reference build '${this.referenceBuild}' is not unique`);
            } else {
                tl.warning(`Quality gate '${this.getQualityGateIdentification()}' is skipped，specific reference build '${this.referenceBuild}' is not found`);
            }
        }
        return Promise.resolve(fileEntries);
    }

    private getQualityGateIdentification = (): string => {
        return "Type: " + this.type + ", Severity: " + this.severity + ", Threshold: " + this.threshold + (this.referenceBuild ? ", Reference Build: " + this.referenceBuild : "");
    }
}