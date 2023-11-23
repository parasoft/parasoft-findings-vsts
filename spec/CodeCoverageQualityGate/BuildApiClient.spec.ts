import { BuildAPIClient, DefaultBuildReportResults, DefaultBuildReportResultsStatus, FileSuffixEnum } from '../../CodeCoverageQualityGate/BuildApiClient';
import * as azdev from '../../CodeCoverageQualityGate/node_modules/azure-devops-node-api';
import * as tl from '../../CodeCoverageQualityGate/node_modules/azure-pipelines-task-lib';
import * as JSZip from '../../CodeCoverageQualityGate/node_modules/jszip';
import { BuildResult } from '../../CodeCoverageQualityGate/node_modules/azure-devops-node-api/interfaces/BuildInterfaces';

let buildClient: any;

describe('Test Builds API Client for Code Coverage Quality Gate', () => {
    let mockWebApi: any;
    beforeEach(() => {
        spyOn(tl, 'getEndpointAuthorization');
        mockWebApi = jasmine.createSpy('WebApi').and.returnValue({
            getBuildApi: jasmine.createSpy('getBuildApi').and.returnValue({
                getDefinitions: jasmine.createSpy('getBuilds'),
                getBuilds: jasmine.createSpy('getBuilds'),
                getArtifact: jasmine.createSpy('getArtifact'),
            }),
        });
        spyOn(azdev, 'WebApi').and.callFake(mockWebApi);
    });

    it('getSpecificPipelines()', async () => {
        const pipelineResults: any[] = [{
            id: 1,
            name: 'pipeline-definition-name'
        }];
        mockWebApi().getBuildApi().getDefinitions.and.returnValue(Promise.resolve(pipelineResults));
        buildClient = new BuildAPIClient();

        const result = await buildClient.getSpecificPipelines('projectName', 'pipelineName');
        expect(result).toEqual(pipelineResults);
    });

    it('getBuildsForSpecificPipeline()', async () => {
        const allBuildsInSpecificPipeline: any[] = [{
            id: 20,
            buildNumber: '20'
        }];
        mockWebApi().getBuildApi().getBuilds.and.returnValue(Promise.resolve(allBuildsInSpecificPipeline));
        buildClient = new BuildAPIClient();

        const pipelineId = 1;
        const result = await buildClient.getBuildsForSpecificPipeline('projectName', pipelineId);
        expect(result).toEqual(allBuildsInSpecificPipeline);
    });

    it('getBuildArtifact()', async () => {
        const buildArtifactResult: any[] = [{
            id: 1,
            name: 'CodeCoverageLogs',
            resource: {
                downloadUrl: 'http://example.com/downloads/CodeCoverageLogs.zip'
            }
        }];
        mockWebApi().getBuildApi().getArtifact.and.returnValue(Promise.resolve(buildArtifactResult));
        buildClient = new BuildAPIClient();

        const buildId = 1;
        const result = await buildClient.getBuildArtifact('projectName', buildId, 'CodeCoverageLogs');
        expect(result).toEqual(buildArtifactResult);
    });

    describe('getDefaultBuildReports()', () => {
        it('when no previous build is found', async () => {
            const currentBuildId = 1;
            let allBuildsInPipeline: any[] = [{
                id: currentBuildId,
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
            const result = await buildClient.getDefaultBuildReports(allBuildsInPipeline, 'projectName', 'CodeCoverageLogs', FileSuffixEnum.COBERTURA_SUFFIX, currentBuildId);
            expect(result).toEqual(expectedResult);
            expect(buildClient.buildApi.getArtifact).not.toHaveBeenCalled();
            expect(buildClient.getBuildReportsWithId).not.toHaveBeenCalled();
        });

        it('when there is no successful build', async () => {
            const currentBuildId = 2;
            let allBuildsInPipeline: any[] = [{
                id: 1,
                buildNumber: '20',
                result: BuildResult.Failed
            }, {
                id: currentBuildId,
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
            const result = await buildClient.getDefaultBuildReports(allBuildsInPipeline, 'projectName', 'CodeCoverageLogs', FileSuffixEnum.COBERTURA_SUFFIX, currentBuildId);
            expect(result).toEqual(expectedResult);
            expect(buildClient.buildApi.getArtifact).not.toHaveBeenCalled();
            expect(buildClient.getBuildReportsWithId).not.toHaveBeenCalled();
        });

        describe('when there is a successful build', () => {
            let allBuildsInPipeline: any[];
            const currentBuildId = 2;
            const matchedReferenceBuildId = 1;
            const matchedReferenceBuildNumber = '20';
            beforeEach(() => {
                allBuildsInPipeline = [{
                    id: matchedReferenceBuildId,
                    buildNumber: matchedReferenceBuildNumber,
                    result: BuildResult.Succeeded
                }, {
                    id: currentBuildId,
                    buildNumber: '21',
                    result: BuildResult.PartiallySucceeded
                }];
            });

            it('and has code coverage results', async () => {
                const artifact = {
                    id: 1,
                    name: 'CodeCoverageLogs'
                };
                mockWebApi().getBuildApi().getArtifact.and.returnValue(Promise.resolve(artifact));
                buildClient = new BuildAPIClient();
                const coberturaContentString = '<?xml version="1.0" encoding="UTF-8"?><coverage line-rate="0.5" lines-covered="20" lines-valid="40" version="Jtest 2022.1.0"></coverage>';
                const fileEntries = [{
                    name: "CoberturaContainer/coverage-xml-cobertura.xml",
                    artifactName: artifact.name,
                    filePath: "CoberturaContainer/coverage-xml-cobertura.xml",
                    buildId: matchedReferenceBuildId,
                    contentsPromise: Promise.resolve(coberturaContentString)
                }];
                spyOn(buildClient, 'getBuildReportsWithId').and.returnValue(fileEntries);
                const expectedResult: DefaultBuildReportResults = {
                    status: DefaultBuildReportResultsStatus.OK,
                    buildId: matchedReferenceBuildId,
                    buildNumber: matchedReferenceBuildNumber,
                    reports: fileEntries
                };

                const result = await buildClient.getDefaultBuildReports(allBuildsInPipeline, 'projectName', artifact.name, FileSuffixEnum.COBERTURA_SUFFIX, currentBuildId);
                expect(result).toEqual(expectedResult);
                expect(buildClient.buildApi.getArtifact).toHaveBeenCalled();
                expect(buildClient.getBuildReportsWithId).toHaveBeenCalled();
            });

            describe('but does not have code coverage results', async () => {
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
                    const result = await buildClient.getDefaultBuildReports(allBuildsInPipeline, 'projectName', 'CodeCoverageLogs', FileSuffixEnum.COBERTURA_SUFFIX, currentBuildId);
                    expect(result).toEqual(expectedResult);
                    expect(buildClient.buildApi.getArtifact).toHaveBeenCalled();
                    expect(buildClient.getBuildReportsWithId).not.toHaveBeenCalled();
                });

                it('- artifact is not undefined but no files', async () => {
                    const artifact = {
                        id: 1,
                        name: 'CodeCoverageLogs'
                    };
                    mockWebApi().getBuildApi().getArtifact.and.returnValue(Promise.resolve(artifact));
                    buildClient = new BuildAPIClient();
                    const mockFileEntries: any[] = [];
                    spyOn(buildClient, 'getBuildReportsWithId').and.returnValue(mockFileEntries);

                    const expectedResult: DefaultBuildReportResults = {
                        status: DefaultBuildReportResultsStatus.NO_PARASOFT_RESULTS_IN_PREVIOUS_SUCCESSFUL_BUILDS,
                        buildId: matchedReferenceBuildId,
                        buildNumber: matchedReferenceBuildNumber,
                        reports: mockFileEntries
                    }
                    const result = await buildClient.getDefaultBuildReports(allBuildsInPipeline, 'projectName', artifact.name, FileSuffixEnum.COBERTURA_SUFFIX, currentBuildId);
                    expect(result).toEqual(expectedResult);
                    expect(buildClient.buildApi.getArtifact).toHaveBeenCalled();
                    expect(buildClient.getBuildReportsWithId).toHaveBeenCalled();
                });
            });
        });
    });

    describe('getBuildReportsWithId()', () => {
        it('when there is artifact content', async () => {
            buildClient = new BuildAPIClient();
    
            const mockArtifact = {
                id: 1,
                name: 'CodeCoverageLogs',
                resource: { downloadUrl: 'http://example.com/downloads/CodeCoverageLogs.zip' },
            };
            const mockedZip: any = {
                files: {
                    'CodeCoverageLogs/report1-coverage-xml-cobertura.xml': {
                        name: 'CodeCoverageLogs/report1-coverage-xml-cobertura.xml',
                        dir: false,
                        async: jasmine.createSpy('async').and.returnValue('report_1_content_promise_resolved')
                    },
                    'CodeCoverageLogs/report2-coverage-xml-cobertura.xml': {
                        name: 'CodeCoverageLogs/report2-coverage-xml-cobertura.xml',
                        dir: false, async: jasmine.createSpy('async').and.returnValue('report_2_content_promise_resolved')
                    },
                    'CodeCoverageLogs/report.pdf': {
                        name: 'CodeCoverageLogs/report.pdf',
                        dir: false, async: jasmine.createSpy('async').and.returnValue('report_other_content_promise_resolved')
                    },
                },
                async loadAsync() {
                    return this;
                },
                async file(name: keyof typeof mockedZip['files']) {
                    return this.files[name];
                },
            };
            const buildId = 1;
            const expectedResult: any[] = [{
                name: "report1-coverage-xml-cobertura.xml",
                artifactName: "CodeCoverageLogs",
                filePath: "report1-coverage-xml-cobertura.xml",
                buildId: buildId,
                contentsPromise: 'report_1_content_promise_resolved'
            }, {
                name: "report2-coverage-xml-cobertura.xml",
                artifactName: "CodeCoverageLogs",
                filePath: "report2-coverage-xml-cobertura.xml",
                buildId: buildId,
                contentsPromise: 'report_2_content_promise_resolved'
            }];
            spyOn(buildClient, 'getArtifactContentZip').and.returnValue(new ArrayBuffer(0));
            spyOn(JSZip, 'loadAsync').and.returnValue(Promise.resolve(mockedZip));

            const result = await buildClient.getBuildReportsWithId(mockArtifact, buildId, FileSuffixEnum.COBERTURA_SUFFIX);
            expect(result).toEqual(expectedResult);
            expect(buildClient.getArtifactContentZip).toHaveBeenCalledWith(mockArtifact.resource.downloadUrl);
            expect(JSZip.loadAsync).toHaveBeenCalled();
        });

        it('when no artifact content', async () => {
            buildClient = new BuildAPIClient();

            const mockArtifact = {
                id: 1,
                name: 'CodeCoverageLogs',
                resource: { downloadUrl: 'http://example.com/downloads/CodeCoverageLogs.zip/notFound' },
            };
            const buildId = 1;
            spyOn(buildClient, 'getArtifactContentZip').and.returnValue(undefined);
            spyOn(JSZip, 'loadAsync');

            const result = await buildClient.getBuildReportsWithId(mockArtifact, buildId, FileSuffixEnum.COBERTURA_SUFFIX);
            expect(result).toEqual([]);
            expect(buildClient.getArtifactContentZip).toHaveBeenCalledWith(mockArtifact.resource.downloadUrl);
            expect(JSZip.loadAsync).not.toHaveBeenCalled();
        });
    });

    describe ('getArtifactContentZip()', async () => {
        beforeEach(() => {
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
            const downloadUrl = 'https://example.com/CodeCoverageLogs.zip';
            const resultArrayBuffer = await buildClient.getArtifactContentZip(downloadUrl);
            const result: string = String.fromCharCode.apply(null, resultArrayBuffer); // Transfer arrayBuffer to string
            expect(result).toEqual('');
        });
    });
});