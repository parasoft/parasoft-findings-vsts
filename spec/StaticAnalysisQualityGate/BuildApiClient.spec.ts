import * as azdev from '../../StaticAnalysisQualityGate/node_modules/azure-devops-node-api';
import { BuildAPIClient } from "../../StaticAnalysisQualityGate/BuildApiClient";
import * as tl from '../../StaticAnalysisQualityGate/node_modules/azure-pipelines-task-lib';
import * as JSZip from '../../StaticAnalysisQualityGate/node_modules/jszip';

let buildClient: any;

describe('Test Builds API Client for Static Analysis Quality Gate', () => {
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

    it('getSarifArtifactOfBuildById()', async () => {
        const exceptedResult: any[] = [{
            id: 1,
            name: 'CodeAnalysisLogs'
        }];
        mockWebApi().getBuildApi().getArtifact.and.returnValue(Promise.resolve(exceptedResult));
        buildClient = new BuildAPIClient();

        const result = await buildClient.getSarifArtifactOfBuildById('test-project', 1);
        expect(result).toEqual(exceptedResult);
    });

    it('getSarifReportsOfArtifact()', async () => {
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
            contentsPromise: 'report_1_content_promise_resolved'
        }, {
            name: "report2-sarif-pf-sast.sarif",
            contentsPromise: 'report_2_content_promise_resolved'
        }];
        spyOn(buildClient, 'getArtifactContentZip').and.returnValue(new ArrayBuffer(0));
        spyOn(JSZip, 'loadAsync').and.returnValue(Promise.resolve(mockZip));

        const result = await buildClient.getSarifReportsOfArtifact(mockArtifact, 1);
        expect(result).toEqual(expectedResult);
        expect(buildClient.getArtifactContentZip).toHaveBeenCalledWith(mockArtifact.resource.downloadUrl);
        expect(JSZip.loadAsync).toHaveBeenCalled();
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
            const downloadUrl = 'https://example.com/CodeAnalysisLogs.zip';
            const resultArrayBuffer = await buildClient.getArtifactContentZip(downloadUrl);
            const result: string = String.fromCharCode.apply(null, resultArrayBuffer); // Transfer arrayBuffer to string
            expect(result).toEqual('');
        });
    });
})