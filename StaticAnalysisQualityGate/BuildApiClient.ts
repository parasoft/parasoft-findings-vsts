import * as tl from 'azure-pipelines-task-lib/task';
import * as azdev from "azure-devops-node-api";
import * as BuildApi from "azure-devops-node-api/BuildApi";
import { Build, BuildArtifact, BuildResult } from 'azure-devops-node-api/interfaces/BuildInterfaces';
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
    SARIF_SUFFIX = ".sarif",
    // COBERTURA_SUFFIX = "-cobertura.xml"
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
        fileSuffix: FileSuffixEnum
        ): Promise<FileEntry[]> {
        let fileEntries: FileEntry[] = [];
        const allSuccessfulBuilds = builds.filter(build => {
            return build.result == BuildResult.Succeeded;
        });

        if (allSuccessfulBuilds.length > 0) {
            let hasResult: boolean = false;
            for (let index = 0; index < allSuccessfulBuilds.length; index++) {
                let lastSuccessfulBuildId: number = Number(allSuccessfulBuilds[index].id);

                // Check for results exist in the default reference build
                const artifact: BuildArtifact = await (await this.buildApi).getArtifact(projectName, lastSuccessfulBuildId, artifactName);
                if (artifact) {
                    fileEntries = await this.getSpecificBuildReports(artifact, lastSuccessfulBuildId, fileSuffix);
                    hasResult = true;
                    tl.debug(`Found default reference build with build id: ${lastSuccessfulBuildId}`);
                    break;
                }
            }
            if (!hasResult) {
                tl.debug("Can not find a default reference build which has Parasoft results");
            }
        } else {
            tl.debug("Can not find a default reference build which is successful");
        }

        return Promise.resolve(fileEntries);
    }

    async getSpecificBuildReports(
        artifact: BuildArtifact,
        buildId: number,
        fileSuffix: FileSuffixEnum
        ): Promise<FileEntry[]> {
        const requestUrl = artifact.resource?.downloadUrl || '';
        const arrayBuffer = this.getArtifactContentZip(requestUrl);
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
                }))
                .flat();
    }

    async getArtifactContentZip(downloadUrl: string): Promise<ArrayBuffer> {
        tl.debug(`Downloading the artifact content from ${downloadUrl}`);
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
        const response = await fetch(downloadUrl, options);

        return response.arrayBuffer();
    }
}