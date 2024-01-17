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
import { BuildArtifact } from 'azure-devops-node-api/interfaces/BuildInterfaces';
import { BuildAPIClient, FileEntry } from './BuildApiClient';
import { QualityGateStatusEnum, QualityGateResult } from './QualityGateResult';

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
    FAILED = "failed",
    UNSTABLE = "unstable"
}

export interface ReferenceBuildInfo {
    pipelineName?: string,
    buildNumber?: string,
    buildId?: string,
    warningMsg?: string
}

interface ReferenceBuildInputs {
    pipelineName?: string,
    buildNumber?: string
}

const enum PipelineTypeEnum {
    BUILD = 'build',
    RELEASE = 'release'
}

export class StaticAnalysisQualityService {
    // Predefined variables
    private readonly buildId: number;
    private readonly displayName: string;
    private readonly pipelineType: PipelineTypeEnum = PipelineTypeEnum.BUILD;

    readonly type: TypeEnum;
    readonly severity: SeverityEnum;
    readonly buildStatus: BuildStatusEnum;
    readonly threshold: number;

    readonly buildClient: BuildAPIClient;
    referenceInputs: ReferenceBuildInputs = {};
    referenceBuildInfo: ReferenceBuildInfo = {};

    constructor() {
        this.buildId = Number(tl.getVariable('Build.BuildId'));
        this.displayName = tl.getVariable('Task.DisplayName') || '';
        this.type = this.getType(tl.getInput('type') || '');
        this.severity = this.getSeverity(tl.getInput('severity') || '');
        this.buildStatus = this.getBuildStatus(tl.getInput('buildStatus') || '');
        this.threshold = this.getThreshold(tl.getInput('threshold') || '');

        this.buildClient = new BuildAPIClient();

        if (tl.getVariable('Release.ReleaseId')) {
            this.pipelineType = PipelineTypeEnum.RELEASE;
        }
    }

    run = async (): Promise<void> => {
        try {
            if (this.pipelineType == PipelineTypeEnum.RELEASE) {
                tl.warning("Static analysis quality gates are not supported in the release pipeline");
                return;
            }
            // Get reference build result from 'Publish Parasoft Results' task execution
            if (!this.readReferenceBuildInfo()) {
                return;
            }
            // Get static analysis results in current build
            const currentBuildArtifact: BuildArtifact = await this.buildClient.getSarifArtifactOfBuildById(this.buildId);
            if (!currentBuildArtifact) {
                tl.setResult(tl.TaskResult.SucceededWithIssues, `Quality gate '${this.generateQualityGateString()}' skipped; no Parasoft static analysis results were found in this build`);
                return;
            }

            const sarifReports = await this.buildClient.getSarifReportsOfArtifact(currentBuildArtifact);
            if (sarifReports.length == 0) {
                tl.setResult(tl.TaskResult.SucceededWithIssues, `Quality gate '${this.generateQualityGateString()}' skipped; no Parasoft static analysis results were found in this build`);
                return;
            }
            const numberOfEvaluatedIssues: number = await this.getNumOfEvaluatedIssues(sarifReports);
            const qualityGateResult: QualityGateResult = this.evaluateQualityGate(numberOfEvaluatedIssues);
            qualityGateResult.uploadQualityGateSummary();
        } catch(error) {
            tl.warning(`Failed to process the quality gate '${this.generateQualityGateString()}'. See logs for details.`);
            console.error(error);
            return;
        }
    }

    private readReferenceBuildInfo = (): boolean => {
        const referenceBuildResult = tl.getVariable('PF.ReferenceBuildResult');
        if (!referenceBuildResult) {
            tl.setResult(tl.TaskResult.SucceededWithIssues, `Quality gate '${this.generateQualityGateString()}' skipped; please run 'Publish Parasoft Results' task first`);
            return false;
        }
        const referenceBuild = JSON.parse(<string> referenceBuildResult);
        this.referenceInputs = {
            pipelineName: referenceBuild.referencePipelineInput,
            buildNumber: referenceBuild.referenceBuildInput
        };
        this.referenceBuildInfo = {
            pipelineName: referenceBuild.staticAnalysis?.pipelineName,
            buildNumber: referenceBuild.staticAnalysis?.buildNumber,
            buildId: referenceBuild.staticAnalysis?.buildId,
            warningMsg: referenceBuild.staticAnalysis?.warningMessage
        }

        if (this.referenceBuildInfo.warningMsg) {
            tl.debug(this.referenceBuildInfo.warningMsg);
        }
        return true;
    }

