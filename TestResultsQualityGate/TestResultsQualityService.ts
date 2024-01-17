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
import { Build, BuildDefinitionReference, BuildResult } from 'azure-devops-node-api/interfaces/BuildInterfaces';
import { ShallowTestCaseResult, TestOutcome } from 'azure-devops-node-api/interfaces/TestInterfaces';
import { APIClient } from './ApiClient';
import { QualityGateResult, QualityGateStatusEnum } from './QualityGateResult';

export const enum TypeEnum {
    TOTAL_PASSED_TESTS = 'totalPassed',
    TOTAL_FAILED_TESTS = 'totalFailed',
    TOTAL_EXECUTED_TESTS = 'totalExecuted',
    NEWLY_FAILED_TESTS = 'newlyFailed'
}

const TypeEnumText: Record<TypeEnum, string> = {
    [TypeEnum.TOTAL_PASSED_TESTS]: 'Total passed tests',
    [TypeEnum.TOTAL_FAILED_TESTS]: 'Total failed tests',
    [TypeEnum.TOTAL_EXECUTED_TESTS]: 'Total executed tests',
    [TypeEnum.NEWLY_FAILED_TESTS]: 'Newly failed tests'
}

export const enum BuildStatusEnum {
    FAILED = 'failed',
    UNSTABLE = 'unstable'
}

interface ReferenceBuildInputs {
    pipelineName?: string,
    buildNumber?: string
}

interface BuildInfo {
    pipelineName?: string | undefined,
    buildNumber?: string | undefined,
    buildId?: string | undefined,
    warningMsg?: string | undefined
}

const enum PipelineTypeEnum {
    BUILD = 'build',
    RELEASE = 'release'
}

export interface BuildResultInfo extends BuildInfo {
    testResults?: ShallowTestCaseResult[] | undefined,
    isDebugMsg?: boolean
}

export class TestResultsQualityService {
    private readonly pipelineType: PipelineTypeEnum = PipelineTypeEnum.BUILD;

    // Predefined variables for build pipeline
    private readonly pipelineName: string;
    private readonly buildNumber: string;
    private readonly buildId: string;
    private readonly definitionId: number;

     // Predefined variables for release pipeline
    private readonly releaseDefinitionId: number;
    private readonly releaseId: number;
    private readonly stageId: number;

    private readonly displayName: string;
    readonly type: TypeEnum;
    readonly threshold: number;
    readonly buildStatus: BuildStatusEnum;

    readonly apiClient: APIClient;

    referenceInputs: ReferenceBuildInputs = {};
    private referenceBuildResultInfo: BuildResultInfo = {};

    constructor() {
        this.pipelineName = tl.getVariable('Build.DefinitionName') || '';
        this.buildNumber = tl.getVariable('Build.BuildNumber') || '';
        this.buildId = tl.getVariable('Build.BuildId') || '';
        this.definitionId = Number(tl.getVariable('System.DefinitionId'));
        this.displayName = tl.getVariable('Task.DisplayName') || '';
        this.releaseDefinitionId = Number(tl.getVariable('Release.DefinitionId'));
        this.releaseId = Number(tl.getVariable('Release.ReleaseId'));
        this.stageId = Number(tl.getVariable('Release.EnvironmentId'));
        this.threshold = this.getThreshold(tl.getInput('threshold') || '');
        this.buildStatus = this.getBuildStatus(tl.getInput('buildStatus') || '');
        this.type = this.getType(tl.getInput('type') || '');

        this.apiClient = new APIClient();

        if(this.releaseId) {
            this.pipelineType = PipelineTypeEnum.RELEASE;
        }
    }

    run = async (): Promise<void> => {
        try {
            // Get reference build result from 'Publish Parasoft Results' task execution
            if (!this.readReferenceBuildInfo()) {
                return;
            }
            // Get test results in current build
            let numOfEvaluatedTests = null;
            let currentTestResults = [];
            if (this.pipelineType == PipelineTypeEnum.BUILD) {
                // Build pipeline
                currentTestResults = await this.apiClient.getTestResultsByBuildId(Number(this.buildId));
            } else {
                // Release pipeline
                currentTestResults = (await this.apiClient.getTestResultsByReleaseIdAndReleaseEnvId(this.releaseId, this.stageId));
            }
            if (currentTestResults.length == 0) {
                tl.setResult(tl.TaskResult.SucceededWithIssues, `Quality gate '${this.generateQualityGateString()}' skipped; no test results were found in this build`);
                return;
            }
            numOfEvaluatedTests = await this.getNumOfEvaluatedTests(currentTestResults);
            const qualityGateResult = this.evaluateQualityGate(numOfEvaluatedTests);
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
        }
        return true;
    }

