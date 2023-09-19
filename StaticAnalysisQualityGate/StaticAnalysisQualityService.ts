import * as tl from 'azure-pipelines-task-lib/task';
import { Build, BuildArtifact, BuildResult } from 'azure-devops-node-api/interfaces/BuildInterfaces';
import { BuildAPIClient, FileEntry, FileSuffixEnum } from './BuildApiClient';

export class StaticAnalysisQualityService {
    readonly artifactName: string = 'CodeAnalysisLogs';
    readonly fileSuffix: FileSuffixEnum;
    readonly buildClient: BuildAPIClient;

    // Predefined variables
    readonly projectName: string;
    readonly buildId: number;
    readonly buildNumber: string;
    readonly definitionId: number;

    // Configuration UI
    readonly referenceBuild: string; // default value: ""
    readonly type: string; // default value: "total"

    constructor() {
        this.fileSuffix = FileSuffixEnum.SARIF_SUFFIX;
        this.buildClient = new BuildAPIClient();

        this.projectName = tl.getVariable('System.TeamProject') || '';
        this.buildId = Number(tl.getVariable('Build.BuildId'));
        this.buildNumber = tl.getVariable('Build.BuildNumber') || '';
        this.definitionId = Number(tl.getVariable('System.DefinitionId'));

        this.referenceBuild = tl.getInput('referenceBuild') || '';
        this.type  = tl.getInput('type') || '';
    }

    run = async (): Promise<void> => {
        // Check for static analysis results exist in current build
        const artifact: Promise<BuildArtifact> = this.buildClient
                                                    .getBuildArtifact(this.projectName, this.buildId, this.artifactName);
        if (!await artifact) {
            tl.warning(`No static analysis results found in this build`);
            tl.debug("The quality gates does not take effect - skipping");
            return;
        }

        // TODO - Will be implemented in seperate task.
        if (this.type == 'total') {
            // If type is set to 'total', there will be no need to make comparision
            // Only need to calculate the total number of result in current build, then check the quality gate.
            // return;
        } else if (this.referenceBuild == this.buildNumber) {
            tl.warning("The current build cannot be used as a reference object");
            tl.debug("All reported issues will be considered new");
            tl.debug("The quality gates does not take effect - skipping");
            return;
        }

        this.getReferenceReports().then((fileEntry) => {
            if (fileEntry.length == 0) {
                tl.debug("All reported issues will be considered new");
                tl.debug("The quality gates does not take effect - skipping");
                return;
            }
            // TODO: Will be implemented in a separate task - Can get content of the reports here
            fileEntry.map((file) => {
                tl.debug("The information of SARIF reports: " + file.artifactName + ":" + file.filePath + ":" + file.name + ":");
                file.contentsPromise?.then((text) => {
                    tl.debug("The content of SARIF reports:" +text);
                })
            })
        });
        
    }

    getReferenceReports = async(): Promise<FileEntry[]> => {
        tl.debug("Obtaining reference build from same pipeline");
        const allBuildsForCurrentPipeline: Promise<Build[]> = this.buildClient
                                                                .getBuildsForSpecificPipeline(this.projectName, this.definitionId);

        if (!this.referenceBuild) {
            tl.debug("No reference build has been set");

            return this.buildClient.getDefaultBuildReports(
                allBuildsForCurrentPipeline,
                this.projectName,
                this.artifactName,
                this.fileSuffix);
        } else {
            let fileEntryArr:FileEntry[] = [];
            // Check for the specific reference build with succeeded/paratially-succeeded results exist in current pipeline
            const specificReferenceBuild = (await allBuildsForCurrentPipeline).filter(build => {
                return build.buildNumber === this.referenceBuild
                        && (build.result === BuildResult.Succeeded
                            || build.result === BuildResult.PartiallySucceeded);
            });

            if (specificReferenceBuild.length > 0) {
                let specificReferenceBuildId: number = Number(specificReferenceBuild[0].id);

                // Check for results exist in the specific reference build
                const artifact: Promise<BuildArtifact> = this.buildClient
                                                            .getBuildArtifact(this.projectName, specificReferenceBuildId, this.artifactName);
                if (await artifact) {
                    tl.debug(`Using specific reference build ${specificReferenceBuildId}`);

                    fileEntryArr = await this.buildClient.getSpecificBuildReports(
                        specificReferenceBuildId,
                        this.projectName,
                        this.artifactName,
                        this.fileSuffix);
                } else {
                    tl.warning(`No reference results found in the specific reference build ${this.referenceBuild}`);
                }
            } else {
                tl.warning(`No valid specific reference build ${this.referenceBuild} found`);
            }
            return Promise.resolve(fileEntryArr);
        }
    }
}
