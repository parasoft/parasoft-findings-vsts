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
import { Build, BuildDefinitionReference, BuildResult } from 'azure-devops-node-api/interfaces/BuildInterfaces';
import { ShallowTestCaseResult } from 'azure-devops-node-api/interfaces/TestInterfaces';

export interface DefaultTestResults {
    status: DefaultTestResultsStatus,
    buildId: number | undefined,
    buildNumber: string | undefined,
    testResults: ShallowTestCaseResult[]
}

export enum DefaultTestResultsStatus {
    OK,
    NO_COMPLETED_BUILD_WAS_FOUND,
    NO_PREVIOUS_BUILD_WAS_FOUND
}

export class APIClient {
    private readonly accessToken: string;
    private readonly buildApi: Promise<BuildApi.IBuildApi>;
    private readonly testApi: Promise<TestApi.ITestApi>;

    constructor() {
        let orgUrl = tl.getVariable('System.TeamFoundationCollectionUri') || '';
        let auth = tl.getEndpointAuthorization('SystemVssConnection', false);
        this.accessToken = auth?.parameters['AccessToken'] || '';
        let authHandler = azdev.getPersonalAccessTokenHandler(this.accessToken);
        let connection = new azdev.WebApi(orgUrl, authHandler);
        this.buildApi = connection.getBuildApi();
        this.testApi = connection.getTestApi();
    }

    async getSpecificPipelines(
        projectName: string,
        definitionName: string
        ): Promise<BuildDefinitionReference[]> {

        return (await this.buildApi).getDefinitions(projectName, definitionName);
    }

    async getBuildsInSpecificPipeline(
        projectName: string,
        definitionId: number
        ): Promise<Build[]> {

        return (await this.buildApi).getBuilds(projectName, [definitionId]);
    }

    async getTestResultsByBuild(
        projectName: string,
        buildId: number
        ): Promise<ShallowTestCaseResult[]> {

        return (await this.testApi).getTestResultsByBuild(projectName, buildId);
    }

    async getDefaultTestResults(
        projectName: string,
        builds: Build[],
        currentBuildId: string
        ): Promise<DefaultTestResults> {
        const defaultBuildReportResults: DefaultTestResults = {
            status: DefaultTestResultsStatus.OK,
            buildId: undefined,
            buildNumber: undefined,
            testResults: []
        };

        if (builds.length == 1 && builds[0].id?.toString() == currentBuildId) { // when only one build exists and it happens to be the current build
            defaultBuildReportResults.status = DefaultTestResultsStatus.NO_PREVIOUS_BUILD_WAS_FOUND;
            return defaultBuildReportResults;
        }

        const allCompletedBuilds = builds.filter(build => {
            return build.result != undefined && build.result != BuildResult.Canceled && build.result != BuildResult.None;
        });
        if (allCompletedBuilds.length <= 0) {
            defaultBuildReportResults.status = DefaultTestResultsStatus.NO_COMPLETED_BUILD_WAS_FOUND;
            return defaultBuildReportResults;
        }

        let lastCompletedBuild: Build = allCompletedBuilds[0];
        const testResults: ShallowTestCaseResult[] = await this.getTestResultsByBuild(projectName, <number> lastCompletedBuild.id);
        defaultBuildReportResults.testResults = testResults;
        defaultBuildReportResults.buildId = lastCompletedBuild.id;
        defaultBuildReportResults.buildNumber = lastCompletedBuild.buildNumber;
        return defaultBuildReportResults;
    }
}