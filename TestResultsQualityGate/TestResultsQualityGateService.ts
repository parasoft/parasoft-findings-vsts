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
import { BuildDefinitionReference } from 'azure-devops-node-api/interfaces/BuildInterfaces';
import { ShallowTestCaseResult } from 'azure-devops-node-api/interfaces/TestInterfaces';
import { APIClient, DefaultTestResults, DefaultTestResultsStatus } from './ApiClient';

export const enum TypeEnum {
    TOTAL_PASSED_TESTS = 'totalPassed',
    TOTAL_FAILED_TESTS = 'totalFailed',
    TOTAL_EXECUTED_TESTS = 'totalExecuted',
    NEWLY_FAILED_TESTS = 'newlyFailed'
}

export const enum BuildStatusEnum {
    FAILED = 'failed',
    UNSTABLE = 'unstable'
}

interface ReferenceBuildResult {
    originalPipelineName: string,
    originalBuildNumber: string
}

interface TestResultsInformation {
    testResults: ShallowTestCaseResult[],
    warningMessage: string | undefined
    isDebugMessage?: boolean;
}

export class TestResultsQualityGateService {
    readonly apiClient: APIClient;
    // Predefined variables
    readonly projectName: string;
    readonly pipelineName: string;
    readonly buildNumber: string;
    readonly buildId: string;
    readonly definitionId: number;

    readonly typeString: string;
    readonly thresholdString: string;
    readonly buildStatusString: string;

    type: TypeEnum;
    threshold: number;
    buildStatus: BuildStatusEnum;

    originalReferencePipelineName: string | undefined;
    originalReferenceBuildNumber: string | undefined;

    constructor() {
        this.apiClient = new APIClient();
        this.projectName = tl.getVariable('System.TeamProject') || '';
        this.pipelineName = tl.getVariable('Build.DefinitionName') || '';
        this.buildNumber = tl.getVariable('Build.BuildNumber') || '';
        this.buildId = tl.getVariable('Build.BuildId') || '';
        this.definitionId = Number(tl.getVariable('System.DefinitionId'));

        this.typeString = tl.getInput('type') || '';
        this.thresholdString = tl.getInput('threshold') || '';
        this.buildStatusString = tl.getInput('buildStatus') || '';

        this.threshold = parseInt(this.thresholdString || '0');

        if (isNaN(this.threshold)) {
            tl.warning(`Invalid threshold value '${this.thresholdString}', using default value 0`);
            this.threshold = 0;
        } else if (this.threshold < 0) {
            tl.warning(`The threshold value '${this.thresholdString}' is less than 0, the value is set to 0`);
            this.threshold = 0;
        }

        switch (this.typeString.toLowerCase()) {
            case TypeEnum.TOTAL_EXECUTED_TESTS.toLowerCase():
                this.type = TypeEnum.TOTAL_EXECUTED_TESTS;
                break;
            case TypeEnum.TOTAL_PASSED_TESTS.toLowerCase():
                this.type = TypeEnum.TOTAL_PASSED_TESTS;
                break;
            case TypeEnum.TOTAL_FAILED_TESTS.toLowerCase():
                this.type = TypeEnum.TOTAL_FAILED_TESTS;
                break;
            case TypeEnum.NEWLY_FAILED_TESTS.toLowerCase():
                this.type = TypeEnum.NEWLY_FAILED_TESTS;
                break;
            default:
                tl.warning(`Invalid value for 'type': ${this.typeString}, using default value 'totalPassed'`);
                this.type = TypeEnum.TOTAL_PASSED_TESTS;
        }

        switch (this.buildStatusString.toLowerCase()) {
            case BuildStatusEnum.FAILED.toLowerCase():
                this.buildStatus = BuildStatusEnum.FAILED;
                break;
            case BuildStatusEnum.UNSTABLE.toLowerCase():
                this.buildStatus = BuildStatusEnum.UNSTABLE;
                break;
            default:
                tl.warning(`Invalid value for 'buildStatus': ${this.buildStatusString}, using default value 'failed'`);
                this.buildStatus = BuildStatusEnum.FAILED;
        }

        tl.debug("Input type: " + this.typeString);
        tl.debug("Test results quality type: " + this.type);

        tl.debug("Input threshold: " + this.thresholdString);
        tl.debug("Test results quality threshold: " + this.threshold);

        tl.debug("Input buildStatus: " + this.buildStatusString);
        tl.debug("Test results quality buildStatus: " + this.buildStatus);
    }

