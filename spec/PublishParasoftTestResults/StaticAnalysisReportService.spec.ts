import * as tl from '../../PublishParasoftResults/node_modules/azure-pipelines-task-lib';
import * as azdev from '../../PublishParasoftResults/node_modules/azure-devops-node-api';
import { BuildResult } from '../../PublishParasoftResults/node_modules/azure-devops-node-api/interfaces/BuildInterfaces';
import {StaticAnalysisReportService} from "../../PublishParasoftResults/StaticAnalysisReportService";
import * as path from "path";

let publisher: any;
let mockWebApi: any;

describe("Test functions in StaticAnalysisReportService", () => {
    beforeEach(() => {
        spyOn(tl, 'getInput').and.returnValue('foobar');
        spyOn(tl, 'debug');
        spyOn(tl, 'warning');
        spyOn(tl, 'getEndpointAuthorization');
        spyOn(tl, 'getPathInput').and.returnValue(undefined);

        mockWebApi = jasmine.createSpy('WebApi').and.returnValue({
            getBuildApi: jasmine.createSpy('getBuildApi').and.returnValue({
                getDefinitions: jasmine.createSpy('getDefinitions'),
                getBuilds: jasmine.createSpy('getBuilds'),
                getArtifact: jasmine.createSpy('getArtifact'),
            }),
        });
        spyOn(azdev, 'WebApi').and.callFake(mockWebApi);
    });

    describe('getSarifReportsOfReferenceBuild()', () => {
        beforeEach(() => {
            publisher = new StaticAnalysisReportService();
            publisher.definitionId = 12;
            spyOn(publisher, 'getSarifReportOfPipeline');
            spyOn(publisher.buildClient, 'getPipelinesByName');
        });

        it('when the reference pipeline is undefined', async () => {
            publisher.referenceBuildResult.referencePipelineInput = undefined;
            publisher.pipelineName = 'current-pipeline';
            const warningMessage = 'Any warning message(debug message here) when getting builds for a specific pipeline';
            const referenceBuildInfo: any = {
                fileEntries: [],
                staticAnalysis: {
                    pipelineName: publisher.pipelineName,
                    buildId: undefined,
                    buildNumber: undefined,
                    warningMessage: warningMessage
                },
                isDebugMessage: true
            };
            publisher.getSarifReportOfPipeline.and.returnValue(referenceBuildInfo);

            expect(await publisher.getSarifReportsOfReferenceBuild()).toEqual([]);
            expect(publisher.getSarifReportOfPipeline).toHaveBeenCalledWith(publisher.definitionId, publisher.pipelineName);
            expect(tl.debug).toHaveBeenCalledWith(`${warningMessage} - all issues will be treated as new`);
            expect(publisher.referenceBuildResult.staticAnalysis.warningMessage).toEqual(`${warningMessage} - all issues were treated as new`);
        });

        describe('when the reference pipeline is defined', () => {
            beforeEach(() => {
                publisher.referenceBuildResult.referencePipelineInput = 'reference-pipeline';
                publisher.pipelineName = 'specific-pipeline';
            });

            it('- the reference pipeline is valid', async () => {
                const specificPipelines: any[] = [{
                    id: 1,
                    name: 'reference-pipeline'
                }];
                const referenceBuildInfo: any = {
                    fileEntries: [],
                    staticAnalysis: {
                        pipelineName: publisher.referenceBuildResult.referencePipelineInput,
                        buildId: 20,
                        buildNumber: 20,
                        warningMessage: undefined
                    },
                    isDebugMessage: false
                };
                publisher.buildClient.getPipelinesByName.and.returnValue(specificPipelines);
                publisher.getSarifReportOfPipeline.and.returnValue(referenceBuildInfo);

                expect(await publisher.getSarifReportsOfReferenceBuild()).toEqual([]);
                expect(publisher.buildClient.getPipelinesByName).toHaveBeenCalledWith(publisher.referenceBuildResult.referencePipelineInput);
                expect(publisher.getSarifReportOfPipeline).toHaveBeenCalledWith(1, publisher.referenceBuildResult.referencePipelineInput);
                expect(publisher.referenceBuildResult.staticAnalysis).toEqual(referenceBuildInfo.staticAnalysis);
            });

            it('- the reference pipeline is not unique', async () => {
                const specificPipelines: any[] = [{
                    id: 1,
                    name: 'reference-pipeline'
                }, {
                    id: 2,
                    name: 'reference-pipeline'
                }];
                publisher.buildClient.getPipelinesByName.and.returnValue(specificPipelines);
                const warningMessage = `The specified reference pipeline '${publisher.referenceBuildResult.referencePipelineInput}' is not unique`;

                expect(await publisher.getSarifReportsOfReferenceBuild()).toEqual([]);
                expect(tl.warning).toHaveBeenCalledWith(`${warningMessage} - all issues will be treated as new`);
                expect(publisher.referenceBuildResult.staticAnalysis).toEqual({
                    pipelineName: undefined,
                    buildId: undefined,
                    buildNumber: undefined,
                    warningMessage: `${warningMessage} - all issues were treated as new`
                });
            });

            it('- the reference pipeline could not be found', async () => {
                const specificPipelines: any[] = [];
                publisher.buildClient.getPipelinesByName.and.returnValue(specificPipelines);
                const warningMessage = `The specified reference pipeline '${publisher.referenceBuildResult.referencePipelineInput}' could not be found`;

                expect(await publisher.getSarifReportsOfReferenceBuild()).toEqual([]);
                expect(tl.warning).toHaveBeenCalledWith(`${warningMessage} - all issues will be treated as new`);
                expect(publisher.referenceBuildResult.staticAnalysis).toEqual({
                    pipelineName: undefined,
                    buildId: undefined,
                    buildNumber: undefined,
                    warningMessage: `${warningMessage} - all issues were treated as new`
                });
            });
        });
    });

    describe('getSarifReportOfPipeline()', () => {
        const builds: any[] = [{
            id: 1,
            buildNumber: '20',
            result: BuildResult.Succeeded
        }, {
            id: 2,
            buildNumber: '21',
            result: BuildResult.PartiallySucceeded
        }, {
            id: 3,
            buildNumber: '22',
            result: BuildResult.Failed
        }, {
            id: 4,
            buildNumber: '23',
            result: BuildResult.Succeeded
        }, {
            id: 5,
            buildNumber: '23',
            result: BuildResult.Succeeded
        }];

        beforeEach(() => {
            publisher = new StaticAnalysisReportService();
            publisher.pipelineName = 'default-pipeline';
            spyOn(publisher.buildClient, 'getBuildsOfPipelineById').and.returnValue(builds);
        });

        describe('when the reference build is undefined', () => {
            beforeEach(() => {
                publisher.referenceBuildResult.referenceBuildInput = undefined;
                publisher.pipelineName = 'default-pipeline';
            });

            it('- has available default report', async () => {
                spyOn(publisher.buildClient, 'getSarifArtifactOfBuildById').and.returnValue({id: 1, name: 'CodeAnalysisLogs'});
                const reports = ['path/to/sarif/report'];
                spyOn(publisher.buildClient, 'getSarifReportsOfArtifact').and.returnValue(reports);
                const expectedReferenceBuildInfo: any = {
                    fileEntries: reports,
                    staticAnalysis: {
                        pipelineName: publisher.pipelineName,
                        buildId: 1,
                        buildNumber: '20',
                        warningMessage: undefined
                    },
                    isDebugMessage: false
                };
                const result = await publisher.getSarifReportOfPipeline(1, publisher.pipelineName);
                expect(result).toEqual(expectedReferenceBuildInfo);
            });

            it('- no parasoft results in default report', async () => {
                spyOn(publisher.buildClient, 'getSarifArtifactOfBuildById').and.returnValue({id: 1, name: 'CodeAnalysisLogs'});
                spyOn(publisher.buildClient, 'getSarifReportsOfArtifact').and.returnValue([]);
                const warningMessage = `No Parasoft static analysis results were found in any of the previous successful builds in pipeline '${publisher.pipelineName}'`;
                const result = await publisher.getSarifReportOfPipeline(1, publisher.pipelineName);
                expect(result.staticAnalysis.warningMessage).toEqual(warningMessage);
                expect(result.isDebugMessage).toBeFalsy();
            });

            it('- no previous build is found', async () => {
                let tempBuilds: any[] = [{
                    id: 1,
                    buildNumber: '20',
                    result: BuildResult.Succeeded
                }];
                publisher.buildClient.getBuildsOfPipelineById.and.callFake(() => {
                    return tempBuilds; // The temporary value or behavior
                });
                publisher.buildId = 1;
                const warningMessage = `No previous build was found in pipeline '${publisher.pipelineName}'`;
                const result = await publisher.getSarifReportOfPipeline(1, publisher.pipelineName);
                expect(result.staticAnalysis.warningMessage).toEqual(warningMessage);
                expect(result.isDebugMessage).toBeTruthy();
                // Revert back to the original value or behavior
                publisher.buildClient.getBuildsOfPipelineById.and.returnValue(builds);
            });

            it('- no successful build', async () => {
                let tempBuilds: any[] = [{
                    id: 2,
                    buildNumber: '21',
                    result: BuildResult.PartiallySucceeded
                }, {
                    id: 3,
                    buildNumber: '22',
                    result: BuildResult.Failed
                }];
                publisher.buildClient.getBuildsOfPipelineById.and.callFake(() => {
                    return tempBuilds; // The temporary value or behavior
                });
                const warningMessage = `No successful build was found in pipeline '${publisher.pipelineName}'`;
                const result = await publisher.getSarifReportOfPipeline(1, publisher.pipelineName);
                expect(result.staticAnalysis.warningMessage).toEqual(warningMessage);
                expect(result.isDebugMessage).toBeFalsy();
                // Revert back to the original value or behavior
                publisher.buildClient.getBuildsOfPipelineById.and.returnValue(builds);
            });
        });

        describe('when the reference build is set', () => {
            beforeEach(() => {
                spyOn(publisher.buildClient, 'getSarifArtifactOfBuildById');
                publisher.referenceBuildResult.referencePipelineInput = 'reference-pipeline';
            });

            it('- exists in current pipeline but is not unique', async () => {
                publisher.referenceBuildResult.referenceBuildInput = 23;
                const warningMessage = `The specified reference build '${publisher.referenceBuildResult.referencePipelineInput}#${publisher.referenceBuildResult.referenceBuildInput}' is not unique`;

                const result = await publisher.getSarifReportOfPipeline(1, publisher.referenceBuildResult.referencePipelineInput);
                expect(result.staticAnalysis.warningMessage).toEqual(warningMessage);
                expect(result.isDebugMessage).toBeFalsy();
            });

            it('- does not exist in current pipeline', async () => {
                publisher.referenceBuildResult.referenceBuildInput = 32;
                const warningMessage = `The specified reference build '${publisher.referenceBuildResult.referencePipelineInput}#${publisher.referenceBuildResult.referenceBuildInput}' could not be found`;

                const result = await publisher.getSarifReportOfPipeline(1, publisher.referenceBuildResult.referencePipelineInput);
                expect(result.staticAnalysis.warningMessage).toEqual(warningMessage);
                expect(result.isDebugMessage).toBeFalsy();
            });

            it('- exists in current pipeline and is neither succeed nor partially succeed', async () => {
                publisher.referenceBuildResult.referenceBuildInput = 22;
                const warningMessage = `The specified reference build '${publisher.referenceBuildResult.referencePipelineInput}#${publisher.referenceBuildResult.referenceBuildInput}' could not be used. Only successful or unstable builds are valid references`;

                const result = await publisher.getSarifReportOfPipeline(1, publisher.referenceBuildResult.referencePipelineInput);
                expect(result.staticAnalysis.warningMessage).toEqual(warningMessage);
                expect(result.isDebugMessage).toBeFalsy();
            });

            describe('- exists in current pipeline and is partially succeed with no static analysis results', () => {
                beforeEach(() => {
                    publisher.referenceBuildResult.referenceBuildInput = '21';
                });

                it('- artifact is undefined', async () => {
                    const artifact = undefined;
                    publisher.buildClient.getSarifArtifactOfBuildById.and.returnValue(artifact);
                    const warningMessage = `No Parasoft static analysis results were found in the specified reference build: '${publisher.referenceBuildResult.referencePipelineInput}#${publisher.referenceBuildResult.referenceBuildInput}'`;

                    const result = await publisher.getSarifReportOfPipeline(1, publisher.referenceBuildResult.referencePipelineInput);
                    expect(result.staticAnalysis.warningMessage).toEqual(warningMessage);
                    expect(result.isDebugMessage).toBeFalsy();
                });

                it('- artifact is not undefined', async () => {
                    const artifact = {
                        id: 1,
                        name: 'CodeAnalysisLogs'
                    };
                    publisher.buildClient.getSarifArtifactOfBuildById.and.returnValue(artifact);
                    const mockFileEntries: any[] = [];
                    spyOn(publisher.buildClient, 'getSarifReportsOfArtifact').and.returnValue(mockFileEntries);
                    const warningMessage = `No Parasoft static analysis results were found in the specified reference build: '${publisher.referenceBuildResult.referencePipelineInput}#${publisher.referenceBuildResult.referenceBuildInput}'`;

                    const result = await publisher.getSarifReportOfPipeline(1, publisher.referenceBuildResult.referencePipelineInput);
                    expect(result.staticAnalysis.warningMessage).toEqual(warningMessage);
                    expect(result.isDebugMessage).toBeFalsy();
                });
            });

            it('- exists in current pipeline and is succeed with static analysis results', async () => {
                publisher.referenceBuildResult.referenceBuildInput = 20;
                const artifact = {
                    id: 1,
                    name: 'CodeAnalysisLogs'
                };
                publisher.buildClient.getSarifArtifactOfBuildById.and.returnValue(artifact);
                const sarifContentString = '{"runs":[{"results":[{"ruleId":"1","level":"warning","partialFingerprints":{"unbViolId":95f6cbd1-cbe0-597a-8b6f-11f4da185fec}}]}]}';
                const expectedResult: any[] = [{
                    name: "SarifContainer/report-xml-sast.sarif",
                    contentsPromise: Promise.resolve(sarifContentString)
                }];
                spyOn(publisher.buildClient, 'getSarifReportsOfArtifact').and.returnValue(expectedResult);
                const expectedReferenceBuildInfo: any = {
                    fileEntries: expectedResult,
                    staticAnalysis: {
                        pipelineName: publisher.referenceBuildResult.referencePipelineInput,
                        buildId: 1,
                        buildNumber: publisher.referenceBuildResult.referenceBuildInput,
                        warningMessage: undefined
                    },
                    isDebugMessage: false
                };

                const result = await publisher.getSarifReportOfPipeline(1, publisher.referenceBuildResult.referencePipelineInput);
                expect(result).toEqual(expectedReferenceBuildInfo);
            });
        });
    });

    describe('updateBaselineState()', () => {
        let testUpdateBaselineState: any;
        let testUnbViolId: string;

        beforeEach(() => {
            publisher = new StaticAnalysisReportService();
            testUnbViolId = "95f6cbd1-cbe0-597a-8b6f-11f4da185fec";

            testUpdateBaselineState = async (baselineState: string) => {
                const currentSarifContentJson: any = {"runs":[{"results":[{"ruleId":"1","level":"warning","partialFingerprints":{"unbViolId":testUnbViolId}}]}]};
                const expectedResult = {"runs":[{"results":[{"ruleId":"1","level":"warning","partialFingerprints":{"unbViolId":testUnbViolId},"baselineState":baselineState}]}]};

                expect(await publisher.updateBaselineState(currentSarifContentJson, undefined)).toEqual(expectedResult);
            }
        });

        it('when unbViolId exists in the reference SARIF report, the baseline state is set as unchanged', async () => {
            spyOn(publisher, 'getUnbViolIdsFromReferenceSarifReport').and.returnValue([testUnbViolId]);
            await testUpdateBaselineState("unchanged");
        });

        it('when unbViolId does not exist in the reference SARIF report, the baseline state is set as new', async () => {
            spyOn(publisher, 'getUnbViolIdsFromReferenceSarifReport').and.returnValue([]);
            await testUpdateBaselineState("new");
        });
    });

    describe('getUnbViolIdsFromReferenceSarifReport()', () => {
        beforeEach(() => {
            publisher = new StaticAnalysisReportService();
        });

        it('when reference SARIF report is undefined', async () => {
            expect(await publisher.getUnbViolIdsFromReferenceSarifReport(undefined)).toEqual([]);
        });

        it('when unbViolId exists in the reference SARIF report', async () => {
            const referenceSarifContentPromise: Promise<string> = Promise.resolve(`{"runs":[{"results":[{"ruleId":"1","level":"warning","partialFingerprints":{"unbViolId":"95f6cbd1-cbe0-597a-8b6f-11f4da185fec"}}]}]}`);
            const referenceSarifReport = {
                name: "name",
                artifactName: "artifactName",
                filePath: "filePath",
                buildId: 1,
                contentsPromise: referenceSarifContentPromise
            };

            expect(await publisher.getUnbViolIdsFromReferenceSarifReport(referenceSarifReport)).toEqual(["95f6cbd1-cbe0-597a-8b6f-11f4da185fec"]);
        });
    });

    describe('generateUniqueFileName()', () => {
        beforeEach(() => {
            publisher = new StaticAnalysisReportService();
        });

        it('when on Windows platform', () => {
            const reportDir: string = 'D:/build/reports/cpptest-std/static_1'
            const result = publisher.generateUniqueFileName(path.join(reportDir, 'report.xml'));
            expect(result).toEqual(path.join(reportDir, 'D__build_reports_cpptest-std_static_0x5f_1_report.xml'));
        });

        it('when on Linux platform', () => {
            const reportDir: string = '/home/user/Documents/build/reports/cpptest-std/static_1'
            const result = publisher.generateUniqueFileName(path.join(reportDir, 'report.xml'));
            expect(result).toEqual(path.join(reportDir, 'home_user_Documents_build_reports_cpptest-std_static_0x5f_1_report.xml'));
        });

       it('when report path is undefined', () => {
           const result = publisher.generateUniqueFileName(undefined);
           expect(result).toEqual('');
       });
    })
});