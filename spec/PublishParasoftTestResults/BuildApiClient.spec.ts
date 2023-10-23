import { BuildAPIClient, DefaultBuildReportResults, DefaultBuildReportResultsStatus, FileSuffixEnum } from '../../PublishParasoftResults/BuildApiClient';
import * as azdev from '../../PublishParasoftResults/node_modules/azure-devops-node-api';
import * as tl from '../../PublishParasoftResults/node_modules/azure-pipelines-task-lib';
import * as JSZip from '../../PublishParasoftResults/node_modules/jszip';
import { BuildResult } from '../../PublishParasoftResults/node_modules/azure-devops-node-api/interfaces/BuildInterfaces';

let buildClient: any;

describe('Test Builds API Client', () => {
    let mockWebApi: any;
    beforeEach(() => {
        spyOn(tl, 'getEndpointAuthorization');
        mockWebApi = jasmine.createSpy('WebApi').and.returnValue({
            getBuildApi: jasmine.createSpy('getBuildApi').and.returnValue({
                getBuilds: jasmine.createSpy('getBuilds'),
                getArtifact: jasmine.createSpy('getArtifact'),
            }),
        });
        spyOn(azdev, 'WebApi').and.callFake(mockWebApi);
    });

    it('getBuildsForSpecificPipeline()', async () => {
        const exceptedResult: any[] = [{
            id: 1,
            buildNumber: '20'
        }];
        mockWebApi().getBuildApi().getBuilds.and.returnValue(Promise.resolve(exceptedResult));
        buildClient = new BuildAPIClient();

        const result = await buildClient.getBuildsForSpecificPipeline('test-project', 1);
        expect(result).toEqual(exceptedResult);
    });

    it('getBuildArtifact()', async () => {
        const exceptedResult: any[] = [{
            id: 1,
            name: 'CodeAnalysisLogs'
        }];
        mockWebApi().getBuildApi().getArtifact.and.returnValue(Promise.resolve(exceptedResult));
        buildClient = new BuildAPIClient();

        const result = await buildClient.getBuildArtifact('test-project', 1, 'CodeAnalysisLogs');
        expect(result).toEqual(exceptedResult);
    });

    describe('getDefaultBuildReports()', () => {
        it('when no previous build is found', async () => {
            let builds: any[] = [{
                id: 1,
                buildNumber: '20',
                result: undefined
            }];
            buildClient = new BuildAPIClient();
            spyOn(buildClient, 'getBuildReportsWithId');

            const expectedResult: DefaultBuildReportResults = {
                status: DefaultBuildReportResultsStatus.NO_PREVIOUS_BUILD_WAS_FOUND,
                buildId: undefined,
                buildNumber: undefined,
                reports: undefined
            }
            const result = await buildClient.getDefaultBuildReports(builds, 'test-project', 'CodeAnalysisLogs', FileSuffixEnum.SARIF_SUFFIX);
            expect(result).toEqual(expectedResult);
            expect(buildClient.buildApi.getArtifact).not.toHaveBeenCalled();
            expect(buildClient.getBuildReportsWithId).not.toHaveBeenCalled();
        });

        it('when there is no successful build', async () => {
            let builds: any[] = [{
                id: 1,
                buildNumber: '20',
                result: BuildResult.Failed
            }, {
                id: 2,
                buildNumber: '21',
                result: BuildResult.PartiallySucceeded
            }];
            buildClient = new BuildAPIClient();
            spyOn(buildClient, 'getBuildReportsWithId');

            const expectedResult: DefaultBuildReportResults = {
                status: DefaultBuildReportResultsStatus.NO_SUCCESSFUL_BUILD,
                buildId: undefined,
                buildNumber: undefined,
                reports: undefined
            };
            const result = await buildClient.getDefaultBuildReports(builds, 'test-project', 'CodeAnalysisLogs', FileSuffixEnum.SARIF_SUFFIX);
            expect(result).toEqual(expectedResult);
            expect(buildClient.buildApi.getArtifact).not.toHaveBeenCalled();
            expect(buildClient.getBuildReportsWithId).not.toHaveBeenCalled();
        });

        describe('when there is a successful build', () => {
            let builds: any[];
            beforeEach(() => {
                builds = [{
                    id: 1,
                    buildNumber: '20',
                    result: BuildResult.Succeeded
                }, {
                    id: 2,
                    buildNumber: '21',
                    result: BuildResult.PartiallySucceeded
                }];
            });

            it('and has static analysis results', async () => {
                const artifact = {
                    id: 1,
                    name: 'CodeAnalysisLogs'
                };
                mockWebApi().getBuildApi().getArtifact.and.returnValue(Promise.resolve(artifact));
                buildClient = new BuildAPIClient();
                const sarifContentString = '{"runs":[{"results":[{"ruleId":"1","level":"warning","partialFingerprints":{"unbViolId":95f6cbd1-cbe0-597a-8b6f-11f4da185fec}}]}]}';
                const testBuildId = 1;
                const fileEntries = [{
                    name: "Container/report-xml-sast.sarif",
                    artifactName: artifact.name,
                    filePath: "Container/report-xml-sast.sarif",
                    buildId: testBuildId,
                    contentsPromise: Promise.resolve(sarifContentString)
                }];
                const expectedResult: DefaultBuildReportResults = {
                    status: DefaultBuildReportResultsStatus.OK,
                    buildId: testBuildId,
                    buildNumber: '20',
                    reports: fileEntries
                };
                spyOn(buildClient, 'getBuildReportsWithId').and.returnValue(fileEntries);

                const result = await buildClient.getDefaultBuildReports(builds, 'test-project', artifact.name, FileSuffixEnum.SARIF_SUFFIX);
                expect(result).toEqual(expectedResult);
                expect(buildClient.buildApi.getArtifact).toHaveBeenCalled();
                expect(buildClient.getBuildReportsWithId).toHaveBeenCalled();
            });

            describe('but does not have static analysis results', async () => {
                it('- artifact is undefined', async () => {
                    const artifact = undefined;
                    mockWebApi().getBuildApi().getArtifact.and.returnValue(Promise.resolve(artifact));
                    buildClient = new BuildAPIClient();
                                        spyOn(buildClient, 'getBuildReportsWithId');
    
                    const expectedResult: DefaultBuildReportResults = {
                        status: DefaultBuildReportResultsStatus.NO_PARASOFT_RESULTS_IN_PREVIOUS_SUCCESSFUL_BUILDS,
                        buildId: undefined,
                        buildNumber: undefined,
                        reports: undefined
                    }
                    const result = await buildClient.getDefaultBuildReports(builds, 'test-project', 'CodeAnalysisLogs', FileSuffixEnum.SARIF_SUFFIX);
                    expect(result).toEqual(expectedResult);
                    expect(buildClient.buildApi.getArtifact).toHaveBeenCalled();
                    expect(buildClient.getBuildReportsWithId).not.toHaveBeenCalled();
                });

                it('- artifact is not undefined', async () => {
                    const artifact = {
                        id: 1,
                        name: 'CodeAnalysisLogs'
                    };
                    mockWebApi().getBuildApi().getArtifact.and.returnValue(Promise.resolve(artifact));
                    buildClient = new BuildAPIClient();
                    const mockFileEntries: any[] = [];
                    spyOn(buildClient, 'getBuildReportsWithId').and.returnValue(mockFileEntries);

                    const expectedResult: DefaultBuildReportResults = {
                        status: DefaultBuildReportResultsStatus.NO_PARASOFT_RESULTS_IN_PREVIOUS_SUCCESSFUL_BUILDS,
                        buildId: 1,
                        buildNumber: '20',
                        reports: mockFileEntries
                    }
                    const result = await buildClient.getDefaultBuildReports(builds, 'test-project', artifact.name, FileSuffixEnum.SARIF_SUFFIX);
                    expect(result).toEqual(expectedResult);
                    expect(buildClient.buildApi.getArtifact).toHaveBeenCalled();
                    expect(buildClient.getBuildReportsWithId).toHaveBeenCalled();
                });
            });
        });
    });

    it('getBuildReportsWithId()', async () => {
        buildClient = new BuildAPIClient();
        const mockArtifact = {
            resource: { downloadUrl: 'https://example.com/downloads/CodeAnalysisLogs.zip' },
            name: 'CodeAnalysisLogs',
        };
        const mockZip: any = {
            files: {
                'CodeAnalysisLogs/report1-sarif-pf-sast.sarif': {
                    name: 'CodeAnalysisLogs/report1-sarif-pf-sast.sarif',
                    dir: false,
                    async: jasmine.createSpy('async').and.returnValue('report_1_content_promise_resolved')
                },
                'CodeAnalysisLogs/report2-sarif-pf-sast.sarif': {
                    name: 'CodeAnalysisLogs/report2-sarif-pf-sast.sarif',
                    dir: false, async: jasmine.createSpy('async').and.returnValue('report_2_content_promise_resolved')
                },
                'CodeAnalysisLogs/report.pdf': {
                    name: 'CodeAnalysisLogs/report.pdf',
                    dir: false, async: jasmine.createSpy('async').and.returnValue('report_other_content_promise_resolved')
                },
            },
            async loadAsync() {
                return this;
            },
            async file(name: keyof typeof mockZip['files']) {
                return this.files[name];
            },
        };
        const testBuildId = 1;
        const expectedResult: any[] = [{
            name: "report1-sarif-pf-sast.sarif",
            artifactName: mockArtifact.name,
            filePath: "report1-sarif-pf-sast.sarif",
            buildId: testBuildId,
            contentsPromise: 'report_1_content_promise_resolved'
        }, {
            name: "report2-sarif-pf-sast.sarif",
            artifactName: mockArtifact.name,
            filePath: "report2-sarif-pf-sast.sarif",
            buildId: testBuildId,
            contentsPromise: 'report_2_content_promise_resolved'
        }];
        spyOn(buildClient, 'getArtifactContentZip').and.returnValue(new ArrayBuffer(0));
        spyOn(JSZip, 'loadAsync').and.returnValue(Promise.resolve(mockZip));

        const result = await buildClient.getBuildReportsWithId(mockArtifact, testBuildId, FileSuffixEnum.SARIF_SUFFIX);
        expect(result).toEqual(expectedResult);
        expect(buildClient.getArtifactContentZip).toHaveBeenCalledWith(mockArtifact.resource.downloadUrl);
        expect(JSZip.loadAsync).toHaveBeenCalled();
    });

    describe ('getArtifactContentZip()', async () => {
        beforeEach(() => {
            buildClient = new BuildAPIClient();
        });

        it('should throw a TypeError for non-absolute URLs', async () => {
            const downloadUrl = 'example.com/artifact.zip'; // Non-absolute URL
            try {
                await buildClient.getArtifactContentZip(downloadUrl);
            } catch (error: any) {
                expect(error.name).toEqual('TypeError');
                expect(error.message).toEqual('Only absolute URLs are supported');
            }
        });

        it('should return empty when url is not available', async () => {
            const downloadUrl = 'https://example.com/CodeAnalysisLogs.zip';
            const resultArrayBuffer = await buildClient.getArtifactContentZip(downloadUrl);
            const result: string = String.fromCharCode.apply(null, resultArrayBuffer); // Transfer arrayBuffer to string
            expect(result).toEqual('');
        });
    });
})