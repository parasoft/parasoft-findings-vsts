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
    readonly accessToken: string;
    readonly buildApi: Promise<BuildApi.IBuildApi>;

    constructor() {
        let orgUrl = tl.getVariable('System.TeamFoundationCollectionUri') || '';
        let auth = tl.getEndpointAuthorization('SystemVssConnection', false);
        this.accessToken = auth?.parameters['AccessToken'] || '';

        tl.debug("Connecting to the Azure DevOps Client.");
        let authHandler = azdev.getPersonalAccessTokenHandler(this.accessToken);
        let connection = new azdev.WebApi(orgUrl, authHandler);
        tl.debug("Connect to the Azure DevOps Client successfully.");
        this.buildApi = connection.getBuildApi();
    }

    async getBuildsForSpecificPipeline(
        projectName: string,
        definitionId: number
        ): Promise<Build[]> {
        return (await this.buildApi).getBuilds(projectName, [definitionId])
    }

    async getBuildArtifact(
        projectName: string,
        buildId: number,
        artifactName: string
        ): Promise<BuildArtifact> {
        return (await this.buildApi).getArtifact(projectName, buildId, artifactName);
    }
    
    async getDefaultBuildReports(
        builds: Promise<Build[]>,
        projectName: string,
        artifactName: string,
        fileSuffix: FileSuffixEnum
    ): Promise<FileEntry[]> {
        tl.debug("Obtaining default reference build");
        let fileEntryArr:FileEntry[] = [];
        const allSucceededBuilds = (await builds).filter(build => {
            return build.result === BuildResult.Succeeded;
        });
    
        if (allSucceededBuilds.length > 0) {
            let hasResult: boolean = false;
    
            for (let index = 0; index < allSucceededBuilds.length; index++) {
                let lastSucceededBuildId: number = Number(allSucceededBuilds[index].id);
    
                // Check for results exist in the default reference build
                const artifact: Promise<BuildArtifact> = (await this.buildApi)
                                                            .getArtifact(projectName, lastSucceededBuildId, artifactName);
                if (await artifact) {
                    tl.debug(`Using default reference build ${lastSucceededBuildId}`);
    
                    hasResult = true;
                    fileEntryArr = await this.getSpecificBuildReports(lastSucceededBuildId, projectName, artifactName, fileSuffix);
                    break;
                }
            }
            if (!hasResult) {
                tl.warning("No reference results found in the default reference build");
            }
        } else {
            tl.warning("No default reference builds with successful results found");
        }
        return Promise.resolve(fileEntryArr);
    }
    
    async getSpecificBuildReports (
        referenceBuildId: number,
        projectName: string,
        artifactName: string,
        fileSuffix: FileSuffixEnum
        ): Promise<FileEntry[]> {
        return this.getArtifactFileEntries(referenceBuildId, projectName, artifactName, fileSuffix);
    }
    
    async getArtifactFileEntries(
        buildId: number,
        projectName: string,
        artifactName: string,
        fileSuffix: FileSuffixEnum
        ): Promise<FileEntry[]> {
        const files = (await this.buildApi)
                        .getArtifact(projectName, buildId, artifactName)
                        .then(async (artifact) => {
            const requestUrl = artifact.resource?.downloadUrl || '';
            const arrayBuffer = this.getArtifactContentZip(requestUrl);
            const zip = JSZip.loadAsync(arrayBuffer);
            return Object
                    .values((await zip).files)
                    .filter(entry => !entry.dir && entry.name.endsWith(fileSuffix))
                    .map(entry => ({
                        name:            entry.name.replace(`${artifactName}/`, ''),
                        artifactName:    artifactName || '',
                        filePath:        entry.name.replace(`${artifactName}/`, ''),
                        buildId:         buildId,
                        contentsPromise: entry.async('string'),
                    }))
        });
    
        return (await files).flat();
    }

    async getArtifactContentZip(
        downloadUrl: string
        ): Promise<ArrayBuffer> {
        tl.debug(`Downloading the artifact content zip from ${downloadUrl}.`);
    
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
    
        tl.debug(`Download the artifact content zip from ${downloadUrl} successfully.`);
        return response.arrayBuffer();
    }
}