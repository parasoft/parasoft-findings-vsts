import * as tl from '../../TestResultsQualityGate/node_modules/azure-pipelines-task-lib';
import * as azdev from '../../TestResultsQualityGate/node_modules/azure-devops-node-api';
import * as fs from 'fs';
import {
    TestResultsQualityService,
    BuildStatusEnum,
    TypeEnum
} from "../../TestResultsQualityGate/TestResultsQualityService";
import {ShallowTestCaseResult} from "../../TestResultsQualityGate/node_modules/azure-devops-node-api/interfaces/TestInterfaces";
import {
    Build,
    BuildDefinitionReference
} from "../../TestResultsQualityGate/node_modules/azure-devops-node-api/interfaces/BuildInterfaces";
import {QualityGateTestUtils} from "../QualityGateTestUtils";

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

    let createQualityGateService = (setting: TestSettings, apiSpy: any): TestResultsQualityService => {
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

        return new TestResultsQualityService();
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
            referenceBuild: '{"referencePipelineInput":"TestPipelineName","referenceBuildInput":"260"}'
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
        let testResultsQualityService = createQualityGateService(settings, mockWebApi);
        expect(testResultsQualityService.threshold).toEqual(0);
        expect(tl.warning).toHaveBeenCalledWith('The threshold value \'-11\' is less than 0, the value is set to 0');

        settings.threshold = 'aa10';
        testResultsQualityService = createQualityGateService(settings, mockWebApi);
        expect(testResultsQualityService.threshold).toEqual(0);
        expect(tl.warning).toHaveBeenCalledWith('Invalid value for \'threshold\': \'aa10\', using default value 0');

        settings.threshold = '10';
        testResultsQualityService = createQualityGateService(settings, mockWebApi);
        expect(testResultsQualityService.threshold).toEqual(10);
    });

    it('Setting Quality Gate type', () => {
        settings.type = 'unknown';
        let testResultsQualityService = createQualityGateService(settings, mockWebApi);
        expect(tl.warning).toHaveBeenCalledWith('Invalid value for \'type\': unknown, using default value \'totalPassed\'');
        expect(testResultsQualityService.type).toEqual(TypeEnum.TOTAL_PASSED_TESTS);

        settings.type = 'totalPassed';
        testResultsQualityService = createQualityGateService(settings, mockWebApi);
        expect(testResultsQualityService.type).toEqual(TypeEnum.TOTAL_PASSED_TESTS);
        settings.type = 'totalFailed';
        testResultsQualityService = createQualityGateService(settings, mockWebApi);
        expect(testResultsQualityService.type).toEqual(TypeEnum.TOTAL_FAILED_TESTS);
        settings.type = 'totalExecuted';
        testResultsQualityService = createQualityGateService(settings, mockWebApi);
        expect(testResultsQualityService.type).toEqual(TypeEnum.TOTAL_EXECUTED_TESTS);
        settings.type = 'newlyFailed';
        testResultsQualityService = createQualityGateService(settings, mockWebApi);
        expect(testResultsQualityService.type).toEqual(TypeEnum.NEWLY_FAILED_TESTS);

        settings.type = 'TOTALPASSED';
        testResultsQualityService = createQualityGateService(settings, mockWebApi);
        expect(testResultsQualityService.type).toEqual(TypeEnum.TOTAL_PASSED_TESTS);
        settings.type = 'TOTALFAILED';
        testResultsQualityService = createQualityGateService(settings, mockWebApi);
        expect(testResultsQualityService.type).toEqual(TypeEnum.TOTAL_FAILED_TESTS);
        settings.type = 'TOTALEXECUTED';
        testResultsQualityService = createQualityGateService(settings, mockWebApi);
        expect(testResultsQualityService.type).toEqual(TypeEnum.TOTAL_EXECUTED_TESTS);
        settings.type = 'NEWLYFAILED';
        testResultsQualityService = createQualityGateService(settings, mockWebApi);
        expect(testResultsQualityService.type).toEqual(TypeEnum.NEWLY_FAILED_TESTS);
    });

    it('Setting Quality Gate buildStatus', () => {
        settings.buildStatus = 'unknown';
        let testResultsQualityService = createQualityGateService(settings, mockWebApi);
        expect(testResultsQualityService.buildStatus).toEqual(BuildStatusEnum.FAILED);
        expect(tl.warning).toHaveBeenCalledWith('Invalid value for \'buildStatus\': unknown, using default value \'failed\'');

        settings.buildStatus = 'unstable';
        testResultsQualityService = createQualityGateService(settings, mockWebApi);
        expect(testResultsQualityService.buildStatus).toEqual(BuildStatusEnum.UNSTABLE);
        settings.buildStatus = 'failed';
        testResultsQualityService = createQualityGateService(settings, mockWebApi);
        expect(testResultsQualityService.buildStatus).toEqual(BuildStatusEnum.FAILED);

        settings.buildStatus = 'Unstable';
        testResultsQualityService = createQualityGateService(settings, mockWebApi);
        expect(testResultsQualityService.buildStatus).toEqual(BuildStatusEnum.UNSTABLE);
        settings.buildStatus = 'Failed';
        testResultsQualityService = createQualityGateService(settings, mockWebApi);
        expect(testResultsQualityService.buildStatus).toEqual(BuildStatusEnum.FAILED);
    });

    describe('When evaluate quality gate and', () => {
        let config: QualityGateTestConfig = {
            pipelines: [],
            builds: [],
            currentTestResults: [],
            referenceTestResults: []
        }
        let setUpQualityGateService = (config: QualityGateTestConfig) => {
            let testResultsQualityService = createQualityGateService(settings, mockWebApi);
            spyOn(testResultsQualityService.apiClient, 'getPipelinesByName').and.returnValue(Promise.resolve(config.pipelines));
            spyOn(testResultsQualityService.apiClient, 'getBuildsOfPipelineById').and.returnValue(Promise.resolve(config.builds));
            spyOn(testResultsQualityService.apiClient, 'getTestResultsByBuildId').and.returnValues(Promise.resolve(config.currentTestResults), Promise.resolve(config.referenceTestResults));
            return testResultsQualityService;
        }

        it("didn't run 'Publish Parasoft Results' task first, should set task unstable", async () => {
            settings.referenceBuild = undefined;

            let testResultsQualityService = setUpQualityGateService(config);
            await testResultsQualityService.run();

            expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.SucceededWithIssues, 'Quality gate \'Type: Total passed tests, Threshold: 10\' skipped; please run \'Publish Parasoft Results\' task first');
        });

        it('didn\'t found test results in current build, should set task unstable', async () => {
            let testResultsQualityGateService = setUpQualityGateService(config);
            await testResultsQualityGateService.run();

            expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.SucceededWithIssues, 'Quality gate \'Type: Total passed tests, Threshold: 10\' skipped; no test results were found in this build');
        });

        it('error happen during processing quality gate, should warning', async () => {
            settings.referenceBuild = "{"

            let testResultsQualityGateService = setUpQualityGateService(config);
            await testResultsQualityGateService.run();

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
                settings.referenceBuild = `{"referencePipelineInput":"PipelineName","referenceBuildInput":"10"}`;

                let testResultsQualityGateService = setUpQualityGateService(config);
                await testResultsQualityGateService.run();

                expect(tl.warning).toHaveBeenCalledWith('Using the current build as the reference - all failed tests will be treated as new');
            });

            describe('reference pipeline is not specified and ', () => {
                afterEach(() => {
                    // When reference pipeline is specified should using the current pipeline
                    expect(tl.debug).toHaveBeenCalledWith('No reference pipeline has been set; using the current pipeline as reference.');
                });

                describe('reference build is not specified and', () => {
                    beforeEach(() => {
                        settings.referenceBuild = `{"referencePipelineInput":"","referenceBuildInput":""}`;
                    });

                    afterEach(() => {
                        // When reference build is specified should using the last successful build
                        expect(tl.debug).toHaveBeenCalledWith('No reference build has been set; using the last successful build in pipeline \'PipelineName\' as reference.');
                    });

                    it('only one build exists and it happens to be the current build', async () => {
                        config.builds = [{
                            id: 10,
                            buildNumber: '10'
                        }];

                        let testResultsQualityGateService = setUpQualityGateService(config);
                        await testResultsQualityGateService.run();

                        expect(tl.debug).toHaveBeenCalledWith('No previous build was found in pipeline \'PipelineName\' - all failed tests will be treated as new');
                    });

                    it('found no successful builds', async () => {
                        config.builds = [{
                            id: 12,
                            buildNumber: '12',
                            result: 32 //Canceled
                        }];

                        let testResultsQualityGateService = setUpQualityGateService(config);
                        await testResultsQualityGateService.run();

                        expect(tl.warning).toHaveBeenCalledWith('No successful reference build was found in pipeline \'PipelineName\' - all failed tests will be treated as new');
                    });

                    it('found successful builds without test results', async () => {
                        config.builds = [{
                            id: 12,
                            buildNumber: '12',
                            result: 2 //Succeeded
                        }];

                        let testResultsQualityGateService = setUpQualityGateService(config);
                        await testResultsQualityGateService.run();

                        expect(tl.warning).toHaveBeenCalledWith('No test results were found in any of the previous successful builds in pipeline \'PipelineName\' - all failed tests will be treated as new');
                    });

                    it('found successful builds with test results', async () => {
                        config.builds = [{
                            id: 12,
                            buildNumber: '12',
                            result: 2 //Succeeded
                        }];

                        config.referenceTestResults = [{
                            id: 1,
                            runId: 1,
                            refId: 1,
                            outcome: 'Passed'
                        }];

                        let testResultsQualityGateService = setUpQualityGateService(config);
                        await testResultsQualityGateService.run();

                        expect(tl.debug).toHaveBeenCalledWith('Set build \'PipelineName#12\' as the default reference build');
                    });
                });

                describe('reference build is specified and', () => {
                    beforeEach(() => {
                        settings.referenceBuild = `{"referencePipelineInput":"","referenceBuildInput":"12"}`;
                    });

                    it('reference build is not unique', async () => {
                        config.builds = [{
                                id: 12,
                                buildNumber: '12',
                                result: 2 //Succeeded
                            },
                            {
                                id: 13,
                                buildNumber: '12',
                                result: 2 //Succeeded
                            }];

                        let testResultsQualityGateService = setUpQualityGateService(config);
                        await testResultsQualityGateService.run();

                        expect(tl.warning).toHaveBeenCalledWith('The specified reference build \'PipelineName#12\' is not unique - all failed tests will be treated as new');
                    });

                    it('reference build not exist', async () => {
                        config.builds = [];

                        let testResultsQualityGateService = setUpQualityGateService(config);
                        await testResultsQualityGateService.run();

                        expect(tl.warning).toHaveBeenCalledWith('The specified reference build \'PipelineName#12\' could not be found - all failed tests will be treated as new');
                    });

                    it('reference build with test results not exist', async () => {
                        config.builds = [{
                            id: 12,
                            buildNumber: '12',
                            result: 2 //Succeeded
                        }];
                        config.referenceTestResults = [];

                        let testResultsQualityGateService = setUpQualityGateService(config);
                        await testResultsQualityGateService.run();

                        expect(tl.warning).toHaveBeenCalledWith('No test results were found in the specified reference build: \'PipelineName#12\' - all failed tests will be treated as new')
                    });

                    it('reference build with test results exist', async () => {
                        config.builds = [{
                            id: 12,
                            buildNumber: '12',
                            result: 2 //Succeeded
                        }];

                        let testResultsQualityGateService = setUpQualityGateService(config);
                        await testResultsQualityGateService.run();

                        expect(testResultsQualityGateService.apiClient.getTestResultsByBuildId).toHaveBeenCalledWith(<number>config.builds[0].id);
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

                    let testResultsQualityGateService = setUpQualityGateService(config);
                    await testResultsQualityGateService.run();

                    expect(tl.warning).toHaveBeenCalledWith('The specified reference pipeline \'TestPipelineName\' is not unique - all failed tests will be treated as new');
                });

                it('reference pipeline is not exist', async () => {
                    config.pipelines = [];

                    let testResultsQualityGateService = setUpQualityGateService(config);
                    await testResultsQualityGateService.run();

                    expect(tl.warning).toHaveBeenCalledWith('The specified reference pipeline \'TestPipelineName\' could not be found - all failed tests will be treated as new');
                });
            });
        });

        describe('process quality gate success when', () => {
            let markDownPath = __dirname + '/Parasoft Test Results Quality Gate - Display name.md';

            it('quality gate type is totalPassed and quality gate passed', async () => {
                settings.type = 'totalPassed';
                settings.threshold = '1';
                config.currentTestResults = [{
                    id: 1,
                    runId: 1,
                    refId: 1,
                    outcome: 'Passed'
                }];

                let testResultsQualityGateService = setUpQualityGateService(config);
                await testResultsQualityGateService.run();

                QualityGateTestUtils.compareMarkDown(markDownPath, __dirname + '/resources/expect/Parasoft Test Results Quality Gate - totalPassed-passed.md');
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

                let testResultsQualityGateService = setUpQualityGateService(config);
                await testResultsQualityGateService.run();

                QualityGateTestUtils.compareMarkDown(markDownPath, __dirname + '/resources/expect/Parasoft Test Results Quality Gate - totalFailed-failed.md');
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

                let testResultsQualityGateService = setUpQualityGateService(config);
                await testResultsQualityGateService.run();

                QualityGateTestUtils.compareMarkDown(markDownPath, __dirname + '/resources/expect/Parasoft Test Results Quality Gate - totalExecuted-unstable.md');
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
                    result: 2 // Succeeded
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
                }, {
                    id: 2,
                    runId: 1,
                    refId: 2,
                    outcome: 'Failed'
                }];
                settings.threshold = '2';

                let testResultsQualityGateService = setUpQualityGateService(config);
                await testResultsQualityGateService.run();

                QualityGateTestUtils.compareMarkDown(markDownPath, __dirname + '/resources/expect/Parasoft Test Results Quality Gate - newlyFailed-passed.md');
            });
        });
    });
})