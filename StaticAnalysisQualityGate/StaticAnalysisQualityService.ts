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
    ALL = "Issue",
    ERROR = "Error",
    WARNING = "Warning",
    NOTE = "Note"
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

interface ReferenceBuildResult {
    originalBuildNumber: string,
    staticAnalysis?: {
        buildId: string | undefined,
        buildNumber:  string | undefined,
        warningMessage: string | undefined
    }
}

export class StaticAnalysisQualityService {
    readonly artifactName: string = 'CodeAnalysisLogs';
    readonly fileSuffix: FileSuffixEnum;
    readonly buildClient: BuildAPIClient;
    readonly defaultWorkingDirectory: string;

    // Predefined variables
    readonly projectName: string;
    readonly buildId: number;
    readonly buildNumber: string;
    readonly definitionId: number;
    readonly displayName: string;

    readonly typeString: string;
    readonly severityString: string;
    readonly buildStatusString: string;
    readonly thresholdString: string;

    readonly type: TypeEnum;
    readonly severity: SeverityEnum;
    readonly buildStatus: BuildStatusEnum;
    readonly threshold: number;
    originalReferenceBuildNumber: string | undefined;
    referenceBuildNumber: string | undefined;
    referenceBuildId: string | undefined;
    referenceBuildWarningMessage: string | undefined;

    constructor() {
        this.fileSuffix = FileSuffixEnum.SARIF_SUFFIX;
        this.buildClient = new BuildAPIClient();
        this.defaultWorkingDirectory = tl.getVariable('System.DefaultWorkingDirectory') || '';

        this.projectName = tl.getVariable('System.TeamProject') || '';
        this.buildId = Number(tl.getVariable('Build.BuildId'));
        this.buildNumber = tl.getVariable('Build.BuildNumber') || '';
        this.definitionId = Number(tl.getVariable('System.DefinitionId'));
        this.displayName = tl.getVariable('Task.DisplayName') || '';

        this.typeString = tl.getInput('type') || '';
        this.severityString = tl.getInput('severity') || '';
        this.buildStatusString = tl.getInput('buildStatus') || '';
        this.thresholdString = tl.getInput('threshold') || '';

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
            case SeverityEnum.ALL:
                this.severity = SeverityEnum.ALL;
                break;
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
                this.severity = SeverityEnum.ALL;
        }
    }

    run = async (): Promise<void> => {
        try {
            let staticAnalysisReferenceBuild = tl.getVariable('PF.ReferenceBuildResult');
            if (!staticAnalysisReferenceBuild) {
                tl.warning(`Quality gate '${this.getQualityGateIdentification()}' was skipped: please run 'Publish Parasoft Results' task first`);
                return;
            }
            let referenceBuild: ReferenceBuildResult = JSON.parse(<string> staticAnalysisReferenceBuild);
            this.originalReferenceBuildNumber = referenceBuild.originalBuildNumber;
            this.referenceBuildNumber = referenceBuild.staticAnalysis?.buildNumber;
            this.referenceBuildId = referenceBuild.staticAnalysis?.buildId;
            this.referenceBuildWarningMessage = referenceBuild.staticAnalysis?.warningMessage;

            if (this.referenceBuildWarningMessage) {
                tl.debug(this.referenceBuildWarningMessage);
            }

            // Check for static analysis results exist in current build
            const currentBuildArtifact: BuildArtifact = await this.buildClient.getBuildArtifact(this.projectName, this.buildId, this.artifactName);
            if (!currentBuildArtifact) {
                tl.warning(`Quality gate '${this.getQualityGateIdentification()}' was skipped; no Parasoft static analysis results were found in this build`);
                return;
            }

            let numberOfIssues: number = 0;
            const fileEntries = await this.buildClient.getBuildReportsWithId(currentBuildArtifact, this.buildId, this.fileSuffix);
            if (fileEntries.length == 0) {
                tl.warning(`Quality gate '${this.getQualityGateIdentification()}' was skipped; no Parasoft static analysis results were found in this build`);
                return;
            }
            for (let fileEntry of fileEntries) {
                const contentString = await fileEntry.contentsPromise;
                const contentJson = JSON.parse(contentString);
                numberOfIssues += this.countNumberOfIssues(contentJson);
            }

            const qualityGateResult: QualityGateResult = this.evaluateQualityGate(numberOfIssues);
            qualityGateResult.uploadQualityGateSummary();
        } catch(error) {
            tl.warning(`Failed to process the quality gate '${this.getQualityGateIdentification()}'. See logs for details.`);
            console.error(error);
            return;
        }
    }

    private evaluateQualityGate = (numberOfIssues: number): QualityGateResult => {
        let qualityGateResult: QualityGateResult = new QualityGateResult(this.displayName, 
                                                                         this.referenceBuildNumber || '',
                                                                         this.referenceBuildId || '', 
                                                                         this.referenceBuildWarningMessage || '',
                                                                         this.type, this.severity, this.threshold, 
                                                                         this.defaultWorkingDirectory);

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
        tl.debug(`Quality Gate ${qualityGateResult.status} - ${this.type} ${this.severity}s: ${numberOfIssues} - Threshold: ${this.threshold}`);
        return qualityGateResult;
    }

    private countNumberOfIssues(contentJson: any): number {
        let numberOfIssues: number = 0;
        if (contentJson.runs) {
            contentJson.runs.forEach((run: any) => {
                if (run.results && run.results.length > 0) {
                    switch (this.severity) {
                        case SeverityEnum.ALL:
                            numberOfIssues += run.results.filter((result: any) => {
                                return !this.isSuppressedIssue(result) && this.doesViolMatchQualityGateType(result);
                            }).length;
                            break;
                        case SeverityEnum.ERROR:
                            numberOfIssues += run.results.filter((result: any) => {
                                return result.level == 'error' && !this.isSuppressedIssue(result) && this.doesViolMatchQualityGateType(result);
                            }).length;
                            break;
                        case SeverityEnum.WARNING:
                            numberOfIssues += run.results.filter((result: any) => {
                                return result.level == 'warning' && !this.isSuppressedIssue(result) && this.doesViolMatchQualityGateType(result);
                            }).length;
                            break;
                        case SeverityEnum.NOTE:
                            numberOfIssues += run.results.filter((result: any) => {
                                return result.level == 'note' && !this.isSuppressedIssue(result) && this.doesViolMatchQualityGateType(result);
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

    private doesViolMatchQualityGateType(result: any): boolean {
        if (!result) {
            return false;
        }
        const baselineState = result.baselineState || 'new';

        switch (this.type) {
            case TypeEnum.NEW:
                return baselineState == 'new';
            case TypeEnum.TOTAl:
            default:
                return true;
        }
    }

    private isSuppressedIssue(result: any): boolean {
        return Boolean(result) && Boolean(result.suppressions) && Boolean(result.suppressions[0]) && result.suppressions[0].kind == "external";
    }

    private getQualityGateIdentification = (): string => {
        const severityText: string = this.severity == SeverityEnum.ALL ? 'All' : this.severity;
        return "Type: " + this.type + ", Severity: " + severityText + ", Threshold: " + this.threshold + (this.originalReferenceBuildNumber ? ", Reference Build: " + this.originalReferenceBuildNumber : "");
    }
}