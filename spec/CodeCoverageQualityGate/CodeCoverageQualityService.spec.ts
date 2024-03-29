import * as fs from 'fs';
import * as tl from '../../CodeCoverageQualityGate/node_modules/azure-pipelines-task-lib';
import * as azdev from '../../CodeCoverageQualityGate/node_modules/azure-devops-node-api';
import { TypeEnum, BuildStatusEnum, CodeCoverageQualityService } from '../../CodeCoverageQualityGate/CodeCoverageQualityService';
import { FileEntry } from '../../CodeCoverageQualityGate/BuildApiClient';
import { Build, BuildResult, BuildArtifact, BuildDefinitionReference } from '../../CodeCoverageQualityGate/node_modules/azure-devops-node-api/interfaces/BuildInterfaces';
import {QualityGateTestUtils} from "../QualityGateTestUtils";

type TestSettings = {
    defaultWorkingDirectory: string
    definitionName: string
    buildId: string
    buildNumber: string
    displayName: string
    type: string
    buildStatus: string
    threshold: string
    taskInstanceId: string
    referenceBuildResult?: string
}

describe('Parasoft Findings Code Coverage Quality Gate', () => {
    let settings: TestSettings;
    let mockWebApi: any;
    let getVariableSpy: jasmine.Spy;
    let getInputSpy: jasmine.Spy;
    let azDevSpy: jasmine.Spy;
    let fakeCoverageFileEntry: FileEntry;
    let fakeModifiedCoverageFileEntry: FileEntry;
    let builds: Build[];
    let pipelines: BuildDefinitionReference[];

    let createQualityGate = (setting: TestSettings, apiSpy: any): CodeCoverageQualityService => {
        getVariableSpy.and.callFake((param: string) => {
            switch (param) {
                case 'System.DefaultWorkingDirectory':
                    return setting.defaultWorkingDirectory;
                case 'Build.BuildId':
                    return setting.buildId;
                case 'Build.BuildNumber':
                    return setting.buildNumber;
                case 'Task.DisplayName':
                    return setting.displayName;
                case 'PF.ReferenceBuildResult':
                    return setting.referenceBuildResult;
                case 'Build.DefinitionName':
                    return setting.definitionName;
                case 'System.TaskInstanceId':
                    return setting.taskInstanceId;
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

        return new CodeCoverageQualityService();
    }

    beforeEach(() => {
        spyOn(tl, 'warning');
        spyOn(tl, 'debug');
        spyOn(tl, 'error');
        spyOn(tl, 'setResult');
        spyOn(tl, 'getEndpointAuthorization');
        getVariableSpy = spyOn(tl, 'getVariable').and.stub();
        getInputSpy = spyOn(tl, 'getInput').and.stub();
        azDevSpy = spyOn(azdev, 'WebApi').and.stub();
        spyOn(azdev, 'getPersonalAccessTokenHandler');

        settings = {
            defaultWorkingDirectory: __dirname,
            definitionName: 'TestPipelineName',
            buildId: '10',
            buildNumber: '10',
            displayName: 'Parasoft Code Coverage Quality Gate - Display name',
            type: 'Overall',
            buildStatus: 'Failed',
            threshold: '60',
            taskInstanceId: 'task-instance-id',
            referenceBuildResult: '{"referencePipelineInput":"TestPipelineName","referenceBuildInput":"9"}'
        };

        mockWebApi = jasmine.createSpy('WebApi').and.returnValue({
            getBuildApi: jasmine.createSpy('getBuildApi').and.returnValue({
                getDefinitions: jasmine.createSpy('getBuilds'),
                getBuilds: jasmine.createSpy('getBuilds'),
                getArtifact: jasmine.createSpy('getArtifact')
            }),
        });

        fakeCoverageFileEntry = {
            name: 'CoberturaContainer/parasoft-merged-cobertura.xml',
            contentsPromise: Promise.resolve(fs.readFileSync(__dirname + '/resources/coverage.xml', {encoding: "utf-8"}))
        };

        fakeModifiedCoverageFileEntry = {
            name: 'CoberturaContainer/parasoft-merged-cobertura.xml',
            contentsPromise: Promise.resolve(fs.readFileSync(__dirname + '/resources/modified_coverage.xml', {encoding: "utf-8"}))
        };

        builds = [{
            buildNumber : '9',
            result: BuildResult.Succeeded,
            id: 9
        }];

        pipelines = [{
            name:'TestPipelineName',
        }];
    });

    it('Set quality gate type', () => {
        settings.type = 'unknown';
        let typeUnknown = createQualityGate(settings, mockWebApi);
        expect(tl.warning).toHaveBeenCalledWith('Invalid value for \'type\': unknown, using default value \'overall\'');
        expect(typeUnknown.type).toEqual(TypeEnum.OVERALL);

        settings.type = 'overall';
        let typeTotal = createQualityGate(settings, mockWebApi);
        expect(typeTotal.type).toEqual(TypeEnum.OVERALL);
        settings.type = 'modified';
        let typeNew = createQualityGate(settings, mockWebApi);
        expect(typeNew.type).toEqual(TypeEnum.MODIFIED);

        settings.type = 'Overall';
        typeTotal = createQualityGate(settings, mockWebApi);
        expect(typeTotal.type).toEqual(TypeEnum.OVERALL);
        settings.type = 'Modified';
        typeNew = createQualityGate(settings, mockWebApi);
        expect(typeNew.type).toEqual(TypeEnum.MODIFIED);
    });

    it('Set quality gate thresholds', () => {
        settings.threshold="10";
        let codeCoverageQualityService = createQualityGate(settings, mockWebApi);
        expect(codeCoverageQualityService.threshold).toEqual(10);

        settings.threshold="10.11";
        codeCoverageQualityService = createQualityGate(settings, mockWebApi);
        expect(codeCoverageQualityService.threshold).toEqual(10.11);

        settings.threshold="101";
        codeCoverageQualityService = createQualityGate(settings, mockWebApi);
        expect(codeCoverageQualityService.threshold).toEqual(100.0);
        expect(tl.warning).toHaveBeenCalledWith("The threshold value \'101\' is more than 100, the value is set to 100.0");

        settings.threshold="-1";
        codeCoverageQualityService = createQualityGate(settings, mockWebApi);
        expect(codeCoverageQualityService.threshold).toEqual(0.0);
        expect(tl.warning).toHaveBeenCalledWith("The threshold value \'-1\' is less than 0, the value is set to 0.0");

        settings.threshold = "a10";
        codeCoverageQualityService = createQualityGate(settings, mockWebApi);
        expect(codeCoverageQualityService.threshold).toEqual(0.0);
        expect(tl.warning).toHaveBeenCalledWith("Invalid value for 'threshold': \'a10\', using default value 0.0");
    });

    it('Set quality gate status', () => {
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
        afterAll(() => {
            fs.rmSync(__dirname + '/ParasoftQualityGatesMD', {recursive: true});
        });

        let setUpQualityGate = (currentFileEntry: any, currentBuildArtifact: any, referenceFileEntry?: any, referenceBuildArtifact?: any, pipelineOfName?: any, buildsOfPipeline?: any) => {
            let codeCoverageQualityService = createQualityGate(settings, mockWebApi);
            spyOn(codeCoverageQualityService.buildClient, 'getPipelinesByName').and.returnValue(Promise.resolve(pipelineOfName ? pipelineOfName : pipelines));
            spyOn(codeCoverageQualityService.buildClient, 'getBuildsOfPipelineById').and.returnValue(Promise.resolve(buildsOfPipeline ? buildsOfPipeline : builds));
            spyOn(codeCoverageQualityService.buildClient, 'getCoberturaArtifactOfBuildById').and.returnValues(Promise.resolve(currentBuildArtifact), Promise.resolve(referenceBuildArtifact));
            spyOn(codeCoverageQualityService.buildClient, 'getMergedCoberturaReportOfArtifact').and.returnValues(Promise.resolve(currentFileEntry), Promise.resolve(referenceFileEntry));
            return codeCoverageQualityService;
        }
        let markDownPath = __dirname + '/ParasoftQualityGatesMD/task-instance-id/Parasoft Code Coverage Quality Gate - Display name.md';

        describe('set quality gate type to overall', () => {
            describe('When task process report and', () => {
                it('pass the quality gate, should set task successful', async () => {
                    let codeCoverageQualityService = setUpQualityGate(fakeCoverageFileEntry, {});
                    await codeCoverageQualityService.run();

                    expect(tl.debug).toHaveBeenCalledWith('Quality Gate PASSED - Overall code coverage: 63.64% (28/44) - Threshold: 60%');
                    expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.Succeeded,  'Quality gate \'Type: Overall, Threshold: 60\' passed');
                    QualityGateTestUtils.compareMarkDown(markDownPath, __dirname + '/resources/expect/Parasoft Code Coverage Quality Gate - Overall project - Passed.md');
                });

                it('pass the quality gate without coverage, should set task successful', async () => {
                    fakeCoverageFileEntry.contentsPromise = Promise.resolve(fs.readFileSync(__dirname + '/resources/coverage_empty.xml', {encoding: "utf-8"}));

                    let codeCoverageQualityService = setUpQualityGate(fakeCoverageFileEntry, {});
                    await codeCoverageQualityService.run();

                    expect(tl.debug).toHaveBeenCalledWith('Quality Gate PASSED - Overall code coverage: N/A (0/0) - Threshold: 60%');
                    expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.Succeeded,  'Quality gate \'Type: Overall, Threshold: 60\' passed');
                    QualityGateTestUtils.compareMarkDown(markDownPath, __dirname + '/resources/expect/Parasoft Code Coverage Quality Gate - Overall project - No code.md');
                });

                it('not pass the quality gate, should set task failed', async () => {
                    settings.threshold = '90';

                    let codeCoverageQualityService = setUpQualityGate(fakeCoverageFileEntry, {});
                    await codeCoverageQualityService.run();

                    expect(tl.debug).toHaveBeenCalledWith('Quality Gate FAILED - Overall code coverage: 63.64% (28/44) - Threshold: 90%');
                    expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.Failed,  'Quality gate \'Type: Overall, Threshold: 90\' failed: build result is FAILED');
                    QualityGateTestUtils.compareMarkDown(markDownPath, __dirname + '/resources/expect/Parasoft Code Coverage Quality Gate - Overall project - Failed.md');
                });

                it('not pass the quality gate, should set task unstable', async () => {
                    settings.threshold = '90';
                    settings.buildStatus = 'Unstable';

                    let codeCoverageQualityService = setUpQualityGate(fakeCoverageFileEntry, {});
                    await codeCoverageQualityService.run();

                    expect(tl.debug).toHaveBeenCalledWith('Quality Gate UNSTABLE - Overall code coverage: 63.64% (28/44) - Threshold: 90%');
                    expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.SucceededWithIssues,  'Quality gate \'Type: Overall, Threshold: 90\' failed: build result is UNSTABLE');
                    QualityGateTestUtils.compareMarkDown(markDownPath, __dirname + '/resources/expect/Parasoft Code Coverage Quality Gate - Overall project - Unstable.md');
                });
            });

            it('When no build artifact found', async () => {
                let codeCoverageQualityService = setUpQualityGate(fakeCoverageFileEntry, undefined);
                await codeCoverageQualityService.run();

                expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.SucceededWithIssues, 'Quality gate \'Type: Overall, Threshold: 60\' skipped; no Parasoft coverage results were found in this build');
            });

            it('When get current build information without file entry', async () => {
                let codeCoverageQualityService = setUpQualityGate(undefined, {});
                await codeCoverageQualityService.run();

                expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.SucceededWithIssues, 'Quality gate \'Type: Overall, Threshold: 60\' skipped; no Parasoft coverage results were found in this build');
            });

            it('When get Build Artifact error', async () => {
                let codeCoverageQualityService = createQualityGate(settings, mockWebApi);
                spyOn(codeCoverageQualityService.buildClient, 'getCoberturaArtifactOfBuildById').and.throwError('Expected error when get build artifact');

                await codeCoverageQualityService.run();

                expect(tl.warning).toHaveBeenCalledWith('Failed to process the quality gate \'Type: Overall, Threshold: 60\'. See logs for details.');
            });

            it('When reference build result is undefined', async () => {
                settings.referenceBuildResult = undefined;
                let codeCoverageQualityService = setUpQualityGate(fakeCoverageFileEntry, {});
                await codeCoverageQualityService.run();

                expect(codeCoverageQualityService.referenceInputs.pipelineName).toBeUndefined();
                expect(codeCoverageQualityService.referenceInputs.buildNumber).toBeUndefined();
                expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.SucceededWithIssues, 'Quality gate \'Type: Overall, Threshold: 60\' skipped; please run \'Publish Parasoft Results\' task first');
            });
        });

        describe('set quality gate type to modified', () => {

            beforeEach(() =>{
                settings.type = 'Modified';
            });

            describe('When task process report and', () => {
                it('pass the quality gate, should set task successful', async () => {
                    let codeCoverageQualityService = setUpQualityGate(fakeModifiedCoverageFileEntry, {}, fakeCoverageFileEntry, {});
                    await codeCoverageQualityService.run();

                    expect(tl.debug).toHaveBeenCalledWith('Quality Gate PASSED - Modified code coverage: 71.43% (5/7) - Threshold: 60%');
                    expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.Succeeded,  'Quality gate \'Type: Modified, Threshold: 60, Reference pipeline: TestPipelineName, Reference build: 9\' passed');
                    QualityGateTestUtils.compareMarkDown(markDownPath, __dirname + '/resources/expect/Parasoft Code Coverage Quality Gate - Modified code lines - Passed.md');
                });

                it('pass the quality gate without modified code coverage, should set task successful', async () => {
                    let codeCoverageQualityService = setUpQualityGate(fakeCoverageFileEntry, {}, fakeCoverageFileEntry, {});
                    await codeCoverageQualityService.run();

                    expect(tl.debug).toHaveBeenCalledWith('Quality Gate PASSED - Modified code coverage: N/A (0/0) - Threshold: 60%');
                    expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.Succeeded, 'Quality gate \'Type: Modified, Threshold: 60, Reference pipeline: TestPipelineName, Reference build: 9\' passed');
                    QualityGateTestUtils.compareMarkDown(markDownPath, __dirname + '/resources/expect/Parasoft Code Coverage Quality Gate - Modified code lines - No modified code.md');
                });

                it('not pass the quality gate, should set task failed', async () => {
                    settings.threshold = '90';

                    let codeCoverageQualityService = setUpQualityGate(fakeModifiedCoverageFileEntry, {}, fakeCoverageFileEntry, {});
                    await codeCoverageQualityService.run();

                    expect(tl.debug).toHaveBeenCalledWith('Quality Gate FAILED - Modified code coverage: 71.43% (5/7) - Threshold: 90%');
                    expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.Failed,  'Quality gate \'Type: Modified, Threshold: 90, Reference pipeline: TestPipelineName, Reference build: 9\' failed: build result is FAILED');
                    QualityGateTestUtils.compareMarkDown(markDownPath, __dirname + '/resources/expect/Parasoft Code Coverage Quality Gate - Modified code lines - Failed.md');
                });

                it('not pass the quality gate, should set task unstable', async () => {
                    settings.threshold = '90';
                    settings.buildStatus = 'Unstable';

                    let codeCoverageQualityService = setUpQualityGate(fakeModifiedCoverageFileEntry, {}, fakeCoverageFileEntry, {});
                    await codeCoverageQualityService.run();

                    expect(tl.debug).toHaveBeenCalledWith('Quality Gate UNSTABLE - Modified code coverage: 71.43% (5/7) - Threshold: 90%');
                    expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.SucceededWithIssues,  'Quality gate \'Type: Modified, Threshold: 90, Reference pipeline: TestPipelineName, Reference build: 9\' failed: build result is UNSTABLE');
                    QualityGateTestUtils.compareMarkDown(markDownPath, __dirname + '/resources/expect/Parasoft Code Coverage Quality Gate - Modified code lines - Unstable.md');
                });
            });

            describe('When reference build is not specified and', () => {
                beforeEach(() => {
                    settings.referenceBuildResult = '{"referencePipelineInput":"TestPipelineName","referenceBuildInput":""}';
                });

                afterEach(() => {
                    expect(tl.debug).toHaveBeenCalledWith('No reference build has been set; using the last successful build in pipeline \'TestPipelineName\' as reference.');
                });

                it('use last successful build', async () => {
                    let codeCoverageQualityService = setUpQualityGate(fakeModifiedCoverageFileEntry, {}, fakeCoverageFileEntry, {});
                    await codeCoverageQualityService.run();

                    expect(tl.debug).toHaveBeenCalledWith('Set build \'TestPipelineName#9\' as the default reference build');
                    expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.Succeeded, 'Quality gate \'Type: Modified, Threshold: 60, Reference pipeline: TestPipelineName\' passed');
                    QualityGateTestUtils.compareMarkDown(markDownPath, __dirname + '/resources/expect/Parasoft Code Coverage Quality Gate - Modified code lines - Passed.md');
                });

                it('use last successful build without Parasoft coverage results', async () => {
                    const currentBuildArtifact: BuildArtifact = { id: 9, name: 'TestArtifact' };
                    const referenceBuildArtifact: BuildArtifact = { id: 10, name: 'TestArtifact' };
                    let codeCoverageQualityService = setUpQualityGate(fakeModifiedCoverageFileEntry, currentBuildArtifact, undefined, referenceBuildArtifact);
                    await codeCoverageQualityService.run();
                    
                    expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.SucceededWithIssues,  'Quality gate \'Type: Modified, Threshold: 60, Reference pipeline: TestPipelineName\' skipped; no Parasoft coverage results were found in any of the previous successful builds in pipeline \'TestPipelineName\'');
                });

                it('no previous builds', async () => {
                    const buildsOfPipeline = [{ buildNumber : '10', result: BuildResult.Failed, id: 10 }];
                    const currentBuildArtifact: BuildArtifact = { id: 9, name: 'TestArtifact' };
                    const codeCoverageQualityService = setUpQualityGate(fakeModifiedCoverageFileEntry, currentBuildArtifact, fakeCoverageFileEntry, {}, undefined, buildsOfPipeline);
                    await codeCoverageQualityService.run();

                    expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.SucceededWithIssues,  'Quality gate \'Type: Modified, Threshold: 60, Reference pipeline: TestPipelineName\' skipped; no previous build was found in pipeline \'TestPipelineName\'');
                });

                it('no successful builds', async () => {
                    const buildsOfPipeline = [{ buildNumber : '9', result: BuildResult.Failed, id: 9 }];
                    const currentBuildArtifact: BuildArtifact = { id: 9, name: 'TestArtifact' };
                    const codeCoverageQualityService = setUpQualityGate(fakeModifiedCoverageFileEntry, currentBuildArtifact, fakeCoverageFileEntry, {}, undefined, buildsOfPipeline);
                    await codeCoverageQualityService.run();

                    expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.SucceededWithIssues,  'Quality gate \'Type: Modified, Threshold: 60, Reference pipeline: TestPipelineName\' skipped; no successful build was found in pipeline \'TestPipelineName\'');
                });
            });

            it('When reference pipeline is not specified, should use the current pipeline', async () => {
                settings.referenceBuildResult = '{"referencePipelineInput":"","referenceBuildInput":"9"}';

                let codeCoverageQualityService = setUpQualityGate(fakeModifiedCoverageFileEntry, {}, fakeCoverageFileEntry, {});
                await codeCoverageQualityService.run();

                expect(tl.debug).toHaveBeenCalledWith('No reference pipeline has been set; using the current pipeline as reference.');
                expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.Succeeded, 'Quality gate \'Type: Modified, Threshold: 60, Reference build: 9\' passed');
            });

            it('When reference pipeline and reference build are not specified, should use the current pipeline and last successful build', async () => {
                settings.referenceBuildResult = '{"referencePipelineInput":"","referenceBuildInput":""}';

                let codeCoverageQualityService = setUpQualityGate(fakeModifiedCoverageFileEntry, {}, fakeCoverageFileEntry, {});
                await codeCoverageQualityService.run();

                expect(tl.debug).toHaveBeenCalledWith('No reference pipeline has been set; using the current pipeline as reference.');
                expect(tl.debug).toHaveBeenCalledWith('No reference build has been set; using the last successful build in pipeline \'TestPipelineName\' as reference.');
                expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.Succeeded, 'Quality gate \'Type: Modified, Threshold: 60\' passed');
                QualityGateTestUtils.compareMarkDown(markDownPath, __dirname + '/resources/expect/Parasoft Code Coverage Quality Gate - Modified code lines - Passed.md');
            });

            it('When specified reference pipeline is not unique', async () => {
                pipelines = [{name: 'TestPipelineName'}, {name: 'TestPipelineName'}];

                let codeCoverageQualityService = setUpQualityGate(fakeModifiedCoverageFileEntry, {}, fakeCoverageFileEntry, {});
                await codeCoverageQualityService.run();

                expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.SucceededWithIssues,  'Quality gate \'Type: Modified, Threshold: 60, Reference pipeline: TestPipelineName, Reference build: 9\' skipped; the specified reference pipeline \'TestPipelineName\' is not unique');
            });

            it('When specified reference pipeline is not found', async () => {
                pipelines = [];

                let codeCoverageQualityService = setUpQualityGate(fakeModifiedCoverageFileEntry, {}, fakeCoverageFileEntry, {});
                await codeCoverageQualityService.run();

                expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.SucceededWithIssues,  'Quality gate \'Type: Modified, Threshold: 60, Reference pipeline: TestPipelineName, Reference build: 9\' skipped; the specified reference pipeline \'TestPipelineName\' could not be found');
            });

            it('When specified reference build is current build', async () => {
                settings.referenceBuildResult = '{"referencePipelineInput":"TestPipelineName","referenceBuildInput":"10"}'

                let codeCoverageQualityService = setUpQualityGate(fakeModifiedCoverageFileEntry, {}, fakeCoverageFileEntry, {});
                await codeCoverageQualityService.run();

                expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.SucceededWithIssues, 'Quality gate \'Type: Modified, Threshold: 60, Reference pipeline: TestPipelineName, Reference build: 10\' skipped; the current build is not allowed to be used as the reference');
            });

            it('When specified reference build is not unique', async () => {
                builds = [{buildNumber : '9', result: BuildResult.Succeeded, id: 9}, {buildNumber : '9', result: BuildResult.Failed, id: 9}];

                let codeCoverageQualityService = setUpQualityGate(fakeModifiedCoverageFileEntry, {}, fakeCoverageFileEntry, {});
                await codeCoverageQualityService.run();

                expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.SucceededWithIssues,  'Quality gate \'Type: Modified, Threshold: 60, Reference pipeline: TestPipelineName, Reference build: 9\' skipped; the specified reference build \'TestPipelineName#9\' is not unique');
            });

            it('When specified reference build is not found', async () => {
                builds = [];

                let codeCoverageQualityService = setUpQualityGate(fakeModifiedCoverageFileEntry, {}, fakeCoverageFileEntry, {});
                await codeCoverageQualityService.run();

                expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.SucceededWithIssues,  'Quality gate \'Type: Modified, Threshold: 60, Reference pipeline: TestPipelineName, Reference build: 9\' skipped; the specified reference build \'TestPipelineName#9\' could not be found');
            });

            it('When specified reference build is not successful or unstable', async () => {
                builds = [{buildNumber : '9', result: BuildResult.Canceled, id: 9}];

                let codeCoverageQualityService = setUpQualityGate(fakeModifiedCoverageFileEntry, {}, fakeCoverageFileEntry, {});
                await codeCoverageQualityService.run();

                expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.SucceededWithIssues,  'Quality gate \'Type: Modified, Threshold: 60, Reference pipeline: TestPipelineName, Reference build: 9\' skipped; the specified reference build \'TestPipelineName#9\' could not be used. Only successful or unstable builds are valid references');
            });

            it('When no build artifact found in current build', async () => {
                let codeCoverageQualityService = setUpQualityGate(fakeModifiedCoverageFileEntry, undefined, fakeCoverageFileEntry, {});
                await codeCoverageQualityService.run();

                expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.SucceededWithIssues, 'Quality gate \'Type: Modified, Threshold: 60, Reference pipeline: TestPipelineName, Reference build: 9\' skipped; no Parasoft coverage results were found in this build');
            });

            it('When no build artifact found in reference build', async () => {
                let codeCoverageQualityService = setUpQualityGate(fakeModifiedCoverageFileEntry, {}, fakeCoverageFileEntry, undefined);
                await codeCoverageQualityService.run();

                expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.SucceededWithIssues, 'Quality gate \'Type: Modified, Threshold: 60, Reference pipeline: TestPipelineName, Reference build: 9\' skipped; no Parasoft coverage results were found in the specified reference build: \'TestPipelineName#9\'');
            });

            it('When get current build information without file entry', async () => {
                let codeCoverageQualityService = setUpQualityGate(undefined, {}, fakeCoverageFileEntry, {});
                await codeCoverageQualityService.run();

                expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.SucceededWithIssues, 'Quality gate \'Type: Modified, Threshold: 60, Reference pipeline: TestPipelineName, Reference build: 9\' skipped; no Parasoft coverage results were found in this build');
            });

            it('When get reference build information without file entry', async () => {
                let codeCoverageQualityService = setUpQualityGate(fakeModifiedCoverageFileEntry, {}, undefined, {});
                await codeCoverageQualityService.run();

                expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.SucceededWithIssues, 'Quality gate \'Type: Modified, Threshold: 60, Reference pipeline: TestPipelineName, Reference build: 9\' skipped; no Parasoft coverage results were found in the specified reference build: \'TestPipelineName#9\'');
            });

            it('When get Build Artifact error', async () => {
                let codeCoverageQualityService = createQualityGate(settings, mockWebApi);
                spyOn(codeCoverageQualityService.buildClient, 'getCoberturaArtifactOfBuildById').and.throwError('Expected error when get build artifact');

                await codeCoverageQualityService.run();

                expect(tl.warning).toHaveBeenCalledWith('Failed to process the quality gate \'Type: Modified, Threshold: 60, Reference pipeline: TestPipelineName, Reference build: 9\'. See logs for details.');
            });

            it('When reference build result is undefined', async () => {
                settings.referenceBuildResult = undefined;
                let codeCoverageQualityService = setUpQualityGate(fakeModifiedCoverageFileEntry, {}, fakeCoverageFileEntry, {});
                await codeCoverageQualityService.run();

                expect(codeCoverageQualityService.referenceInputs.pipelineName).toBeUndefined();
                expect(codeCoverageQualityService.referenceInputs.buildNumber).toBeUndefined();
                expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.SucceededWithIssues, 'Quality gate \'Type: Modified, Threshold: 60\' skipped; please run \'Publish Parasoft Results\' task first');
            });
        });
    });
});