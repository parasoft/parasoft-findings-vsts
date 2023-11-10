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
import { Build, BuildArtifact, BuildDefinitionReference, BuildResult} from 'azure-devops-node-api/interfaces/BuildInterfaces';
import * as JSZip from 'jszip';
import fetch, { Headers, RequestInit } from 'node-fetch';

export interface FileEntry {
    name: string,
    artifactName: string,
    filePath: string,
    buildId: number,
    contentsPromise: Promise<string>
}

export enum FileSuffixEnum {
    SARIF_SUFFIX = "-pf-sast.sarif",
    COBERTURA_SUFFIX = "-cobertura.xml"
}

export interface DefaultBuildReportResults {
    status: DefaultBuildReportResultsStatus,
    buildId: number | undefined,
    buildNumber: string | undefined,
    reports: FileEntry[] | undefined
}

export enum DefaultBuildReportResultsStatus {
    OK,
    NO_SUCCESSFUL_BUILD,
    NO_PARASOFT_RESULTS_IN_PREVIOUS_SUCCESSFUL_BUILDS,
    NO_PREVIOUS_BUILD_WAS_FOUND
}

export class BuildAPIClient {
    private readonly accessToken: string;
    private readonly buildApi: Promise<BuildApi.IBuildApi>;

    constructor() {
        let orgUrl = tl.getVariable('System.TeamFoundationCollectionUri') || '';
        let auth = tl.getEndpointAuthorization('SystemVssConnection', false);
        this.accessToken = auth?.parameters['AccessToken'] || '';
        let authHandler = azdev.getPersonalAccessTokenHandler(this.accessToken);
        let connection = new azdev.WebApi(orgUrl, authHandler);
        this.buildApi = connection.getBuildApi();
    }

    async getSpecificPipelines(
        projectName: string,
        definitionName: string
        ): Promise<BuildDefinitionReference[]> {

        return (await this.buildApi).getDefinitions(projectName, definitionName);
    }

    async getBuildsForSpecificPipeline(
        projectName: string,
        definitionId: number
        ): Promise<Build[]> {

        return (await this.buildApi).getBuilds(projectName, [definitionId]);
    }

    async getBuildArtifact(
        projectName: string,
        buildId: number,
        artifactName: string
        ): Promise<BuildArtifact> {

        return (await this.buildApi).getArtifact(projectName, buildId, artifactName);
    }

    async getDefaultBuildReports(
        builds: Build[],
        projectName: string,
        artifactName: string,
        fileSuffix: FileSuffixEnum,
        currentBuildId: string
        ): Promise<DefaultBuildReportResults> {

        let defaultBuildReportResults: DefaultBuildReportResults = {
            status: DefaultBuildReportResultsStatus.OK,
            buildId: undefined,
            buildNumber: undefined,
            reports: undefined
        }

        let fileEntries: FileEntry[] = [];
        if (builds.length == 1 && builds[0].id?.toString() == currentBuildId) { // only include current build
            defaultBuildReportResults.status = DefaultBuildReportResultsStatus.NO_PREVIOUS_BUILD_WAS_FOUND;
            return Promise.resolve(defaultBuildReportResults);
        }

        const allSuccessfulBuilds = builds.filter(build => {
            return build.result == BuildResult.Succeeded;
        });

        if (allSuccessfulBuilds.length > 0) {
            for (let index = 0; index < allSuccessfulBuilds.length; index++) {
                let lastSuccessfulBuildId: number = Number(allSuccessfulBuilds[index].id);

                // Check for results exist in the default reference build
                const artifact: BuildArtifact = await (await this.buildApi).getArtifact(projectName, lastSuccessfulBuildId, artifactName);
                if (artifact) {
                    fileEntries = await this.getBuildReportsWithId(artifact, lastSuccessfulBuildId, fileSuffix);
                    defaultBuildReportResults.reports = fileEntries;
                    defaultBuildReportResults.buildId = lastSuccessfulBuildId;
                    defaultBuildReportResults.buildNumber = allSuccessfulBuilds[index].buildNumber;
                    break;
                }
            }
            if (fileEntries.length == 0) {
                defaultBuildReportResults.status = DefaultBuildReportResultsStatus.NO_PARASOFT_RESULTS_IN_PREVIOUS_SUCCESSFUL_BUILDS;
            }
        } else {
            defaultBuildReportResults.status = DefaultBuildReportResultsStatus.NO_SUCCESSFUL_BUILD
        }

        return Promise.resolve(defaultBuildReportResults);
    }

    async getBuildReportsWithId(
        artifact: BuildArtifact,
        buildId: number,
        fileSuffix: FileSuffixEnum
        ): Promise<FileEntry[]> {
        const requestUrl = artifact.resource?.downloadUrl || '';
        const arrayBuffer = await this.getArtifactContentZip(requestUrl);
        if (arrayBuffer) {
            const zip = JSZip.loadAsync(arrayBuffer);
            return Object
                .values((await zip).files)
                .filter(entry => !entry.dir && entry.name.endsWith(fileSuffix))
                .map(entry => ({
                    name:            entry.name.replace(`${artifact.name}/`, ''),
                    artifactName:    artifact.name || '',
                    filePath:        entry.name.replace(`${artifact.name}/`, ''),
                    buildId:         buildId,
                    contentsPromise: entry.async('string')
                }));
        }
        return [];
    }

    async getArtifactContentZip(downloadUrl: string): Promise<ArrayBuffer | undefined> {
        tl.debug(`Downloading artifact: ${downloadUrl}`);
        const acceptType = "application/zip";
        const acceptHeaderValue = `${acceptType};excludeUrls=true;enumsAsNumbers=true;msDateFormat=true;noArrayWrap=true`;

        const headers = new Headers();
        headers.append("Accept", acceptHeaderValue);
        headers.append("Authorization", "Bearer " + this.accessToken);
        headers.append("Content-Type", "application/zip");
        headers.append("X-VSS-ReauthenticationAction", "Suppress");

        const options: RequestInit = {
            method: "GET",
            headers: headers
        };
        try {
            const response = await fetch(downloadUrl, options);
            if (response.status === undefined || response.status < 200 || response.status >= 300) {
                tl.warning(`An error(${response.status}) occurred while attempting to download artifact from: ${downloadUrl}`);
                return undefined;
            }
            return response.arrayBuffer();
        } catch (error) {
            tl.warning(`Download artifact error: ${downloadUrl}`);
            console.error(error);
            return undefined;
        }
    }
}