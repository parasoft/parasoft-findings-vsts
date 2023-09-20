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

    typeString: string | undefined;
    severityString: string | undefined;
    buildStatusString: string | undefined;
    referenceBuildString: string | undefined;
    thresholdString: string | undefined;

    type: TypeEnum;
    severity: SeverityEnum;
    buildStatus: BuildStatusEnum;
    referenceBuild: string | undefined;
    threshold: number;

    constructor() {
        this.fileSuffix = FileSuffixEnum.SARIF_SUFFIX;
        this.buildClient = new BuildAPIClient();

        this.projectName = tl.getVariable('System.TeamProject') || '';
        this.buildId = Number(tl.getVariable('Build.BuildId'));
        this.buildNumber = tl.getVariable('Build.BuildNumber') || '';
        this.definitionId = Number(tl.getVariable('System.DefinitionId'));

        this.typeString = tl.getInput('type');
        this.severityString = tl.getInput('severity');
        this.buildStatusString = tl.getInput('buildStatus');
        this.referenceBuildString = tl.getInput('referenceBuild');
        this.thresholdString = tl.getInput('threshold');

        this.referenceBuild = this.referenceBuildString;
        this.threshold = parseFloat(this.thresholdString || '0.0');

        if (isNaN(this.threshold)) {
            tl.warning('Illegal threshold value \'' + this.thresholdString + '\', using default value 0.0');
            this.threshold = 0.0;
        }

        switch (this.typeString) {
            case TypeEnum.NEW :
                this.type = TypeEnum.NEW;
                break;
            case TypeEnum.TOTAl :
                this.type = TypeEnum.TOTAl;
                break;
            default :
                this.type = TypeEnum.TOTAl;
        }

        switch (this.buildStatusString) {
            case BuildStatusEnum.FAILED :
                this.buildStatus = BuildStatusEnum.FAILED;
                break;
            case BuildStatusEnum.UNSTABLE :
                this.buildStatus = BuildStatusEnum.UNSTABLE;
                break;
            default :
                this.buildStatus = BuildStatusEnum.FAILED;
        }

        switch (this.severityString) {
            case SeverityEnum.ERROR :
                this.severity = SeverityEnum.ERROR;
                break;
            case SeverityEnum.WARNING :
                this.severity = SeverityEnum.WARNING;
                break;
            case SeverityEnum.NOTE :
                this.severity = SeverityEnum.NOTE;
                break;
            default :
                this.severity = SeverityEnum.ERROR;
        }

        tl.debug("Input type: " + this.typeString);
        tl.debug("Static analysis quality type: " + this.type);

        tl.debug("Input severity: " + this.severityString);
        tl.debug("Static analysis quality severity: " + this.severity);

        tl.debug("Input buildStatus: " + this.buildStatusString);
        tl.debug("Static analysis quality buildStatus: " + this.buildStatus);

        tl.debug("Input referenceBuild: " + this.referenceBuildString);
        tl.debug("Static analysis quality referenceBuild: " + this.referenceBuild);

        tl.debug("Input threshold: " + this.thresholdString);
        tl.debug("Static analysis quality threshold: " + this.threshold);
    }

    run = async (): Promise<void> => {
        // Check for static analysis results exist in current build
        const artifact: Promise<BuildArtifact> = this.buildClient
                                                    .getBuildArtifact(this.projectName, this.buildId, this.artifactName);
        if (!await artifact) {
            tl.warning(`No static analysis results found in this build`);
            tl.debug("The quality gates does not take effect - skipping");
            return;
        }

        // TODO - Will be implemented in seperate task.
        if (this.type == TypeEnum.TOTAl) {
            // If type is set to 'total', there will be no need to make comparision
            // Only need to calculate the total number of result in current build, then check the quality gate.
            // return;
        } else if (this.referenceBuild == this.buildNumber) {
            tl.warning("The current build cannot be used as a reference object");
            tl.debug("All reported issues will be considered new");
            tl.debug("The quality gates does not take effect - skipping");
            return;
        }

        this.getReferenceReports().then((fileEntry) => {
            if (fileEntry.length == 0) {
                tl.debug("All reported issues will be considered new");
                tl.debug("The quality gates does not take effect - skipping");
                return;
            }
            // TODO: Will be implemented in a separate task - Can get content of the reports here
            fileEntry.map((file) => {
                tl.debug("The information of SARIF reports: " + file.artifactName + ":" + file.filePath + ":" + file.name + ":");
                file.contentsPromise?.then((text) => {
                    tl.debug("The content of SARIF reports:" +text);
                })
            })
        });

    }

    getReferenceReports = async(): Promise<FileEntry[]> => {
        tl.debug("Obtaining reference build from same pipeline");
        const allBuildsForCurrentPipeline: Promise<Build[]> = this.buildClient
                                                                .getBuildsForSpecificPipeline(this.projectName, this.definitionId);

        if (!this.referenceBuild) {
            tl.debug("No reference build has been set");

            return this.buildClient.getDefaultBuildReports(
                allBuildsForCurrentPipeline,
                this.projectName,
                this.artifactName,
                this.fileSuffix);
        } else {
            let fileEntryArr:FileEntry[] = [];
            // Check for the specific reference build with succeeded/paratially-succeeded results exist in current pipeline
            const specificReferenceBuild = (await allBuildsForCurrentPipeline).filter(build => {
                return build.buildNumber === this.referenceBuild
                        && (build.result === BuildResult.Succeeded
                            || build.result === BuildResult.PartiallySucceeded);
            });

            if (specificReferenceBuild.length > 0) {
                let specificReferenceBuildId: number = Number(specificReferenceBuild[0].id);

                // Check for results exist in the specific reference build
                const artifact: Promise<BuildArtifact> = this.buildClient
                                                            .getBuildArtifact(this.projectName, specificReferenceBuildId, this.artifactName);
                if (await artifact) {
                    tl.debug(`Using specific reference build ${specificReferenceBuildId}`);

                    fileEntryArr = await this.buildClient.getSpecificBuildReports(
                        specificReferenceBuildId,
                        this.projectName,
                        this.artifactName,
                        this.fileSuffix);
                } else {
                    tl.warning(`No reference results found in the specific reference build ${this.referenceBuild}`);
                }
            } else {
                tl.warning(`No valid specific reference build ${this.referenceBuild} found`);
            }
            return Promise.resolve(fileEntryArr);
        }
    }
}