    private getNumOfEvaluatedTests = async (currentBuildTestResults: ShallowTestCaseResult[]): Promise<number> => {
        let numberOfTests: number = 0;
        switch (this.type) {
            case TypeEnum.TOTAL_PASSED_TESTS:
                numberOfTests = currentBuildTestResults.filter((result) => {
                    return result.outcome == TestOutcome[TestOutcome.Passed];
                }).length;
                break;
            case TypeEnum.TOTAL_FAILED_TESTS:
                numberOfTests = currentBuildTestResults.filter((result) => {
                    return result.outcome == TestOutcome[TestOutcome.Failed];
                }).length;
                break;
            case TypeEnum.TOTAL_EXECUTED_TESTS:
                numberOfTests = currentBuildTestResults.length;
                break;
            case TypeEnum.NEWLY_FAILED_TESTS:
                // TODO: Support release pipeline.
                if(this.pipelineType == PipelineTypeEnum.BUILD) {
                    numberOfTests = await this.getNumOfNewlyFailedTests(currentBuildTestResults);
                }
                break;
            default:
                // User will never come here
                tl.error(`The 'type' value should be 'totalPassed', 'totalFailed', 'totalExecuted' or 'newlyFailed' instead of '${this.type}'`);
        }

        return numberOfTests;
    }

    private getNumOfNewlyFailedTests = async (currentTestResults: ShallowTestCaseResult[]): Promise<number> => {
        const currentFailedTests: ShallowTestCaseResult[] = currentTestResults.filter((test) => {
            return test.outcome == TestOutcome[TestOutcome.Failed];
        });
        const referenceTestResults = await this.getReferenceTestResults();
        const referenceFailedTests: ShallowTestCaseResult[] = referenceTestResults.filter((test) => {
            return test.outcome == TestOutcome[TestOutcome.Failed];
        });
        if (referenceFailedTests.length > 0) {
            // Get unique failed tests refIds in reference build
            const referenceFailedTestRefIds: number[] = [];
            referenceFailedTests.forEach((referenceFailedTest) => {
                const isAdded: boolean = referenceFailedTestRefIds.some(refId => refId === referenceFailedTest.refId);
                if (!isAdded) {
                    referenceFailedTestRefIds.push(<number>referenceFailedTest.refId);
                }
            });
            // Compare to get newly failed tests in current build
            let numberOfNewlyFailedTests: number = 0;
            currentFailedTests.forEach((currentFailedTest) => {
                const isRepeatFailure: boolean = referenceFailedTestRefIds.some(refId => refId == currentFailedTest.refId);
                if (!isRepeatFailure) {
                    numberOfNewlyFailedTests++;
                }
            });
            return numberOfNewlyFailedTests;
        } else {
            return currentFailedTests.length;
        }
    }

    private evaluateQualityGate = (numOfEvaluatedTests: number): QualityGateResult => {
        const qualityGateResult: QualityGateResult = new QualityGateResult(
            this.displayName,
            this.type,
            this.threshold,
            numOfEvaluatedTests,
            this.referenceBuildResultInfo
        );
        tl.debug("Evaluating quality gate");
        switch (this.type) {
            case TypeEnum.NEWLY_FAILED_TESTS:
            case TypeEnum.TOTAL_FAILED_TESTS:
                if (numOfEvaluatedTests == 0 || numOfEvaluatedTests <= this.threshold) {
                    tl.setResult(tl.TaskResult.Succeeded, `Quality gate '${this.generateQualityGateString()}' passed`);
                    qualityGateResult.status = QualityGateStatusEnum.PASSED;
                } else {
                    qualityGateResult.status = this.getQualityGateStatus();
                }
                break;
            case TypeEnum.TOTAL_PASSED_TESTS:
            case TypeEnum.TOTAL_EXECUTED_TESTS:
                if (numOfEvaluatedTests >= this.threshold) {
                    tl.setResult(tl.TaskResult.Succeeded, `Quality gate '${this.generateQualityGateString()}' passed`);
                    qualityGateResult.status = QualityGateStatusEnum.PASSED;
                } else {
                    qualityGateResult.status = this.getQualityGateStatus();
                }
                break;
            default:
                // User should never come here
                tl.error(`The build status should be unstable or failed instead of ${this.buildStatus}`);
        }
        tl.debug(`Quality Gate ${qualityGateResult.status} - ${TypeEnumText[this.type]}: ${numOfEvaluatedTests} - Threshold: ${this.threshold}`);
        return qualityGateResult;
    }

