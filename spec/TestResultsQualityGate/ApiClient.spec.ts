import { APIClient } from '../../TestResultsQualityGate/ApiClient';
import * as azdev from '../../TestResultsQualityGate/node_modules/azure-devops-node-api';
import * as tl from '../../TestResultsQualityGate/node_modules/azure-pipelines-task-lib';
import { ShallowTestCaseResult } from "../../TestResultsQualityGate/node_modules/azure-devops-node-api/interfaces/TestInterfaces";

let apiClient: any;

describe('Test API Client for Test Results Quality Gate', () => {
    let mockWebApi: any;
    beforeEach(() => {
        spyOn(tl, 'getEndpointAuthorization');
        mockWebApi = jasmine.createSpy('WebApi').and.returnValue({
            getBuildApi: jasmine.createSpy('getBuildApi').and.returnValue({
                getDefinitions: jasmine.createSpy('getBuilds'),
                getBuilds: jasmine.createSpy('getBuilds')
            }),
            getTestApi: jasmine.createSpy('getTestApi').and.returnValue({
                getTestResultsByBuild: jasmine.createSpy('getTestResultsByBuild'),
                getTestResultDetailsForRelease: jasmine.createSpy('getTestResultDetailsForRelease')
            })
        });
        spyOn(azdev, 'WebApi').and.callFake(mockWebApi);
    });

    it('getPipelinesByName()', async () => {
        let exceptedResult: any[] = [{
            id: 1,
            name: 'test-definition-name'
        }];
        mockWebApi().getBuildApi().getDefinitions.and.returnValue(Promise.resolve(exceptedResult));
        apiClient = new APIClient();

        let result = await apiClient.getPipelinesByName('test-project', 'test-pipeline');
        expect(result).toEqual(exceptedResult);
    });

    it('getBuildsOfPipelineById()', async () => {
        let exceptedResult: any[] = [{
            id: 1,
            buildNumber: '20'
        }];
        mockWebApi().getBuildApi().getBuilds.and.returnValue(Promise.resolve(exceptedResult));
        apiClient = new APIClient();

        let result = await apiClient.getBuildsOfPipelineById('test-project', 1);
        expect(result).toEqual(exceptedResult);
    });

    it('getTestResultsByBuildId()', async () => {
        let exceptedResult: ShallowTestCaseResult[] = [{
            id: 1,
            runId: 1,
            refId: 1,
            outcome: 'Success'
        }];
        mockWebApi().getTestApi().getTestResultsByBuild.and.returnValue(Promise.resolve(exceptedResult));
        apiClient = new APIClient();

        let result = await apiClient.getTestResultsByBuildId('test-project', 1);
        expect(result).toEqual(exceptedResult);
    });

    it('getTestResultsByReleaseIdAndReleaseEnvId()', async () => {
        let exceptedResult: ShallowTestCaseResult[] = [{
            id: 100000,
            refId: 3612611,
            outcome: 'Failed'
        }];
        let apiResponse = {
            "groupByField": "",
            "resultsForGroup": [
                {
                    "groupByValue": "",
                    "resultsCountByOutcome": {
                        "Failed": {
                            "outcome": "Failed",
                            "count": 1,
                            "duration": "00:00:00.2560000"
                        }
                    },
                    "results": [
                        {
                            "id": 100000,
                            "project": {
                                "id": "4f0918b1-4e1a-4eae-9b64-53f990d87987"
                            },
                            "outcome": "Failed",
                            "testRun": {
                                "id": "581"
                            },
                            "priority": 0,
                            "testCaseReferenceId": 3612611
                        }
                    ]
                }
            ]
        };
        mockWebApi().getTestApi().getTestResultDetailsForRelease.and.returnValue(Promise.resolve(apiResponse));
        apiClient = new APIClient();

        let result = await apiClient.getTestResultsByReleaseIdAndReleaseEnvId(1, 1);
        expect(result).toEqual(exceptedResult);
    });
});