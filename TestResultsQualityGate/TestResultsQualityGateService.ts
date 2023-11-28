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
import { QualityGateResult } from './QualityGateResult';

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

export enum QualityGateStatusEnum {
    PASSED = "PASSED",
    UNSTABLE = "UNSTABLE",
    FAILED = "FAILED"
}

interface BuildResultInputs {
    pipelineName?: string,
    buildNumber?: string
}

interface BuildInfo {
    pipelineName?: string | undefined,
    buildNumber?: string | undefined,
    buildId?: string | undefined,
    warningMsg?: string | undefined
}

export interface BuildResultInfo extends BuildInfo {
    testResults?: ShallowTestCaseResult[] | undefined,
    isDebugMsg?: boolean
}

export class TestResultsQualityGateService {
    readonly apiClient: APIClient;
    // Predefined variables
    readonly projectName: string;
    readonly pipelineName: string;
    readonly buildNumber: string;
    readonly buildId: string;
    readonly definitionId: number;
    readonly displayName: string;

    type: TypeEnum;
    threshold: number;
    buildStatus: BuildStatusEnum;

    referenceBuildInputs: BuildResultInputs = {};
    referenceBuildResultInfo: BuildResultInfo = {};

    constructor() {
        this.apiClient = new APIClient();
        this.projectName = tl.getVariable('System.TeamProject') || '';
        this.pipelineName = tl.getVariable('Build.DefinitionName') || '';
        this.buildNumber = tl.getVariable('Build.BuildNumber') || '';
        this.buildId = tl.getVariable('Build.BuildId') || '';
        this.definitionId = Number(tl.getVariable('System.DefinitionId'));
        this.displayName = tl.getVariable('Task.DisplayName') || '';

        const thresholdString = tl.getInput('threshold') || '';
        const buildStatusString = tl.getInput('buildStatus') || '';
        const typeString = tl.getInput('type') || '';

        this.threshold = this.getThreshold(thresholdString);
        this.buildStatus = this.getBuildStatus(buildStatusString);
        this.type = this.getType(typeString);
    }

    run = async (): Promise<void> => {
        try {
            // Get reference build result from 'Publish Parasoft Results' task execution
            const referenceBuildResult = tl.getVariable('PF.ReferenceBuildResult');
            if (!referenceBuildResult) {
                tl.setResult(tl.TaskResult.SucceededWithIssues, `Quality gate '${this.generateQualityGateText()}' skipped; please run 'Publish Parasoft Results' task first`);
                return;
            }
            const originalReferenceBuildInputs = JSON.parse(<string> referenceBuildResult);
            this.referenceBuildInputs = {
                pipelineName: originalReferenceBuildInputs.originalPipelineName,
                buildNumber: originalReferenceBuildInputs.originalBuildNumber
            }

            // Get test results in current build
            const currentTestResults: ShallowTestCaseResult[] = await this.apiClient.getTestResultsByBuildId(this.projectName, Number(this.buildId));
            // Check for the test results exist in current build
            if (currentTestResults.length == 0) {
                tl.setResult(tl.TaskResult.SucceededWithIssues, `Quality gate '${this.generateQualityGateText()}' skipped; no test results were found in this build`);
                return;
            }

            const numOfEvaluatedTests = await this.getNumOfEvaluatedTestsByType(currentTestResults);
            let qualityGateResult = this.evaluateQualityGate(numOfEvaluatedTests);
            // TODO: CICD-594 Display the result under extension tab
        } catch(error) {
            tl.warning(`Failed to process the quality gate '${this.generateQualityGateText()}'. See logs for details.`);
            console.error(error);
            return;
        }
    }

    private getNumOfEvaluatedTestsByType = async (testResults: ShallowTestCaseResult[]): Promise<number> => {
        let numberOfTests: number = 0;
        switch (this.type) {
            case TypeEnum.TOTAL_PASSED_TESTS:
                numberOfTests = testResults.filter((result) => {
                    return result.outcome == TestOutcome[TestOutcome.Passed];
                }).length;
                break;
            case TypeEnum.TOTAL_FAILED_TESTS:
                numberOfTests = testResults.filter((result) => {
                    return result.outcome == TestOutcome[TestOutcome.Failed];
                }).length;
                break;
            case TypeEnum.TOTAL_EXECUTED_TESTS:
                numberOfTests = testResults.length;
                break;
            case TypeEnum.NEWLY_FAILED_TESTS:
                this.referenceBuildResultInfo = await this.getReferenceBuildResultInfo();
                numberOfTests = await this.getNumOfNewlyFailedTests(testResults, this.referenceBuildResultInfo.testResults || []);
                break;
            default:
                // User will never come here
                tl.error(`The 'type' value should be 'totalPassed', 'totalFailed', 'totalExecuted' or 'newlyFailed' instead of '${this.type}'`);
        }

        return numberOfTests;
    }