    run = async (): Promise<void> => {
        try {
            let testResultsReferenceBuild = tl.getVariable('PF.ReferenceBuildResult');
            if (!testResultsReferenceBuild) {
                tl.setResult(tl.TaskResult.SucceededWithIssues, `Quality gate '${this.getQualityGateIdentification()}' skipped; please run 'Publish Parasoft Results' task first`);
                return;
            }
            let referenceBuild: ReferenceBuildResult = JSON.parse(<string> testResultsReferenceBuild);
            this.originalReferencePipelineName = referenceBuild.originalPipelineName;
            this.originalReferenceBuildNumber = referenceBuild.originalBuildNumber;

            // To get test results in current build
            const currentTestResults: ShallowTestCaseResult[] = await this.apiClient.getTestResultsByBuild(this.projectName, Number(this.buildId));
            // Check for the test results exist in current build
            if (currentTestResults.length == 0) {
                tl.setResult(tl.TaskResult.SucceededWithIssues, `Quality gate '${this.getQualityGateIdentification()}' skipped; no test results were found in this build`);
                return;
            }

            if (this.type != TypeEnum.NEWLY_FAILED_TESTS) {
                // TODO: CICD-592 Implement the function of quality gate - total
            } else {
                // To get test results in reference build
                const referenceTestResultsInfo: TestResultsInformation = await this.getReferenceTestResults();
                // TODO: CICD-607 Compare and calculate the newly failed tests number
            }
            // TODO: CICD-592/CICD-593 evaluate the quality gate based on number of xxx tests
            // TODO: CICD-594 Display the result under extension tab
        } catch(error) {
            tl.warning(`Failed to process the quality gate '${this.getQualityGateIdentification()}'. See logs for details.`);
            console.error(error);
            return;
        }
    }

    private getReferenceTestResults = async (): Promise<TestResultsInformation> => {
        let referenceTestResultsInfo: TestResultsInformation = {
            testResults: [],
            warningMessage: undefined
        };
        if ((!this.originalReferencePipelineName || this.originalReferencePipelineName == this.pipelineName) && this.originalReferenceBuildNumber == this.buildNumber) {
            referenceTestResultsInfo.warningMessage = 'Using the current build as the reference';
        } else {
            if (!this.originalReferencePipelineName) { // Reference pipeline is not specified
                tl.debug("No reference pipeline has been set; using the current pipeline as reference.");
                referenceTestResultsInfo = await this.getTestResultsInSpecificPipeline(this.definitionId, this.pipelineName);
            } else { // Reference pipeline is specified
                // Get the reference pipeline id based on the reference pipeline name specified in the configuration UI
                const specificPipelines: BuildDefinitionReference[] = await this.apiClient.getSpecificPipelines(this.projectName, this.originalReferencePipelineName);
                // Check for the specific reference pipeline exists
                if (specificPipelines.length == 1) {
                    const specificReferencePipeline = specificPipelines[0];
                    let specificReferencePipelineId : number = Number(specificReferencePipeline.id);
                    referenceTestResultsInfo = await this.getTestResultsInSpecificPipeline(specificReferencePipelineId, specificReferencePipeline.name || '');
                } else if (specificPipelines.length > 1) {
                    referenceTestResultsInfo.warningMessage = `The specified reference pipeline '${this.originalReferencePipelineName}' is not unique`;
                } else {
                    referenceTestResultsInfo.warningMessage = `The specified reference pipeline '${this.originalReferencePipelineName}' could not be found`;
                }
            }
        }
        if (referenceTestResultsInfo.warningMessage) {
            if (referenceTestResultsInfo.isDebugMessage) {
                tl.debug(`${referenceTestResultsInfo.warningMessage} - all failed tests will be treated as new`);
            } else {
                tl.warning(`${referenceTestResultsInfo.warningMessage} - all failed tests will be treated as new`);
            }
        }
        return referenceTestResultsInfo;
    }

