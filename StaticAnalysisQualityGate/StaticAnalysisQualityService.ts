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
import { QualityGateResult } from './QualityGateResult';

export const enum TypeEnum {
    NEW = "New",
    TOTAl = "Total",
}

export const enum SeverityEnum {
    ERROR = "Error",
    WARNING = "Warning",
    NOTE = "Note"
}

export const enum BuildStatusEnum {
    FAILED = "failed",
    UNSTABLE = "unstable"
}

export enum QualityGateStatusEnum {
    PASSED = "PASSED",
    UNSTABLE = "UNSTABLE",
    FAILED = "FAILED"
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
    readonly displayName: string;

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
    referenceBuildId: number | undefined = undefined;

    constructor() {
        this.fileSuffix = FileSuffixEnum.SARIF_SUFFIX;
        this.buildClient = new BuildAPIClient();

        this.projectName = tl.getVariable('System.TeamProject') || '';
        this.buildId = Number(tl.getVariable('Build.BuildId'));
        this.buildNumber = tl.getVariable('Build.BuildNumber') || '';
        this.definitionId = Number(tl.getVariable('System.DefinitionId'));
        this.displayName = tl.getVariable('Task.DisplayName') || '';

        this.typeString = tl.getInput('type') || '';
        this.severityString = tl.getInput('severity') || '';
        this.buildStatusString = tl.getInput('buildStatus') || '';
        this.referenceBuildString = tl.getInput('referenceBuild') || '';
        this.thresholdString = tl.getInput('threshold') || '';

        this.referenceBuild = this.referenceBuildString;
        this.threshold = parseInt(this.thresholdString || '0');

        if (isNaN(this.threshold)) {
            tl.warning('Illegal threshold value \'' + this.thresholdString + '\', using default value 0');
            this.threshold = 0;
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
                tl.warning(`Quality gate '${this.getQualityGateIdentification()}' was skipped; no artifacts were found in this build`);
                return;
            }

            if (this.type == TypeEnum.TOTAl) { // Calculate the total number of issues in current build
                const fileEntries = await this.buildClient.getBuildReportsWithId(currentBuildArtifact, this.buildId, this.fileSuffix);

                let numberOfIssues: number = 0;
                let fileEntry: FileEntry;
                for (fileEntry of fileEntries) {
                    const contentString = await fileEntry.contentsPromise;
                    const contentJson = JSON.parse(contentString);
                    numberOfIssues += this.countNumberOfIssues(contentJson);
                }
                const qualityGateResult: QualityGateResult = this.evaluateQualityGate(numberOfIssues);
                qualityGateResult.uploadQualityGateSummary(this.displayName, tl.getVariable('System.DefaultWorkingDirectory') || '')
                return;
            } else if (this.type == TypeEnum.NEW) {
                if (this.referenceBuild == this.buildNumber) {
                    tl.warning(`Quality gate '${this.getQualityGateIdentification()}' was skipped; no new issues will be detected since the build ID set is the same as the current build`);
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
                    tl.warning(`Quality gate '${this.getQualityGateIdentification()}' was skipped; no static analysis reports were found in this build`);
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
            tl.debug("No reference build has been set; using the last successful build with static analysis results");
            fileEntries = await this.buildClient.getDefaultBuildReports(allBuildsForCurrentPipeline, this.projectName, this.artifactName, this.fileSuffix);
        } else {
            const specificReferenceBuilds = allBuildsForCurrentPipeline.filter(build => {
                return build.buildNumber == this.referenceBuild;
            });

            // Check for the specific reference build exist in current pipeline
            if (specificReferenceBuilds.length == 1) {
                const specificReferenceBuild = specificReferenceBuilds[0];
                this.referenceBuildId = specificReferenceBuild.id;
                // Check for the succeeded or paratially-succeeded results exist in the specific reference build
                if (specificReferenceBuild.result == BuildResult.Succeeded || specificReferenceBuild.result == BuildResult.PartiallySucceeded) {
                    let specificReferenceBuildId: number = Number(specificReferenceBuild.id);
                    // Check for Parasoft results exist in the specific reference build
                    const artifact: BuildArtifact = await this.buildClient.getBuildArtifact(this.projectName, specificReferenceBuildId, this.artifactName);
                    if (artifact) {
                        fileEntries = await this.buildClient.getBuildReportsWithId(artifact, specificReferenceBuildId, this.fileSuffix);
                        tl.debug(`Retrieved static analysis results from the reference build '${this.referenceBuild}'`);
                    } else {
                        tl.warning(`Quality gate '${this.getQualityGateIdentification()}' was skipped; no artifacts were found in the specified reference build: '${this.referenceBuild}'`);
                    }
                } else {
                    tl.warning(`Quality gate '${this.getQualityGateIdentification()}' was skipped，the specified reference build '${this.referenceBuild}' is not successful or unstable`);
                }
            } else if (specificReferenceBuilds.length > 1) {
                tl.warning(`Quality gate '${this.getQualityGateIdentification()}' was skipped，the specified reference build '${this.referenceBuild}' is not unique`);
            } else {
                tl.warning(`Quality gate '${this.getQualityGateIdentification()}' was skipped，the specified reference build '${this.referenceBuild}' could not be found`);
            }
        }
        return Promise.resolve(fileEntries);
    }

    private evaluateQualityGate = (numberOfIssues: number): QualityGateResult => {
        let qualityGateResult: QualityGateResult = new QualityGateResult(this.displayName,this.referenceBuild, this.referenceBuildId, this.type, this.severity, this.threshold);

        tl.debug("Evaluating quality gate");
        qualityGateResult.actualNumberOfIssues = numberOfIssues;

        if (numberOfIssues < this.threshold) { // When the actual number of issues is less than this threshold
            qualityGateResult.status = QualityGateStatusEnum.PASSED;
            tl.setResult(tl.TaskResult.Succeeded, `Quality gate '${this.getQualityGateIdentification()}' has been passed`);
        } else { // When the actual number of issues is greater than or equal to this threshold
            switch (this.buildStatus) {
                case BuildStatusEnum.UNSTABLE:
                    qualityGateResult.status = QualityGateStatusEnum.UNSTABLE;
                    tl.setResult(tl.TaskResult.SucceededWithIssues, `Quality gate '${this.getQualityGateIdentification()}' has been missed: result is UNSTABLE`);
                    break;
                case BuildStatusEnum.FAILED:
                    qualityGateResult.status = QualityGateStatusEnum.FAILED;
                    tl.setResult(tl.TaskResult.Failed, `Quality gate '${this.getQualityGateIdentification()}' has been missed: result is FAILED`);
                    break;
                default:
                    // User will never come here
                    tl.error(`The build status should be unstable or failed instead of ${this.buildStatus}`);
            }
        }
        tl.debug(`${qualityGateResult.status} - ${this.type} (${this.severity} severity): ${numberOfIssues} - Quality Gate: ${this.threshold}`);
        return qualityGateResult;
    }

    private countNumberOfIssues(contentJson: any): number {
        let numberOfIssues: number = 0;
        if (contentJson.runs) {
            contentJson.runs.forEach((run: any) => {
                if (run.results && run.results.length > 0) {
                    switch (this.severity) {
                        case SeverityEnum.ERROR:
                            numberOfIssues += run.results.filter((result: any) => {
                                return result.level == 'error';
                            }).length;
                            break;
                        case SeverityEnum.WARNING:
                            numberOfIssues += run.results.filter((result: any) => {
                                return result.level == 'warning';
                            }).length;
                            break;
                        case SeverityEnum.NOTE:
                            numberOfIssues += run.results.filter((result: any) => {
                                return result.level == 'note';
                            }).length;
                            break;
                        default:
                            // User will never come here
                            tl.error(`The severity status should be error, warning or note instead of ${this.buildStatus}`);
                    }
                }
            });
        }
        return numberOfIssues;
    }

    private getQualityGateIdentification = (): string => {
        return "Type: " + this.type + ", Severity: " + this.severity + ", Threshold: " + this.threshold + (this.referenceBuild ? ", Reference Build: " + this.referenceBuild : "");
    }
}