    private getQualityGateStatus = (): QualityGateStatusEnum => {
        switch (this.buildStatus) {
            case BuildStatusEnum.FAILED:
                tl.setResult(tl.TaskResult.Failed, `Quality gate '${this.generateQualityGateString()}' failed: build result is FAILED`);
                return QualityGateStatusEnum.FAILED;
            case BuildStatusEnum.UNSTABLE:
                tl.setResult(tl.TaskResult.SucceededWithIssues, `Quality gate '${this.generateQualityGateString()}' failed: build result is UNSTABLE`);
                return QualityGateStatusEnum.UNSTABLE;
            default:
                // User will never come here
                tl.error(`The build status should be unstable or failed instead of ${this.buildStatus}`);
                return QualityGateStatusEnum.FAILED;
        }
    }

    private getReferenceTestResults = async (): Promise<ShallowTestCaseResult[]> => {
        if ((!this.referenceInputs.pipelineName || this.referenceInputs.pipelineName == this.pipelineName)
             && this.referenceInputs.buildNumber == this.buildNumber) {
                this.referenceBuildResultInfo.warningMsg = 'Using the current build as the reference';
        } else {
            if (!this.referenceInputs.pipelineName) { // Reference pipeline is not specified
                tl.debug("No reference pipeline has been set; using the current pipeline as reference.");
                this.referenceBuildResultInfo = await this.getBuildResultByPipelineId(this.definitionId, this.pipelineName);
            } else { // Reference pipeline is specified
                // Get the reference pipeline id based on the reference pipeline name specified in the configuration UI
                const referencePipelines: BuildDefinitionReference[] = await this.apiClient.getPipelinesByName(this.referenceInputs.pipelineName);
                // Check for the specific reference pipeline exists
                if (referencePipelines.length == 1) {
                    const referencePipeline = referencePipelines[0];
                    const referencePipelineId = Number(referencePipeline.id);
                    this.referenceBuildResultInfo = await this.getBuildResultByPipelineId(referencePipelineId, referencePipeline.name || '');
                } else if (referencePipelines.length > 1) {
                    this.referenceBuildResultInfo.warningMsg = `The specified reference pipeline '${this.referenceInputs.pipelineName}' is not unique`;
                } else {
                    this.referenceBuildResultInfo.warningMsg = `The specified reference pipeline '${this.referenceInputs.pipelineName}' could not be found`;
                }
            }
        }
        if (this.referenceBuildResultInfo.warningMsg) {
            if (this.referenceBuildResultInfo.isDebugMsg) {
                tl.debug(`${this.referenceBuildResultInfo.warningMsg} - all failed tests will be treated as new`);
            } else {
                tl.warning(`${this.referenceBuildResultInfo.warningMsg} - all failed tests will be treated as new`);
            }
            this.referenceBuildResultInfo.warningMsg = this.referenceBuildResultInfo.warningMsg + ' - all failed tests were treated as new';
        }
        return this.referenceBuildResultInfo.testResults || [];
    }

    private getBuildResultByPipelineId = async (pipelineId: number, pipelineName: string): Promise<BuildResultInfo> => {
        const buildsOfPipeline = await this.apiClient.getBuildsOfPipelineById(pipelineId);
        if (!this.referenceInputs.buildNumber) { // Reference build is not specified
            tl.debug(`No reference build has been set; using the last successful build in pipeline '${pipelineName}' as reference.`);
            return this.getResultOfLastSuccessfulBuild(pipelineName, buildsOfPipeline);
        } else { // Reference build is specified
            return this.getResultOfSpecifiedBuild(pipelineName, buildsOfPipeline);
        }
    }