    private getNumOfNewlyFailedTests = async (
        currentTestResults: ShallowTestCaseResult[],
        referenceTestResults: ShallowTestCaseResult[]
    ): Promise<number> => {
        const currentFailedTests: ShallowTestCaseResult[] = currentTestResults.filter((test) => {
            return test.outcome == TestOutcome[TestOutcome.Failed];
        });
        const referenceFailedTests: ShallowTestCaseResult[] = referenceTestResults.filter((test) => {
            return test.outcome == TestOutcome[TestOutcome.Failed];
        });
        if (referenceFailedTests.length > 0) {
            const referenceFailedTestRefIds: number[] = [];
            referenceFailedTests.forEach((referenceFailedTest) => { // Remove duplicate elements
                let failedTestExists: boolean = referenceFailedTestRefIds.some(refId => refId === referenceFailedTest.refId);
                if (!failedTestExists) {
                    referenceFailedTestRefIds.push(<number>referenceFailedTest.refId);
                }
            });

            let numberOfNewlyFailedTests: number = 0;
            currentFailedTests.forEach((currentFailedTest) => { // Get number of newly failed tests
                let failedTestExists: boolean = referenceFailedTestRefIds.some(refId => refId == currentFailedTest.refId);
                if (!failedTestExists) {
                    numberOfNewlyFailedTests++;
                }
            });
            
            return numberOfNewlyFailedTests;
        } else {
            return currentFailedTests.length;
        }
    }

    private evaluateQualityGate = (numOfEvaluatedTests: number): QualityGateResult => {
        let qualityGateResult: QualityGateResult = new QualityGateResult(
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
                    qualityGateResult.status = this.getQualityGateStatus(true);
                } else {
                    qualityGateResult.status = this.getQualityGateStatus(false);
                }
                break;
            case TypeEnum.TOTAL_PASSED_TESTS:
            case TypeEnum.TOTAL_EXECUTED_TESTS:
                if (numOfEvaluatedTests >= this.threshold) {
                    qualityGateResult.status = this.getQualityGateStatus(true);
                } else {
                    qualityGateResult.status = this.getQualityGateStatus(false);
                }
                break;
            default:
                // User will never come here
                tl.error(`The build status should be unstable or failed instead of ${this.buildStatus}`);
        }

