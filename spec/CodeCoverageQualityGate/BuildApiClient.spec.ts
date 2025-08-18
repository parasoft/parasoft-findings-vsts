import { BuildAPIClient } from '../../CodeCoverageQualityGate/BuildApiClient';
import * as azdev from '../../CodeCoverageQualityGate/node_modules/azure-devops-node-api';
import * as tl from '../../CodeCoverageQualityGate/node_modules/azure-pipelines-task-lib';
import * as JSZip from '../../CodeCoverageQualityGate/node_modules/jszip';

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

    it('getPipelinesByName()', async () => {
        const pipelineResults: any[] = [{
            id: 1,
            name: 'pipeline-definition-name'
        }];
        mockWebApi().getBuildApi().getDefinitions.and.returnValue(Promise.resolve(pipelineResults));
        buildClient = new BuildAPIClient();

        const result = await buildClient.getPipelinesByName('pipelineName');
        expect(result).toEqual(pipelineResults);
    });

    it('getBuildsOfPipelineById()', async () => {
        const allBuildsInSpecificPipeline: any[] = [{
            id: 20,
            buildNumber: '20'
        }];
        mockWebApi().getBuildApi().getBuilds.and.returnValue(Promise.resolve(allBuildsInSpecificPipeline));
        buildClient = new BuildAPIClient();

        const pipelineId = 1;
        const result = await buildClient.getBuildsOfPipelineById(pipelineId);
        expect(result).toEqual(allBuildsInSpecificPipeline);
    });

    it('getCoberturaArtifactOfBuildById()', async () => {
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
        const result = await buildClient.getCoberturaArtifactOfBuildById(buildId);
        expect(result).toEqual(buildArtifactResult);
    });

    describe('getMergedCoberturaReportOfArtifact()', () => {
        it('when there is artifact content', async () => {
            buildClient = new BuildAPIClient();
    
            const mockArtifact = {
                id: 1,
                name: 'CodeCoverageLogs',
                resource: { downloadUrl: 'http://example.com/downloads/CodeCoverageLogs.zip' },
            };
            const mockedZip: any = {
                files: {
                    'CoberturaContainer/report-coverage-xml-cobertura.xml': {
                        name: 'CoberturaContainer/report-coverage-xml-cobertura.xml',
                        dir: false,
                        async: jasmine.createSpy('async').and.returnValue('report_content_promise_resolved')
                    },
                    'CoberturaContainer/parasoft-merged-cobertura.xml': {
                        name: 'CoberturaContainer/parasoft-merged-cobertura.xml',
                        dir: false, async: jasmine.createSpy('async').and.returnValue('parasoft-merged-cobertura_content_promise_resolved')
                    },
                    'CoberturaContainer/report.pdf': {
                        name: 'CoberturaContainer/report.pdf',
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
            const expectedResult: any = {
                name: "CoberturaContainer/parasoft-merged-cobertura.xml",
                contentsPromise: 'parasoft-merged-cobertura_content_promise_resolved'
            };
            spyOn(buildClient, 'getArtifactContentZip').and.returnValue(new ArrayBuffer(0));
            spyOn(JSZip, 'loadAsync').and.returnValue(Promise.resolve(mockedZip));

            const result = await buildClient.getMergedCoberturaReportOfArtifact(mockArtifact);
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
            spyOn(buildClient, 'getArtifactContentZip').and.returnValue(undefined);
            spyOn(JSZip, 'loadAsync');

            const result = await buildClient.getMergedCoberturaReportOfArtifact(mockArtifact);
            expect(result).toEqual(undefined);
            expect(buildClient.getArtifactContentZip).toHaveBeenCalledWith(mockArtifact.resource.downloadUrl);
            expect(JSZip.loadAsync).not.toHaveBeenCalled();
        });
    });

    describe ('getArtifactContentZip()', async () => {
        beforeEach(() => {
            buildClient = new BuildAPIClient();
            jasmine.DEFAULT_TIMEOUT_INTERVAL = 60000;
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