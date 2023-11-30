import * as tl from '../../TestResultsQualityGate/node_modules/azure-pipelines-task-lib';
import * as azdev from '../../TestResultsQualityGate/node_modules/azure-devops-node-api';
import * as fs from 'fs';
import {
    TestResultsQualityGateService,
    BuildStatusEnum,
    TypeEnum
} from "../../TestResultsQualityGate/TestResultsQualityGateService";
import {ShallowTestCaseResult} from "../../TestResultsQualityGate/node_modules/azure-devops-node-api/interfaces/TestInterfaces";
import {
    Build,
    BuildDefinitionReference
} from "../../TestResultsQualityGate/node_modules/azure-devops-node-api/interfaces/BuildInterfaces";

type TestSettings = {
    projectName: string,
    pipelineName: string,
    pipelineId: string,
    buildNumber: string,
    buildId: string,
    displayName: string,
    type: string,
    threshold: string,
    buildStatus: string,
    referenceBuild?: string
}

type QualityGateTestConfig = {
    pipelines: BuildDefinitionReference[],
    builds: Build[],
    currentTestResults: ShallowTestCaseResult[],
    referenceTestResults: ShallowTestCaseResult[]
}

describe('Parasoft Findings Test Results Quality Gate', () => {
    let settings: TestSettings;
    let mockWebApi: any;
    let getVariableSpy: jasmine.Spy;
    let getInputSpy: jasmine.Spy;
    let azDevSpy: jasmine.Spy;

    let createQualityGate = (setting: TestSettings, apiSpy: any): TestResultsQualityGateService => {
        getVariableSpy.and.callFake((param: string) => {
            switch (param) {
                case 'System.TeamProject':
                    return setting.projectName;
                case 'Build.DefinitionName':
                    return setting.pipelineName;
                case 'System.DefinitionId':
                    return setting.pipelineId;
                case 'Build.BuildNumber':
                    return setting.buildNumber;
                case 'Build.BuildId':
                    return setting.buildId;
                case 'Task.DisplayName':
                    return setting.displayName;
                case 'PF.ReferenceBuildResult':
                    return setting.referenceBuild;
            }
        });
        getInputSpy.and.callFake((param: string) => {
            switch (param) {
                case 'type':
                    return setting.type;
                case 'threshold':
                    return setting.threshold;
                case 'buildStatus':
                    return setting.buildStatus;
            }
        });
        azDevSpy.and.callFake(apiSpy);

        return new TestResultsQualityGateService();
    }

    beforeEach(() => {
        spyOn(tl, 'warning');
        spyOn(tl, 'debug');
        spyOn(tl, 'error');
        spyOn(tl, 'mkdirP');
        spyOn(tl, 'setResult');
        spyOn(tl, 'writeFile').and.callFake((path, content) => {
            fs.writeFileSync(path, content);
        });
        spyOn(tl, 'resolve').and.returnValue(__dirname + '/Parasoft Test Results Quality Gate - Display name.md');
        spyOn(tl, 'getEndpointAuthorization');
        spyOn(azdev, 'getPersonalAccessTokenHandler');
        getVariableSpy = spyOn(tl, 'getVariable').and.stub();
        getInputSpy = spyOn(tl, 'getInput').and.stub();
        azDevSpy = spyOn(azdev, 'WebApi').and.stub();


        settings = {
            projectName: 'TestProject',
            pipelineName: 'PipelineName',
            pipelineId: '1',
            buildNumber: '10',
            buildId: '10',
            displayName: 'Parasoft Test Results Quality Gate - Display name',
            type: 'totalPassed',
            buildStatus: 'Failed',
            threshold: '10',
            referenceBuild: '{"originalPipelineName":"TestPipelineName","originalBuildNumber":"260"}'
        };

        mockWebApi = jasmine.createSpy('WebApi').and.returnValue({
            getBuildApi: jasmine.createSpy('getBuildApi').and.returnValue({
                getDefinitions: jasmine.createSpy('getBuilds'),
                getBuilds: jasmine.createSpy('getBuilds')
            }),
            getTestApi: jasmine.createSpy('getTestApi').and.returnValue({
                getTestResultsByBuild: jasmine.createSpy('getTestResultsByBuild')
            })
        });
    });

    it('Setting Quality Gate thresholds', () => {
        settings.threshold = '-11';
        let testResultsQualityService = createQualityGate(settings, mockWebApi);
        expect(testResultsQualityService.threshold).toEqual(0);
        expect(tl.warning).toHaveBeenCalledWith('The threshold value \'-11\' is less than 0, the value is set to 0');

        settings.threshold = 'aa10';
        testResultsQualityService = createQualityGate(settings, mockWebApi);
        expect(testResultsQualityService.threshold).toEqual(0);
        expect(tl.warning).toHaveBeenCalledWith('Invalid threshold value \'aa10\', using default value 0');

        settings.threshold = '10';
        testResultsQualityService = createQualityGate(settings, mockWebApi);
        expect(testResultsQualityService.threshold).toEqual(10);
    });

    it('Setting Quality Gate type', () => {
        settings.type = 'unknown';
        let type = createQualityGate(settings, mockWebApi);
        expect(tl.warning).toHaveBeenCalledWith('Invalid value for \'type\': unknown, using default value \'totalPassed\'');
        expect(type.type).toEqual(TypeEnum.TOTAL_PASSED_TESTS);

        settings.type = 'totalPassed';
        type = createQualityGate(settings, mockWebApi);
        expect(type.type).toEqual(TypeEnum.TOTAL_PASSED_TESTS);
        settings.type = 'totalFailed';
        type = createQualityGate(settings, mockWebApi);
        expect(type.type).toEqual(TypeEnum.TOTAL_FAILED_TESTS);
        settings.type = 'totalExecuted';
        type = createQualityGate(settings, mockWebApi);
        expect(type.type).toEqual(TypeEnum.TOTAL_EXECUTED_TESTS);
        settings.type = 'newlyFailed';
        type = createQualityGate(settings, mockWebApi);
        expect(type.type).toEqual(TypeEnum.NEWLY_FAILED_TESTS);

        settings.type = 'TOTALPASSED';
        type = createQualityGate(settings, mockWebApi);
        expect(type.type).toEqual(TypeEnum.TOTAL_PASSED_TESTS);
        settings.type = 'TOTALFAILED';
        type = createQualityGate(settings, mockWebApi);
        expect(type.type).toEqual(TypeEnum.TOTAL_FAILED_TESTS);
        settings.type = 'TOTALEXECUTED';
        type = createQualityGate(settings, mockWebApi);
        expect(type.type).toEqual(TypeEnum.TOTAL_EXECUTED_TESTS);
        settings.type = 'NEWLYFAILED';
        type = createQualityGate(settings, mockWebApi);
        expect(type.type).toEqual(TypeEnum.NEWLY_FAILED_TESTS);
    });

    it('Setting Quality Gate buildStatus', () => {
        settings.buildStatus = 'unknown';
        let unknown = createQualityGate(settings, mockWebApi);
        expect(unknown.buildStatus).toEqual(BuildStatusEnum.FAILED);
        expect(tl.warning).toHaveBeenCalledWith('Invalid value for \'buildStatus\': unknown, using default value \'failed\'');

        settings.buildStatus = 'unstable';
        let unstable = createQualityGate(settings, mockWebApi);
        expect(unstable.buildStatus).toEqual(BuildStatusEnum.UNSTABLE);
        settings.buildStatus = 'failed';
        let failed = createQualityGate(settings, mockWebApi);
        expect(failed.buildStatus).toEqual(BuildStatusEnum.FAILED);

        settings.buildStatus = 'Unstable';
        unstable = createQualityGate(settings, mockWebApi);
        expect(unstable.buildStatus).toEqual(BuildStatusEnum.UNSTABLE);
        settings.buildStatus = 'Failed';
        failed = createQualityGate(settings, mockWebApi);
        expect(failed.buildStatus).toEqual(BuildStatusEnum.FAILED);
    });

    describe('When evaluate quality gate and', () => {
        let config: QualityGateTestConfig = {
            pipelines: [],
            builds: [],
            currentTestResults: [],
            referenceTestResults: []
        }
        let setUpQualityGate = (config: QualityGateTestConfig) => {
            let qualityGateService = createQualityGate(settings, mockWebApi);
            spyOn(qualityGateService.apiClient, 'getPipelinesByName').and.returnValue(Promise.resolve(config.pipelines));
            spyOn(qualityGateService.apiClient, 'getBuildsOfPipelineById').and.returnValue(Promise.resolve(config.builds));
            spyOn(qualityGateService.apiClient, 'getTestResultsByBuildId').and.returnValues(Promise.resolve(config.currentTestResults), Promise.resolve(config.referenceTestResults));
            return qualityGateService;
        }
        let compareMarkDown = (expectedReportPath: string) => {
            let markDownPath = __dirname + '/Parasoft Test Results Quality Gate - Display name.md';
            let markDown = fs.readFileSync(markDownPath, {encoding: 'utf-8'});
            let expectedMarkDown = fs.readFileSync(expectedReportPath, {encoding: 'utf-8'});

            expect(markDown).toEqual(expectedMarkDown);
            fs.rmSync(markDownPath, {recursive: true});
        }

        it("didn't run 'Publish Parasoft Results' task first, should set task unstable", async () => {
            settings.referenceBuild = undefined;

            let qualityGates = setUpQualityGate(config);
            await qualityGates.run();

            expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.SucceededWithIssues, 'Quality gate \'Type: Total passed tests, Threshold: 10\' skipped; please run \'Publish Parasoft Results\' task first');
        });

        it('didn\'t found test results in current build, should set task unstable', async () => {
            let qualityGates = setUpQualityGate(config);
            await qualityGates.run();

            expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.SucceededWithIssues, 'Quality gate \'Type: Total passed tests, Threshold: 10\' skipped; no test results were found in this build');
        });

        it('error happen during processing quality gate, should warning', async () => {
            settings.referenceBuild = "{"

            let qualityGates = setUpQualityGate(config);
            await qualityGates.run();

            expect(tl.warning).toHaveBeenCalledWith('Failed to process the quality gate \'Type: Total passed tests, Threshold: 10\'. See logs for details.');
        });

        describe('error happens during handle reference build when', () => {
            beforeEach(() => {
                settings.type = 'newlyFailed';
                config.currentTestResults = [{
                    id: 1,
                    runId: 1,
                    refId: 1,
                    outcome: 'Passed'
                }, {
                    id: 2,
                    runId: 1,
                    refId: 1,
                    outcome: 'Passed'
                }];
            });

            it('reference build is current build', async () => {
                settings.referenceBuild = `{"originalPipelineName":"PipelineName","originalBuildNumber":"10"}`;

                let qualityGates = setUpQualityGate(config);
                await qualityGates.run();

                expect(tl.warning).toHaveBeenCalledWith('Using the current build as the reference - all failed tests will be treated as new');
            });

            describe('reference pipeline is not specified and ', () => {
                afterEach(() => {
                    // When reference pipeline is specified should using the current pipeline
                    expect(tl.debug).toHaveBeenCalledWith('No reference pipeline has been set; using the current pipeline as reference.');
                });

                describe('reference build is not specified and', () => {
                    beforeEach(() => {
                        settings.referenceBuild = `{"originalPipelineName":"","originalBuildNumber":""}`;
                    });

                    afterEach(() => {
                        // When reference build is specified should using the last completed build
                        expect(tl.debug).toHaveBeenCalledWith('No reference build has been set; using the last completed build in pipeline \'PipelineName\' as reference.');
                    });

                    it('only one build exists and it happens to be the current build', async () => {
                        config.builds = [{
                            id: 10,
                            buildNumber: '10'
                        }];

                        let qualityGates = setUpQualityGate(config);
                        await qualityGates.run();

                        expect(tl.debug).toHaveBeenCalledWith('No previous build was found in pipeline \'PipelineName\' - all failed tests will be treated as new');
                    });

                    it('found no completed builds', async () => {
                        config.builds = [{
                            id: 12,
                            buildNumber: '12',
                            result: 32
                        }];

                        let qualityGates = setUpQualityGate(config);
                        await qualityGates.run();

                        expect(tl.warning).toHaveBeenCalledWith('No completed reference build was found in pipeline \'PipelineName\' - all failed tests will be treated as new');
                    });

                    it('found completed builds', async () => {
                        config.builds = [{
                            id: 12,
                            buildNumber: '12',
                            result: 2
                        }];

                        let qualityGates = setUpQualityGate(config);
                        await qualityGates.run();

                        expect(tl.debug).toHaveBeenCalledWith("Set build 'PipelineName#12' as the default reference build");
                    });
                });

                describe('reference build is specified and', () => {
                    beforeEach(() => {
                        settings.referenceBuild = `{"originalPipelineName":"","originalBuildNumber":"12"}`;
                    });

                    it('reference build is not unique', async () => {
                        config.builds = [{
                            id: 12,
                            buildNumber: '12',
                            result: 2
                        },
                            {
                                id: 13,
                                buildNumber: '12',
                                result: 2
                            }];

                        let qualityGates = setUpQualityGate(config);
                        await qualityGates.run();

                        expect(tl.warning).toHaveBeenCalledWith('The specified reference build \'PipelineName#12\' is not unique - all failed tests will be treated as new');
                    });

                    it('reference build not exist', async () => {
                        config.builds = [];

                        let qualityGates = setUpQualityGate(config);
                        await qualityGates.run();

                        expect(tl.warning).toHaveBeenCalledWith('The specified reference build \'PipelineName#12\' could not be found - all failed tests will be treated as new');
                    });

                    it('reference build exist', async () => {
                        config.builds = [{
                            id: 12,
                            buildNumber: '12',
                            result: 2
                        }];

                        let qualityGates = setUpQualityGate(config);
                        await qualityGates.run();

                        expect(qualityGates.apiClient.getTestResultsByBuildId).toHaveBeenCalledWith(settings.projectName, <number>config.builds[0].id);
                    });
                });
            });

            describe('reference pipeline and build is specified and', () => {
                it('reference pipeline is not unique', async () => {
                    config.pipelines = [{
                        id: 1,
                        name: 'TestPipelineName'
                    }, {
                        id: 2,
                        name: 'TestPipelineName'
                    }];

                    let qualityGates = setUpQualityGate(config);
                    await qualityGates.run();

                    expect(tl.warning).toHaveBeenCalledWith('The specified reference pipeline \'TestPipelineName\' is not unique - all failed tests will be treated as new');
                });

                it('reference pipeline is not exist', async () => {
                    config.pipelines = [];

                    let qualityGates = setUpQualityGate(config);
                    await qualityGates.run();

                    expect(tl.warning).toHaveBeenCalledWith('The specified reference pipeline \'TestPipelineName\' could not be found - all failed tests will be treated as new');
                });
            });
        });

        describe('process quality gate success when', () => {
            it('quality gate type is totalPassed and quality gate passed', async () => {
                settings.type = 'totalPassed';
                settings.threshold = '1';
                config.currentTestResults = [{
                    id: 1,
                    runId: 1,
                    refId: 1,
                    outcome: 'Passed'
                }];

                let qualityGates = setUpQualityGate(config);
                await qualityGates.run();

                compareMarkDown(__dirname + '/resources/expect/Parasoft Test Results Quality Gate - totalPassed-passed.md');

            });

            it('quality gate type is totalFailed and quality gate failed', async () => {
                settings.type = 'totalFailed';
                settings.threshold = '0';
                config.currentTestResults = [{
                    id: 1,
                    runId: 1,
                    refId: 1,
                    outcome: 'Failed'
                }];

                let qualityGates = setUpQualityGate(config);
                await qualityGates.run();

                compareMarkDown(__dirname + '/resources/expect/Parasoft Test Results Quality Gate - totalFailed-failed.md');
            });

            it('quality gate type is totalExecuted and unstable', async () => {
                settings.type = 'totalExecuted';
                settings.buildStatus = 'unstable';
                settings.threshold = '2';
                config.currentTestResults = [{
                    id: 1,
                    runId: 1,
                    refId: 1,
                    outcome: 'Failed'
                }];

                let qualityGates = setUpQualityGate(config);
                await qualityGates.run();

                compareMarkDown(__dirname + '/resources/expect/Parasoft Test Results Quality Gate - totalExecuted-unstable.md');
            });

            it('quality gate type is newly failed and passed', async () => {
                settings.type = 'newlyFailed';
                config.pipelines = [{
                    id: 1,
                    name: 'TestPipelineName'
                }];
                config.builds = [{
                    id: 12,
                    buildNumber: '260',
                    result: 2
                }];
                config.currentTestResults = [{
                    id: 1,
                    runId: 1,
                    refId: 1,
                    outcome: 'Failed'
                }, {
                    id: 2,
                    runId: 1,
                    refId: 2,
                    outcome: 'Failed'
                }];
                config.referenceTestResults = [{
                    id: 1,
                    runId: 1,
                    refId: 1,
                    outcome: 'Passed'
                },
                    {
                        id: 2,
                        runId: 1,
                        refId: 2,
                        outcome: 'Failed'
                    }];
                settings.threshold = '2';

                let qualityGates = setUpQualityGate(config);
                await qualityGates.run();

                compareMarkDown(__dirname + '/resources/expect/Parasoft Test Results Quality Gate - newlyFailed-passed.md');
            });
        });
    });
})