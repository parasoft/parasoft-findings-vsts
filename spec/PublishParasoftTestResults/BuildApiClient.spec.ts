import { BuildAPIClient, DefaultBuildReportResults, DefaultBuildReportResultsStatus, FileSuffixEnum } from '../../PublishParasoftResults/BuildApiClient';
import * as azdev from '../../PublishParasoftResults/node_modules/azure-devops-node-api';
import * as tl from '../../PublishParasoftResults/node_modules/azure-pipelines-task-lib';
import * as JSZip from '../../PublishParasoftResults/node_modules/jszip';
import { BuildResult } from '../../PublishParasoftResults/node_modules/azure-devops-node-api/interfaces/BuildInterfaces';

let buildClient: any;

describe('Test Builds API Client', () => {
    beforeEach(() => {
        spyOn(tl, 'getEndpointAuthorization');
    });

    it('getBuildsForSpecificPipeline()', async () => {
        const exceptedResult: any[] = [{
            id: 1,
            buildNumber: '20'
        }];
        let mockWebApi = jasmine.createSpy('WebApi').and.returnValue({
            getBuildApi: jasmine.createSpy('getBuildApi').and.returnValue({
                getBuilds: jasmine.createSpy('getBuilds').and.returnValue(Promise.resolve(exceptedResult)),
                getArtifact: jasmine.createSpy('getArtifact'),
            }),
        });
        spyOn(azdev, 'WebApi').and.callFake(mockWebApi);
        buildClient = new BuildAPIClient();

        const result = await buildClient.getBuildsForSpecificPipeline('test-project', 1);
        expect(result).toEqual(exceptedResult);
    });

    it('getBuildArtifact()', async () => {
        const exceptedResult: any[] = [{
            id: 1,
            name: 'CodeAnalysisLogs'
        }];
        let mockWebApi = jasmine.createSpy('WebApi').and.returnValue({
            getBuildApi: jasmine.createSpy('getBuildApi').and.returnValue({
                getBuilds: jasmine.createSpy('getBuilds'),
                getArtifact: jasmine.createSpy('getArtifact').and.returnValue(exceptedResult),
            }),
        });
        spyOn(azdev, 'WebApi').and.callFake(mockWebApi);
        buildClient = new BuildAPIClient();

        const result = await buildClient.getBuildArtifact('test-project', 1, 'CodeAnalysisLogs');
        expect(result).toEqual(exceptedResult);
    });

    describe('getDefaultBuildReports()', () => {
        it('when no previous build is found', async () => {
            let builds: any[] = [{
                id: 1,
                buildNumber: '20',
                result: BuildResult.Failed
            }];
            let mockWebApi = jasmine.createSpy('WebApi').and.returnValue({
                getBuildApi: jasmine.createSpy('getBuildApi').and.returnValue({
                    getBuilds: jasmine.createSpy('getBuilds'),
                    getArtifact: jasmine.createSpy('getArtifact'),
                }),
            });
            spyOn(azdev, 'WebApi').and.callFake(mockWebApi);
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
            let mockWebApi = jasmine.createSpy('WebApi').and.returnValue({
                getBuildApi: jasmine.createSpy('getBuildApi').and.returnValue({
                    getBuilds: jasmine.createSpy('getBuilds'),
                    getArtifact: jasmine.createSpy('getArtifact'),
                }),
            });
            spyOn(azdev, 'WebApi').and.callFake(mockWebApi);
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
                let mockWebApi = jasmine.createSpy('WebApi').and.returnValue({
                    getBuildApi: jasmine.createSpy('getBuildApi').and.returnValue({
                        getBuilds: jasmine.createSpy('getBuilds'),
                        getArtifact: jasmine.createSpy('getArtifact').and.returnValue(artifact),
                    }),
                });
                spyOn(azdev, 'WebApi').and.callFake(mockWebApi);
                buildClient = new BuildAPIClient();
                const sarifContentString = '{"runs":[{"results":[{"ruleId":"ruleId","level":"level","partialFingerprints":{"unbViolId":testUnbViolId}}]}]}';
                const fileEntries = [{
                    name: "Container/report-xml-sast.sarif",
                    artifactName: "CodeAnalysisLogs",
                    filePath: "Container/report-xml-sast.sarif",
                    buildId: 1,
                    contentsPromise: Promise.resolve(sarifContentString)
                }];
                const expectedResult: DefaultBuildReportResults = {
                    status: DefaultBuildReportResultsStatus.OK,
                    buildId: 1,
                    buildNumber: '20',
                    reports: fileEntries
                };
                spyOn(buildClient, 'getBuildReportsWithId').and.returnValue(fileEntries);

                const result = await buildClient.getDefaultBuildReports(builds, 'test-project', 'CodeAnalysisLogs', FileSuffixEnum.SARIF_SUFFIX);
                expect(result).toEqual(expectedResult);
                expect(buildClient.buildApi.getArtifact).toHaveBeenCalled();
                expect(buildClient.getBuildReportsWithId).toHaveBeenCalled();
            });

            it('but does not have static analysis results', async () => {
                const artifact = undefined;
                let mockWebApi = jasmine.createSpy('WebApi').and.returnValue({
                    getBuildApi: jasmine.createSpy('getBuildApi').and.returnValue({
                        getBuilds: jasmine.createSpy('getBuilds'),
                        getArtifact: jasmine.createSpy('getArtifact').and.returnValue(artifact),
                    }),
                });
                spyOn(azdev, 'WebApi').and.callFake(mockWebApi);
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
        });
    });

    it('getBuildReportsWithId()', async () => {
        let mockWebApi = jasmine.createSpy('WebApi').and.returnValue({
            getBuildApi: jasmine.createSpy('getBuildApi').and.returnValue({
                getBuilds: jasmine.createSpy('getBuilds'),
                getArtifact: jasmine.createSpy('getArtifact'),
            }),
        });
        spyOn(azdev, 'WebApi').and.callFake(mockWebApi);
        buildClient = new BuildAPIClient();

        const mockArtifact = {
            resource: { downloadUrl: 'http://example.com/downloads/CodeAnalysisLogs.zip' },
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
        const expectedResult: any[] = [{
            name: "report1-sarif-pf-sast.sarif",
            artifactName: "CodeAnalysisLogs",
            filePath: "report1-sarif-pf-sast.sarif",
            buildId: 1,
            contentsPromise: 'report_1_content_promise_resolved'
        }, {
            name: "report2-sarif-pf-sast.sarif",
            artifactName: "CodeAnalysisLogs",
            filePath: "report2-sarif-pf-sast.sarif",
            buildId: 1,
            contentsPromise: 'report_2_content_promise_resolved'
        }];
        spyOn(buildClient, 'getArtifactContentZip').and.returnValue(new ArrayBuffer(0));
        spyOn(JSZip, 'loadAsync').and.returnValue(Promise.resolve(mockZip));

        const result = await buildClient.getBuildReportsWithId(mockArtifact, 1, FileSuffixEnum.SARIF_SUFFIX);
        expect(result).toEqual(expectedResult);
        expect(buildClient.getArtifactContentZip).toHaveBeenCalledWith(mockArtifact.resource.downloadUrl);
        expect(JSZip.loadAsync).toHaveBeenCalled();
    });

    describe ('getArtifactContentZip()', async () => {
        beforeEach(() => {
            let mockWebApi = jasmine.createSpy('WebApi').and.returnValue({
                getBuildApi: jasmine.createSpy('getBuildApi').and.returnValue({
                    getBuilds: jasmine.createSpy('getBuilds'),
                    getArtifact: jasmine.createSpy('getArtifact'),
                }),
            });
            spyOn(azdev, 'WebApi').and.callFake(mockWebApi);
            buildClient = new BuildAPIClient();
        })

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