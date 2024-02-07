/*
 * Copyright 2024 Parasoft Corporation
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
import * as path from "path";
import * as fs from 'fs';
import * as tl from "azure-pipelines-task-lib";
import * as uuid from "uuid";
import { BuildAPIClient, FileEntry } from './BuildApiClient';
import { BuildArtifact, BuildResult } from 'azure-devops-node-api/interfaces/BuildInterfaces';
import {ParaReportPublishUtils} from "./ParaReportPublishUtils";

const enum BaselineStateEnum {
    NEW = 'new',
    UNCHANGED = 'unchanged'
}

interface ReferenceBuildInformation {
    fileEntries: FileEntry[],
    staticAnalysis: {
        pipelineName: string | undefined,
        buildId: number | undefined,
        buildNumber:  string | undefined,
        warningMessage: string | undefined
    },
    isDebugMessage: boolean
}

interface ReferenceBuildResult {
    referencePipelineInput: string,
    referenceBuildInput: string,
    staticAnalysis?: {
        pipelineName: string | undefined,
        buildId: number | undefined,
        buildNumber:  string | undefined,
        warningMessage: string | undefined
    }
}

export class StaticAnalysisReportService {
    buildClient: BuildAPIClient;
    defaultWorkingDirectory: string;

    pipelineName: string;
    buildNumber: string;
    buildId: string;
    definitionId: number;

    previousReferenceBuildResult: string | undefined;
    referenceBuildResult: ReferenceBuildResult;

    constructor() {
        this.buildClient = new BuildAPIClient();
        this.defaultWorkingDirectory = tl.getVariable('System.DefaultWorkingDirectory') || '';

        // Get predefined variables in Azure DevOps pipeline
        this.buildNumber = tl.getVariable('Build.BuildNumber') || '';
        this.buildId = tl.getVariable('Build.BuildId') || '';
        this.pipelineName = tl.getVariable('Build.DefinitionName') || '';
        this.definitionId = Number(tl.getVariable('System.DefinitionId'));

        // Get previous reference build result to compare with that in current build
        this.previousReferenceBuildResult = tl.getVariable('PF.ReferenceBuildResult');
        // Get and save the reference build information as a variable for subsequent quality gate tasks to use
        const referencePipelineInput = tl.getInput('referencePipeline') || '';
        const referenceBuildInput = tl.getInput('referenceBuild') || '';
        this.referenceBuildResult = {
            referencePipelineInput: referencePipelineInput,
            referenceBuildInput: referenceBuildInput
        }
        tl.setVariable('PF.ReferenceBuildResult', JSON.stringify(this.referenceBuildResult));

        tl.debug('referencePipeline: ' + referencePipelineInput);
        tl.debug('referenceBuild: ' + referenceBuildInput);
    }

     async processSarifResults(sarifReports: string[]): Promise<void> {
        let referenceSarifReports;
        // If the previous reference build result is different from the current reference build result
        if (this.previousReferenceBuildResult != JSON.stringify(this.referenceBuildResult)) {
            // Get all sarif reports from artifact in current build
            const sarifReportsInArtifact = await this.buildClient.getSarifReportsByBuildId(Number(this.buildId));
            if (sarifReportsInArtifact.length > 0) {
                referenceSarifReports = await this.getSarifReportsOfReferenceBuild();
                await this.updateSarifReportsInArtifact(sarifReportsInArtifact, referenceSarifReports);
            }
        }
        if (sarifReports.length > 0) {
            if(!referenceSarifReports) {
                referenceSarifReports = await this.getSarifReportsOfReferenceBuild();
            }
            for (const sarifReport of sarifReports) {
                let currentSarifContentString = fs.readFileSync(sarifReport, 'utf8');
                let currentSarifContentJson = JSON.parse(currentSarifContentString);
                currentSarifContentJson = this.checkAndAddUnbViolIdForSarifReport(currentSarifContentJson);

                const referenceSarifReport = referenceSarifReports.find((referenceSarifReport) => referenceSarifReport.name == 'SarifContainer/' + path.basename(sarifReport));
                await this.updateBaselineState(currentSarifContentJson, referenceSarifReport);

                currentSarifContentString = JSON.stringify(currentSarifContentJson);
                fs.writeFileSync(sarifReport, currentSarifContentString, 'utf8');
                tl.uploadArtifact("SarifContainer", sarifReport, "CodeAnalysisLogs");
            }
            // Pass the reference build and static analysis info to subsequent static analysis quality gate tasks
            tl.setVariable('PF.ReferenceBuildResult', JSON.stringify(this.referenceBuildResult));
        }
    }

     processParasoftSarifReport = (report: string): string => {
        const contentString = fs.readFileSync(report, 'utf8');
        const contentJson = JSON.parse(contentString);

        /* eslint-disable @typescript-eslint/no-explicit-any */
        contentJson.runs?.forEach((run: any) => {
            run.results?.forEach((result: any) => {
                result.locations?.forEach((location: any) => {
                    const relativeUri = this.getRelativeURI(location);
                    if (relativeUri) {
                        // Overwrite uri to be relative path
                        location.physicalLocation.artifactLocation.uri = relativeUri;
                    }
                });
            });
        });
        /* eslint-enable @typescript-eslint/no-explicit-any */
        const updatedContentString  = JSON.stringify(contentJson);
        const updatedReportPath = ParaReportPublishUtils.generateReportNameWithPFSuffix(this.generateUniqueFileName(report), ParaReportPublishUtils.SARIF_SUFFIX);
        fs.writeFileSync(updatedReportPath, updatedContentString , 'utf8');
        return updatedReportPath;
    }

    /**
     * Generate unique file name according to the source path.
     *
     * @param sourcePath The source path for the file
     * @returns A unique file name generated according to the source path
     *
     * For example:
     * sourcePath: D:\build\reports\cpptest-std\static_1\report.xml
     * returns: D__build_reports_cpptest-std_static_0x5f_1_report.xml
     */
    generateUniqueFileName = (sourcePath: string): string => {
        if (!sourcePath) {
            return "";
        }
        const fileName = path.basename(sourcePath);
        const nFileName = sourcePath.replace(/^[/\\]+/, '') // Remove any leading slashes
                                    .replace(/_/g, '_0x5f_') // Replace "_" with prefixed hexadecimal "_0x5f_"
                                    .replace(/[:/\\]/g, '_'); // Replace ":" and any slashes with "_"
        return sourcePath.replace(fileName, nFileName);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private checkAndAddUnbViolIdForSarifReport = (sarifContentJson: any): string => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sarifContentJson.runs?.forEach((run: any) => {
            const unbViolIdMap: Map<string, number> = new Map();
            if (run.results) {
                for (let i = 0; i < run.results.length; i++) {
                    if (run.results[i].partialFingerprints && run.results[i].partialFingerprints.unbViolId) {
                        break;
                    }
                    if (!run.results[i].partialFingerprints) {
                        run.results[i].partialFingerprints = {};
                    }
                    let order: number = 0;
                    const unbViolId = this.generateUnbViolId(run.results[i], order);
                    if (unbViolIdMap.has(unbViolId)) {
                        order = <number> unbViolIdMap.get(unbViolId);
                        run.results[i].partialFingerprints.unbViolId = this.generateUnbViolId(run.results[i], order);
                    } else {
                        run.results[i].partialFingerprints.unbViolId = unbViolId;
                    }
                    unbViolIdMap.set(unbViolId, order + 1);
                }
            }
        });
        return sarifContentJson;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private generateUnbViolId = (result: any, order: number): string => {
        const namespace = '6af5b03d-5276-49ef-bfed-d445f2752b02';
        const violType = result.partialFingerprints?.violType || '';
        const ruleId = result.ruleId || '';
        const msg = result.message?.text || '';
        const severity = result.level || '';
        const lineHash = result.partialFingerprints?.lineHash || '';
        const uri = result.locations?.[0]?.physicalLocation?.artifactLocation?.uri || '';

        return uuid.v5(violType + ruleId + msg + severity + lineHash + uri + order, namespace);
    }

    private getSarifReportsOfReferenceBuild = async (): Promise<FileEntry[]> => {
        let referenceBuildInfo: ReferenceBuildInformation = {
            fileEntries: [],
            staticAnalysis: {
                pipelineName: undefined,
                buildId: undefined,
                buildNumber: undefined,
                warningMessage: undefined
            },
            isDebugMessage: false
        };
        if ((!this.referenceBuildResult.referencePipelineInput || this.referenceBuildResult.referencePipelineInput == this.pipelineName) && this.referenceBuildResult.referenceBuildInput == this.buildNumber) {
            referenceBuildInfo.staticAnalysis.warningMessage = 'Using the current build as the reference';
        } else {
            if (!this.referenceBuildResult.referencePipelineInput) { // Reference pipeline is not specified
                tl.debug("No reference pipeline has been set; using the current pipeline as reference.");
                referenceBuildInfo = await this.getSarifReportOfPipeline(this.definitionId, this.pipelineName);
            } else { // Reference pipeline is specified
                // Get the reference pipeline id based on the reference pipeline name specified in the configuration UI
                const pipelines = await this.buildClient.getPipelinesByName(this.referenceBuildResult.referencePipelineInput);
                // Check for the specific reference pipeline exists
                if (pipelines.length == 1) {
                    const specificReferencePipeline = pipelines[0];
                    const specificReferencePipelineId: number = Number(specificReferencePipeline.id);
                    referenceBuildInfo = await this.getSarifReportOfPipeline(specificReferencePipelineId, specificReferencePipeline.name || '');
                } else if (pipelines.length > 1) {
                    referenceBuildInfo.staticAnalysis.warningMessage = `The specified reference pipeline '${this.referenceBuildResult.referencePipelineInput}' is not unique`;
                } else {
                    referenceBuildInfo.staticAnalysis.warningMessage = `The specified reference pipeline '${this.referenceBuildResult.referencePipelineInput}' could not be found`;
                }
            }
        }
        if (referenceBuildInfo.staticAnalysis.warningMessage) {
            if (referenceBuildInfo.isDebugMessage) {
                tl.debug(`${referenceBuildInfo.staticAnalysis.warningMessage} - all issues will be treated as new`);
            } else {
                tl.warning(`${referenceBuildInfo.staticAnalysis.warningMessage} - all issues will be treated as new`);
            }
            referenceBuildInfo.staticAnalysis.warningMessage += ' - all issues were treated as new';
        }
        this.referenceBuildResult.staticAnalysis = referenceBuildInfo.staticAnalysis;
        return Promise.resolve(referenceBuildInfo.fileEntries);
    }

    private async getSarifReportOfPipeline(pipelineId: number, pipelineName: string): Promise<ReferenceBuildInformation> {
        const referenceBuildInfo: ReferenceBuildInformation = {
            fileEntries: [],
            staticAnalysis: {
                pipelineName: pipelineName,
                buildId: undefined,
                buildNumber: undefined,
                warningMessage: undefined
            },
            isDebugMessage: false
        };
        const buildsOfPipeline = await this.buildClient.getBuildsOfPipelineById(pipelineId);
        if (!this.referenceBuildResult.referenceBuildInput) { // Reference build is not specified
            tl.debug(`No reference build has been set; using the last successful build in pipeline '${pipelineName}' as reference.`);
            if (buildsOfPipeline.length == 1 && buildsOfPipeline[0].id?.toString() == this.buildId) { // only include current build
                referenceBuildInfo.staticAnalysis.warningMessage = `No previous build was found in pipeline '${pipelineName}'`;
                referenceBuildInfo.isDebugMessage = true;
                return referenceBuildInfo;
            } else {
                const allSuccessfulBuilds = buildsOfPipeline.filter(build => {
                    return build.result == BuildResult.Succeeded;
                });
                if (allSuccessfulBuilds.length > 0) {
                    let buildId: number | undefined, buildNumber: string | undefined;
                    let sarifReports: FileEntry[] = [];
                    // Use the last successful build with Parasoft Sarif results as the default reference build
                    for (let index = 0; index < allSuccessfulBuilds.length; index++) {
                        const lastSuccessfulBuildId: number = Number(allSuccessfulBuilds[index].id);
                        const artifact: BuildArtifact = await this.buildClient.getSarifArtifactOfBuildById(lastSuccessfulBuildId);
                        if (artifact) {
                            sarifReports = await this.buildClient.getSarifReportsOfArtifact(artifact);
                            buildId = lastSuccessfulBuildId;
                            buildNumber = allSuccessfulBuilds[index].buildNumber;
                            break;
                        }
                    }
                    if (sarifReports.length == 0) {
                        referenceBuildInfo.staticAnalysis.warningMessage = `No Parasoft static analysis results were found in any of the previous successful builds in pipeline '${pipelineName}'`;
                        return referenceBuildInfo;
                    }
                    referenceBuildInfo.fileEntries = sarifReports;
                    referenceBuildInfo.staticAnalysis.buildId = buildId;
                    referenceBuildInfo.staticAnalysis.buildNumber = buildNumber;
                    tl.debug(`Set build '${pipelineName}#${buildNumber}' as the default reference build`);
                    return referenceBuildInfo;
                } else {
                    referenceBuildInfo.staticAnalysis.warningMessage = `No successful build was found in pipeline '${pipelineName}'`;
                    return referenceBuildInfo;
                }
            }
        } else { // Reference build is specified
            const referenceBuilds = buildsOfPipeline.filter(build => {
                return build.buildNumber == this.referenceBuildResult.referenceBuildInput;
            });
            // Check for uniqueness of the reference build
            if (referenceBuilds.length > 1) {
                referenceBuildInfo.staticAnalysis.warningMessage = `The specified reference build '${pipelineName}#${this.referenceBuildResult.referenceBuildInput}' is not unique`;
                return referenceBuildInfo;
            }
            // Check for the existence of the reference build
            if (referenceBuilds.length == 0) {
                referenceBuildInfo.staticAnalysis.warningMessage = `The specified reference build '${pipelineName}#${this.referenceBuildResult.referenceBuildInput}' could not be found`;
                return referenceBuildInfo;
            }
            const referenceBuild = referenceBuilds[0];
            // Check for the successful or partially-successful results exist in the specific reference build
            if (referenceBuild.result != BuildResult.Succeeded && referenceBuild.result != BuildResult.PartiallySucceeded) {
                referenceBuildInfo.staticAnalysis.warningMessage = `The specified reference build '${pipelineName}#${this.referenceBuildResult.referenceBuildInput}' could not be used. Only successful or unstable builds are valid references`;
                return referenceBuildInfo;
            }
            const referenceBuildId: number = Number(referenceBuild.id);
            // Check for the existence of Parasoft Sarif artifact in reference build
            const artifact: BuildArtifact = await this.buildClient.getSarifArtifactOfBuildById(referenceBuildId);
            if (!artifact) {
                referenceBuildInfo.staticAnalysis.warningMessage = `No Parasoft static analysis results were found in the specified reference build: '${pipelineName}#${this.referenceBuildResult.referenceBuildInput}'`;
                return referenceBuildInfo;
            }
            // Check for the existence of Parasoft Sarif report in reference build
            referenceBuildInfo.fileEntries = await this.buildClient.getSarifReportsOfArtifact(artifact);
            if (referenceBuildInfo.fileEntries.length == 0) {
                referenceBuildInfo.staticAnalysis.warningMessage = `No Parasoft static analysis results were found in the specified reference build: '${pipelineName}#${this.referenceBuildResult.referenceBuildInput}'`;
                return referenceBuildInfo;
            }
            // Set the reference build
            tl.debug(`Retrieved Parasoft static analysis results from the reference build '${pipelineName}#${this.referenceBuildResult.referenceBuildInput}'`);
            referenceBuildInfo.staticAnalysis.buildId = referenceBuildId;
            referenceBuildInfo.staticAnalysis.buildNumber = this.referenceBuildResult.referenceBuildInput;
            return referenceBuildInfo;
        }
    }

    /* eslint-disable @typescript-eslint/no-explicit-any */
    private updateBaselineState = async (currentSarifContentJson: any, referenceSarifReport: FileEntry | undefined): Promise<string> => {
        const referenceUnbViolIds: string[] = await this.getUnbViolIdsFromReferenceSarifReport(referenceSarifReport);
        currentSarifContentJson.runs?.forEach((run: any) => {
            run.results?.forEach((result: any) => {
                const unbViolId: string = result.partialFingerprints?.unbViolId;
                if (unbViolId && referenceUnbViolIds.includes(unbViolId)) {
                    result.baselineState = BaselineStateEnum.UNCHANGED;
                } else {
                    result.baselineState = BaselineStateEnum.NEW;
                }
            })
        })
        return currentSarifContentJson;
    }
    /* eslint-enable @typescript-eslint/no-explicit-any */

    private getUnbViolIdsFromReferenceSarifReport = async (referenceSarifReport: FileEntry | undefined): Promise<string[]> => {
        if (!referenceSarifReport) {
            return [];
        }
        const referenceSarifContentString: string = await referenceSarifReport.contentsPromise;
        /* eslint-disable @typescript-eslint/no-explicit-any */
        const referenceSarifContentJson: any = JSON.parse(referenceSarifContentString);
        const referenceUnbViolIds: string[] = [];
        referenceSarifContentJson.runs?.forEach((run: any) => {
            run.results?.forEach(async (result: any) => {
                const unbViolId: string = result.partialFingerprints?.unbViolId;
                if (unbViolId) {
                    referenceUnbViolIds.push(unbViolId);
                }
            })
        })
        /* eslint-enable @typescript-eslint/no-explicit-any */
        return referenceUnbViolIds;
    }

    private updateSarifReportsInArtifact = async (sarifReportsInArtifact: FileEntry[], referenceSarifReports: FileEntry[]): Promise<void> => {
        // Create temp folder to store the sarif reports
        const parasoftFindingsTempFolder = path.join(ParaReportPublishUtils.getTempFolder(), 'ParasoftFindings/SarifContainer');
        fs.mkdirSync(parasoftFindingsTempFolder, {recursive: true});

        for (const sarifReport of sarifReportsInArtifact) {
            let currentSarifContentString = await sarifReport.contentsPromise;
            const currentSarifContentJson = JSON.parse(currentSarifContentString);

            const referenceSarifReport = referenceSarifReports.find((referenceSarifReport) => referenceSarifReport.name == sarifReport.name);
            await this.updateBaselineState(currentSarifContentJson, referenceSarifReport);

            currentSarifContentString = JSON.stringify(currentSarifContentJson);
            const baseName = path.basename(sarifReport.name);
            const outputPath = path.join(parasoftFindingsTempFolder, baseName);
            fs.writeFileSync(outputPath, currentSarifContentString, 'utf8');
            tl.uploadArtifact("SarifContainer", outputPath, "CodeAnalysisLogs");
            tl.debug(`Updated existing sarif report '${baseName}' in artifacts due to the reference build was changed.`);
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private getRelativeURI = (location: any): string | undefined => {
        if (!location.physicalLocation || !location.physicalLocation.artifactLocation
            || !location.physicalLocation.artifactLocation.uri || !this.defaultWorkingDirectory) {
            return undefined;
        }
        const uri: string = location.physicalLocation.artifactLocation.uri;
        let processedDefaultWorkingDirectory = this.defaultWorkingDirectory.replaceAll('\\', '/');
        // Check if the URI contains the path of the working directory
        let start = uri.lastIndexOf(processedDefaultWorkingDirectory);
        if (start == -1) {
            // Encode the working directory string and check again since URI may be encoded
            processedDefaultWorkingDirectory = processedDefaultWorkingDirectory.replaceAll('%', '%25').replaceAll(' ', '%20');
            start = uri.lastIndexOf(processedDefaultWorkingDirectory);
        }
        if (start != -1) {
            return uri.substring(start + processedDefaultWorkingDirectory.length);
        }
        return undefined;
    }
}