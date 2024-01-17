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
import * as azdev from "azure-devops-node-api";
import * as BuildApi from "azure-devops-node-api/BuildApi";
import * as TestApi from "azure-devops-node-api/TestApi";
import { Build, BuildDefinitionReference } from 'azure-devops-node-api/interfaces/BuildInterfaces';
import { ShallowTestCaseResult, TestResultsDetails } from 'azure-devops-node-api/interfaces/TestInterfaces';

export class APIClient {
    private readonly accessToken: string;
    private readonly buildApi: Promise<BuildApi.IBuildApi>;
    private readonly testApi: Promise<TestApi.ITestApi>;
    private readonly projectName: string;

    constructor() {
        this.projectName = tl.getVariable('System.TeamProject') || '';
        const orgUrl = tl.getVariable('System.TeamFoundationCollectionUri') || '';
        const auth = tl.getEndpointAuthorization('SystemVssConnection', false);
        this.accessToken = auth?.parameters['AccessToken'] || '';
        const authHandler = azdev.getPersonalAccessTokenHandler(this.accessToken);
        const connection = new azdev.WebApi(orgUrl, authHandler);
        this.buildApi = connection.getBuildApi();
        this.testApi = connection.getTestApi();
    }

    async getPipelinesByName(definitionName: string): Promise<BuildDefinitionReference[]> {
        return (await this.buildApi).getDefinitions(this.projectName, definitionName);
    }

    async getBuildsOfPipelineById(definitionId: number): Promise<Build[]> {
        return (await this.buildApi).getBuilds(this.projectName, [definitionId]);
    }

    async getTestResultsByBuildId(buildId: number): Promise<ShallowTestCaseResult[]> {
        return (await this.testApi).getTestResultsByBuild(this.projectName, buildId);
    }

    async getTestResultsByReleaseIdAndReleaseEnvId(releaseId: number, releaseEnvId: number): Promise<ShallowTestCaseResult[]> {
        const testResultsDetails: TestResultsDetails = await (await this.testApi).getTestResultDetailsForRelease(this.projectName, releaseId, releaseEnvId);
        return this.mappingTestResultsDetailsToShallowTestCaseResult(testResultsDetails);
    }

    mappingTestResultsDetailsToShallowTestCaseResult(testResultsDetails: TestResultsDetails): ShallowTestCaseResult[] {
        let shallowTestCaseResults: ShallowTestCaseResult[] = [];
        if (testResultsDetails.resultsForGroup) {
            testResultsDetails.resultsForGroup.forEach((testGroup) => {
                testGroup?.results?.forEach((test) => {
                    const shallowTestCaseResult = {
                        automatedTestName: test.automatedTestName,
                        automatedTestStorage: test.automatedTestStorage,
                        durationInMs: test.durationInMs,
                        id: test.id,
                        outcome: test.outcome,
                        priority: test.priority,
                        refId: test.testCaseReferenceId,
                        testCaseTitle: test.testCaseTitle
                    }
                    shallowTestCaseResults.push(shallowTestCaseResult);
                });
            });
        }
        return shallowTestCaseResults;
    }
}