    private getTestResultsInSpecificPipeline = async (specificReferencePipelineId: number, pipelineName: string): Promise<TestResultsInformation> => {
        const referenceTestResultsInfo: TestResultsInformation = {
            testResults: [],
            warningMessage: undefined
        };
        const allBuildsInSpecificPipeline = await this.apiClient.getBuildsInSpecificPipeline(this.projectName, specificReferencePipelineId);
        if (!this.originalReferenceBuildNumber) { // Reference build is not specified
            tl.debug(`No reference build has been set; using the last completed build in pipeline '${pipelineName}' as reference.`);
            let defaultTestResults: DefaultTestResults = await this.apiClient.getDefaultTestResults(this.projectName, allBuildsInSpecificPipeline, this.buildId);
            switch (defaultTestResults.status) {
                case DefaultTestResultsStatus.OK:
                    referenceTestResultsInfo.testResults = defaultTestResults.testResults;
                    tl.debug(`Set build '${pipelineName}#${defaultTestResults.buildNumber}' as the default reference build`);
                    return referenceTestResultsInfo;
                case DefaultTestResultsStatus.NO_PREVIOUS_BUILD_WAS_FOUND:
                    referenceTestResultsInfo.warningMessage = `No previous build was found in pipeline '${pipelineName}'`;
                    referenceTestResultsInfo.isDebugMessage = true;
                    return referenceTestResultsInfo;
                case DefaultTestResultsStatus.NO_COMPLETED_BUILD_WAS_FOUND:
                default:
                    referenceTestResultsInfo.warningMessage = `No completed build was found in pipeline '${pipelineName}'`;
                    return referenceTestResultsInfo;
            }
        } else { // Reference build is specified
            const specificReferenceBuilds = allBuildsInSpecificPipeline.filter(build => {
                return build.buildNumber == this.originalReferenceBuildNumber;
            });
            if (specificReferenceBuilds.length > 1) {
                referenceTestResultsInfo.warningMessage = `The specified reference build '${pipelineName}#${this.originalReferenceBuildNumber}' is not unique`;
                return referenceTestResultsInfo;
            }
            if (specificReferenceBuilds.length == 0) {
                referenceTestResultsInfo.warningMessage = `The specified reference build '${pipelineName}#${this.originalReferenceBuildNumber}' could not be found`;
                return referenceTestResultsInfo;
            }
            // When specificReferenceBuilds.length equals 1
            const specificReferenceBuild = specificReferenceBuilds[0];
            // Check for the test results exist in the specific reference build
            const testResults = await this.apiClient.getTestResultsByBuild(this.projectName, <number> specificReferenceBuild.id);
            referenceTestResultsInfo.testResults = testResults;
            return referenceTestResultsInfo;
        }
    }

    private getQualityGateIdentification() {
        let typeText: string;
        switch (this.type) {
            case TypeEnum.TOTAL_PASSED_TESTS:
                typeText = 'Total passed tests';
                break;
            case TypeEnum.TOTAL_FAILED_TESTS:
                typeText = 'Total failed tests';
                break;
            case TypeEnum.TOTAL_EXECUTED_TESTS:
                typeText = 'Total executed tests';
                break;
            case TypeEnum.NEWLY_FAILED_TESTS:
                typeText = 'Newly failed tests';
        }
        return "Type: " + typeText + ", Threshold: " + this.threshold;
    }
}