    private async getResultOfLastSuccessfulBuild(pipelineName: string, buildsOfPipeline: Build[]): Promise<BuildResultInfo> {
        const referenceResultInfo: BuildResultInfo = {
            testResults: [],
            pipelineName: undefined,
            buildNumber: undefined,
            buildId: undefined,
            warningMsg: undefined,
            isDebugMsg: false
        };

        if (buildsOfPipeline.length == 1 && buildsOfPipeline[0].id?.toString() == this.buildId) { // when only one build exists and it happens to be the current build
            referenceResultInfo.warningMsg = `No previous build was found in pipeline '${pipelineName}'`;
            referenceResultInfo.isDebugMsg = true;
            return referenceResultInfo;
        }

        const allSuccessfulBuilds = buildsOfPipeline.filter(build => {
            return build.result == BuildResult.Succeeded;
        });
        if (allSuccessfulBuilds.length <= 0) {
            referenceResultInfo.warningMsg = `No successful reference build was found in pipeline '${pipelineName}'`;
            return referenceResultInfo;
        }

        let lastSuccessfulBuild: Build = {};
        let testResults: ShallowTestCaseResult[] = [];
        for (const successfulBuild of allSuccessfulBuilds) {
            testResults =  await this.apiClient.getTestResultsByBuildId(<number> successfulBuild.id);
            if (testResults.length > 0) {
                lastSuccessfulBuild = successfulBuild;
                break;
            }
        }
        if (testResults.length == 0) {
            referenceResultInfo.warningMsg = `No test results were found in any of the previous successful builds in pipeline '${pipelineName}'`;
            return referenceResultInfo;
        }
        referenceResultInfo.testResults = testResults;
        referenceResultInfo.pipelineName = pipelineName;
        referenceResultInfo.buildId = (<number> lastSuccessfulBuild.id).toString();
        referenceResultInfo.buildNumber = lastSuccessfulBuild.buildNumber;
        tl.debug(`Set build '${pipelineName}#${lastSuccessfulBuild.buildNumber}' as the default reference build`);
        return referenceResultInfo;
    }

    private getResultOfSpecifiedBuild = async (pipelineName: string, buildsOfPipeline: Build[]) => {
        const referenceResultInfo: BuildResultInfo = {
            testResults: [],
            pipelineName: undefined,
            buildNumber: undefined,
            buildId: undefined,
            warningMsg: undefined
        };
        const referenceBuilds = buildsOfPipeline.filter(build => {
            return build.buildNumber == this.referenceInputs.buildNumber;
        });
        if (referenceBuilds.length > 1) {
            referenceResultInfo.warningMsg = `The specified reference build '${pipelineName}#${this.referenceInputs.buildNumber}' is not unique`;
            return referenceResultInfo;
        }
        if (referenceBuilds.length == 0) {
            referenceResultInfo.warningMsg = `The specified reference build '${pipelineName}#${this.referenceInputs.buildNumber}' could not be found`;
            return referenceResultInfo;
        }
        // When referenceBuilds.length equals 1
        const referenceBuild = referenceBuilds[0];
        // Check for the test results exist in the specific reference build
        const testResults = await this.apiClient.getTestResultsByBuildId(<number> referenceBuild.id);
        if (testResults.length == 0) {
            referenceResultInfo.warningMsg = `No test results were found in the specified reference build: '${pipelineName}#${this.referenceInputs.buildNumber}'`;
            return referenceResultInfo;
        }
        referenceResultInfo.testResults = testResults;
        referenceResultInfo.pipelineName = pipelineName;
        referenceResultInfo.buildId = (<number> referenceBuild.id).toString();
        referenceResultInfo.buildNumber = <string> referenceBuild.buildNumber;
        return referenceResultInfo;
    }

    private generateQualityGateString = () : string => {
        return "Type: " + TypeEnumText[this.type] + ", Threshold: " + this.threshold;
    }

    private getType = (typeString: string): TypeEnum => {
        switch (typeString.toLowerCase()) {
            case TypeEnum.TOTAL_EXECUTED_TESTS.toLowerCase():
                return TypeEnum.TOTAL_EXECUTED_TESTS;
            case TypeEnum.TOTAL_PASSED_TESTS.toLowerCase():
                return TypeEnum.TOTAL_PASSED_TESTS;
            case TypeEnum.TOTAL_FAILED_TESTS.toLowerCase():
                return TypeEnum.TOTAL_FAILED_TESTS;
            case TypeEnum.NEWLY_FAILED_TESTS.toLowerCase():
                return TypeEnum.NEWLY_FAILED_TESTS;
            default:
                tl.warning(`Invalid value for 'type': ${typeString}, using default value 'totalPassed'`);
                return TypeEnum.TOTAL_PASSED_TESTS;
        }
    }

    private getBuildStatus = (buildStatusString: string): BuildStatusEnum => {
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

    private getThreshold = (thresholdString: string): number => {
        const threshold = parseInt(thresholdString || '0');
        if (isNaN(threshold)) {
            tl.warning(`Invalid value for 'threshold': '${thresholdString}', using default value 0`);
            return 0;
        }
        if (threshold < 0) {
            tl.warning(`The threshold value '${thresholdString}' is less than 0, the value is set to 0`);
            return 0;
        }
        return threshold;
    }
}