    private evaluateQualityGate = (numberOfIssues: number): QualityGateResult => {
        const qualityGateResult: QualityGateResult = new QualityGateResult(this.displayName,
                                                                         this.referenceBuildInfo,
                                                                         this.type, this.severity, this.threshold);

        tl.debug("Evaluating quality gate");
        qualityGateResult.actualNumberOfIssues = numberOfIssues;

        if (numberOfIssues == 0 || numberOfIssues < this.threshold) { // When the actual number of issues is equal to zero or less than this threshold
            qualityGateResult.status = QualityGateStatusEnum.PASSED;
            tl.setResult(tl.TaskResult.Succeeded, `Quality gate '${this.generateQualityGateString()}' passed`);
        } else { // When the actual number of issues is greater than or equal to this threshold
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
                    // User will never come here
                    tl.error(`The build status should be unstable or failed instead of ${this.buildStatus}`);
            }
        }
        tl.debug(`Quality Gate ${qualityGateResult.status} - ${this.type} ${this.severity}s: ${numberOfIssues} - Threshold: ${this.threshold}`);
        return qualityGateResult;
    }

    private async getNumOfEvaluatedIssues(sarifFiles: FileEntry[]): Promise<number> {
        let numberOfIssues: number = 0;
        for (const sarifFile of sarifFiles) {
            const contentString = await sarifFile.contentsPromise;
            const contentJson = JSON.parse(contentString);
            /* eslint-disable @typescript-eslint/no-explicit-any */
            contentJson.runs?.forEach((run: any) => {
                if (run.results && run.results.length > 0) {
                    numberOfIssues += run.results.filter((result: any) => {
                        return this.isMatchingQualityGateSeverity(result) && !this.isSuppressedIssue(result) && this.isMatchingQualityGateType(result);
                    }).length;
                }
            });
            /* eslint-enable @typescript-eslint/no-explicit-any */
        }
        return numberOfIssues;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private isMatchingQualityGateSeverity(result: any): boolean {
        switch (this.severity) {
            case SeverityEnum.ALL:
                return true;
            case SeverityEnum.ERROR:
                return result.level == 'error';
            case SeverityEnum.WARNING:
                return result.level == 'warning';
            case SeverityEnum.NOTE:
                return result.level == 'note';
            default:
                // User should never come here
                tl.error(`The severity status should be error, warning, or note instead of ${this.buildStatus}`);
                return false;
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private isMatchingQualityGateType(result: any): boolean {
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private isSuppressedIssue(result: any): boolean {
        return result?.suppressions?.[0]?.kind === 'external';
    }

    private generateQualityGateString = (): string => {
        const severityText: string = this.severity == SeverityEnum.ALL ? 'All' : this.severity;
        let text = "Type: " + this.type + ", Severity: " + severityText + ", Threshold: " + this.threshold;
        if (this.type == TypeEnum.NEW) {
            const referencePipeline: string = this.referenceInputs.pipelineName ? ", Reference pipeline: " + this.referenceInputs.pipelineName : "";
            const referenceBuild: string = this.referenceInputs.buildNumber ? ", Reference build: " + this.referenceInputs.buildNumber : "";
            text += referencePipeline + referenceBuild;
        }
        return text;
    }

    private getThreshold = (thresholdString: string): number => {
        const threshold = parseInt(thresholdString || '0');
        if (isNaN(threshold)) {
            tl.warning(`Invalid value for 'threshold': ${thresholdString}, using default value 0`);
            return 0;
        }
        if (threshold < 0) {
            tl.warning(`The threshold value '${thresholdString}' is less than 0, the value is set to 0`);
            return 0;
        }
        return threshold;
    }

    private getSeverity(severityString: string): SeverityEnum {
        switch (severityString.toLowerCase()) {
            case SeverityEnum.ALL.toLowerCase():
                return SeverityEnum.ALL;
            case SeverityEnum.ERROR.toLowerCase():
                return SeverityEnum.ERROR;
            case SeverityEnum.WARNING.toLowerCase():
                return SeverityEnum.WARNING;
            case SeverityEnum.NOTE.toLowerCase():
                return SeverityEnum.NOTE;
            default:
                tl.warning(`Invalid value for 'severity': ${severityString}, using default value 'issue'`);
                return SeverityEnum.ALL;
        }
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
            case TypeEnum.NEW.toLowerCase():
                return TypeEnum.NEW;
            case TypeEnum.TOTAl.toLowerCase():
                return TypeEnum.TOTAl;
            default:
                tl.warning(`Invalid value for 'type': ${typeString}, using default value 'total'`);
                return TypeEnum.TOTAl;
        }
    }
}