        tl.debug(`Quality Gate ${qualityGateResult.status} - ${TypeEnumText[this.type]}: ${numOfEvaluatedTests} - Threshold: ${this.threshold}`);
        return qualityGateResult;
    }

    private getQualityGateStatus = (isSucceeded: boolean): QualityGateStatusEnum => {
        if (isSucceeded) {
            tl.setResult(tl.TaskResult.Succeeded, `Quality gate '${this.generateQualityGateText()}' passed`);
            return QualityGateStatusEnum.PASSED;
        } else {
            switch (this.buildStatus) {
                case BuildStatusEnum.FAILED:
                    tl.setResult(tl.TaskResult.Failed, `Quality gate '${this.generateQualityGateText()}' failed: build result is FAILED`);
                    return QualityGateStatusEnum.FAILED;
                case BuildStatusEnum.UNSTABLE:
                    tl.setResult(tl.TaskResult.SucceededWithIssues, `Quality gate '${this.generateQualityGateText()}' failed: build result is UNSTABLE`);
                    return QualityGateStatusEnum.UNSTABLE;
                default:
                    // User will never come here
                    tl.error(`The build status should be unstable or failed instead of ${this.buildStatus}`);
                    return QualityGateStatusEnum.FAILED;
            }
        }
    }

    private getReferenceBuildResultInfo = async (): Promise<BuildResultInfo> => {
        let referenceResultInfo: BuildResultInfo = {
            testResults: [],
            pipelineName: undefined,
            buildNumber: undefined,
            buildId: undefined,
            warningMsg: undefined
        };
        if ((!this.referenceBuildInputs.pipelineName || this.referenceBuildInputs.pipelineName == this.pipelineName)
             && this.referenceBuildInputs.buildNumber == this.buildNumber) {
            referenceResultInfo.warningMsg = 'Using the current build as the reference';
        } else {
            if (!this.referenceBuildInputs.pipelineName) { // Reference pipeline is not specified
                tl.debug("No reference pipeline has been set; using the current pipeline as reference.");
                referenceResultInfo = await this.getBuildResultByPipelineId(this.definitionId, this.pipelineName);
            } else { // Reference pipeline is specified
                // Get the reference pipeline id based on the reference pipeline name specified in the configuration UI
                const referencePipelines: BuildDefinitionReference[] = await this.apiClient.getPipelinesByName(this.projectName, this.referenceBuildInputs.pipelineName);
                // Check for the specific reference pipeline exists
                if (referencePipelines.length == 1) {
                    const referencePipeline = referencePipelines[0];
                    const referencePipelineId = Number(referencePipeline.id);
                    referenceResultInfo = await this.getBuildResultByPipelineId(referencePipelineId, referencePipeline.name || '');
                } else if (referencePipelines.length > 1) {
                    referenceResultInfo.warningMsg = `The specified reference pipeline '${this.referenceBuildInputs.pipelineName}' is not unique`;
                } else {
                    referenceResultInfo.warningMsg = `The specified reference pipeline '${this.referenceBuildInputs.pipelineName}' could not be found`;
                }
            }
        }
        if (referenceResultInfo.warningMsg) {
            if (referenceResultInfo.isDebugMsg) {
                tl.debug(`${referenceResultInfo.warningMsg} - all failed tests will be treated as new`);
            } else {
                tl.warning(`${referenceResultInfo.warningMsg} - all failed tests will be treated as new`);
            }
        }
        return referenceResultInfo;
    }

    private getBuildResultByPipelineId = async (pipelineId: number, pipelineName: string): Promise<BuildResultInfo> => {
        const buildsOfPipeline = await this.apiClient.getBuildsOfPipelineById(this.projectName, pipelineId);
        if (!this.referenceBuildInputs.buildNumber) { // Reference build is not specified
            tl.debug(`No reference build has been set; using the last completed build in pipeline '${pipelineName}' as reference.`);
            return this.getResultOfLastCompletedBuild(pipelineName, buildsOfPipeline);
        } else { // Reference build is specified
            return this.getResultOfSpecifiedBuild(pipelineName, buildsOfPipeline);
        }
    }

    private async getResultOfLastCompletedBuild(pipelineName: string, buildsOfPipeline: Build[]): Promise<BuildResultInfo> {
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

        const allCompletedBuilds = buildsOfPipeline.filter(build => {
            return build.result != undefined && build.result != BuildResult.Canceled && build.result != BuildResult.None;
        });
        if (allCompletedBuilds.length <= 0) {
            referenceResultInfo.warningMsg = `No completed reference build was found in pipeline '${pipelineName}'`;
            return referenceResultInfo;
        }

        let lastCompletedBuild: Build = allCompletedBuilds[0];
        const testResults: ShallowTestCaseResult[] = await this.apiClient.getTestResultsByBuildId(this.projectName, <number> lastCompletedBuild.id);
        referenceResultInfo.testResults = testResults;
        referenceResultInfo.buildId = (<number> lastCompletedBuild.id).toString();
        referenceResultInfo.buildNumber = lastCompletedBuild.buildNumber;
        tl.debug(`Set build '${pipelineName}#${lastCompletedBuild.buildNumber}' as the default reference build`);
        return referenceResultInfo;
    }

    private getResultOfSpecifiedBuild = async (pipelineName: string, buildsOfPipeline: Build[]) => {
        let referenceResultInfo: BuildResultInfo = {
            testResults: [],
            pipelineName: undefined,
            buildNumber: undefined,
            buildId: undefined,
            warningMsg: undefined
        };
        const referenceBuilds = buildsOfPipeline.filter(build => {
            return build.buildNumber == this.referenceBuildInputs.buildNumber;
        });
        if (referenceBuilds.length > 1) {
            referenceResultInfo.warningMsg = `The specified reference build '${pipelineName}#${this.referenceBuildInputs.buildNumber}' is not unique`;
            return referenceResultInfo;
        }
        if (referenceBuilds.length == 0) {
            referenceResultInfo.warningMsg = `The specified reference build '${pipelineName}#${this.referenceBuildInputs.buildNumber}' could not be found`;
            return referenceResultInfo;
        }
        // When referenceBuilds.length equals 1
        const referenceBuild = referenceBuilds[0];
        // Check for the test results exist in the specific reference build
        const testResults = await this.apiClient.getTestResultsByBuildId(this.projectName, <number> referenceBuild.id);
        referenceResultInfo.testResults = testResults;
        referenceResultInfo.pipelineName = pipelineName;
        referenceResultInfo.buildId = (<number> referenceBuild.id).toString();
        referenceResultInfo.buildNumber = <string> referenceBuild.buildNumber;
        return referenceResultInfo;
    }

    private generateQualityGateText = () : string => {
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
            case BuildStatusEnum.FAILED.toLowerCase():
                return BuildStatusEnum.FAILED;
            case BuildStatusEnum.UNSTABLE.toLowerCase():
                return BuildStatusEnum.UNSTABLE;
            default:
                tl.warning(`Invalid value for 'buildStatus': ${buildStatusString}, using default value 'failed'`);
                return BuildStatusEnum.FAILED;
        }
    }

    private getThreshold = (thresholdString: string): number => {
        let threshold = parseInt(thresholdString || '0');
        if (isNaN(threshold)) {
            tl.warning(`Invalid threshold value '${thresholdString}', using default value 0`);
            return 0;
        }
        if (threshold < 0) {
            tl.warning(`The threshold value '${thresholdString}' is less than 0, the value is set to 0`);
            return 0;
        }
        return threshold;
    }
}