import * as fs from 'fs';
import * as tl from '../../CodeCoverageQualityGate/node_modules/azure-pipelines-task-lib';
import * as azdev from '../../CodeCoverageQualityGate/node_modules/azure-devops-node-api';
import {
    TypeEnum,
    BuildStatusEnum,
    CodeCoverageQualityService
} from '../../CodeCoverageQualityGate/CodeCoverageQualityService';
import {
    DefaultBuildReportResults,
    DefaultBuildReportResultsStatus,
    FileEntry
} from '../../CodeCoverageQualityGate/BuildApiClient';
import { Build, BuildResult, BuildDefinitionReference } from '../../CodeCoverageQualityGate/node_modules/azure-devops-node-api/interfaces/BuildInterfaces';

type TestSettings = {
    defaultWorkingDirectory: string
    definitionName: string
    buildId: string
    buildNumber: string
    displayName: string
    type: string
    buildStatus: string
    threshold: string
    referenceBuildResult?: string
}

describe('Parasoft Findings Code Coverage Quality Gate', () => {
    let settings: TestSettings;
    let mockWebApi: any;
    let getVariableSpy: jasmine.Spy;
    let getInputSpy: jasmine.Spy;
    let azDevSpy: jasmine.Spy;
    let fakeCoverageFileEntry: FileEntry[];
    let fakeModifiedCoverageFileEntry: FileEntry[];
    let builds: Build[];
    let defaultBuildReportResults: DefaultBuildReportResults;
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
            referenceBuildResult: '{"originalPipelineName":"TestPipelineName","originalBuildNumber":"9"}'
        };

        mockWebApi = jasmine.createSpy('WebApi').and.returnValue({
            getBuildApi: jasmine.createSpy('getBuildApi').and.returnValue({
                getDefinitions: jasmine.createSpy('getBuilds'),
                getBuilds: jasmine.createSpy('getBuilds'),
                getArtifact: jasmine.createSpy('getArtifact')
            }),
        });

        fakeCoverageFileEntry = [{
            name: 'TestPipelineName',
            artifactName: 'CodeAnalysisLogs',
            filePath: 'coverage.xml',
            buildId: 9,
            contentsPromise: Promise.resolve(fs.readFileSync(__dirname + '/resources/coverage.xml', {encoding: "utf-8"}))
        }];

        fakeModifiedCoverageFileEntry = [{
            name: 'TestPipelineName',
            artifactName: 'CodeAnalysisLogs',
            filePath: 'modified_coverage.xml',
            buildId: 10,
            contentsPromise: Promise.resolve(fs.readFileSync(__dirname + '/resources/modified_coverage.xml', {encoding: "utf-8"}))
        }];

        builds = [{
            buildNumber : '9',
            result: BuildResult.Succeeded,
            id: 9
        }];

        defaultBuildReportResults = {
            status: DefaultBuildReportResultsStatus.OK,
            buildId: 9,
            buildNumber: '9',
            reports: fakeCoverageFileEntry
        }

        pipelines = [{
            name:'TestPipelineName',
        }];
    });

    it('Set quality gate type', () => {
        settings.type = 'unknown';
        let typeUnknown = createQualityGate(settings, mockWebApi);
        expect(tl.warning).toHaveBeenCalledWith('Invalid value for \'type\': unknown, using default value \'Overall\'');
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
        expect(tl.warning).toHaveBeenCalledWith("Invalid threshold value \'a10\', using default value 0.0");
    });

    it('Set quality gate status', () => {
        settings.buildStatus = 'unknown';
        let unknown = createQualityGate(settings, mockWebApi);
        expect(unknown.buildStatus).toEqual(BuildStatusEnum.FAILED);
        expect(tl.warning).toHaveBeenCalledWith('Invalid value for \'buildStatus\': unknown, using default value \'Failed\'');

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
        let setUpQualityGate = (currentFileEntry: any, currentBuildArtifact?: any, referenceBuildArtifact?: any, referenceFileEntry?: any) => {
            let codeCoverageQualityService = createQualityGate(settings, mockWebApi);
            spyOn(codeCoverageQualityService.buildClient, 'getBuildArtifact').and.returnValues(Promise.resolve(currentBuildArtifact), Promise.resolve(referenceBuildArtifact));
            spyOn(codeCoverageQualityService.buildClient, 'getSpecificPipelines').and.returnValue(Promise.resolve(pipelines));
            spyOn(codeCoverageQualityService.buildClient, 'getBuildReportsWithId').and.returnValues(Promise.resolve(currentFileEntry), Promise.resolve(referenceFileEntry));
            spyOn(codeCoverageQualityService.buildClient, 'getBuildsForSpecificPipeline').and.returnValue(Promise.resolve(builds));
            spyOn(codeCoverageQualityService.buildClient, 'getDefaultBuildReports').and.returnValue(Promise.resolve(defaultBuildReportResults));
            return codeCoverageQualityService;
        }

        let compareMarkDown = (expectedReportPath: string) => {
            let markDownDir = __dirname + '/ParasoftQualityGatesMD';
            let markDown = fs.readFileSync(markDownDir + '/Parasoft Code Coverage Quality Gate - Display name.md', {encoding: 'utf-8'});
            let expectedMarkDown = fs.readFileSync(expectedReportPath, {encoding: 'utf-8'});

            expect(markDown).toEqual(expectedMarkDown);
            fs.rmSync(markDownDir, {recursive: true});
        }

        let getMessage = (type: string, threshold: string) => {
            return 'Quality gate \'Type: '+ type +', Threshold: '+ threshold +', Reference pipeline: TestPipelineName, Reference build: 9\'';
        }

        describe('set quality gate type to overall', () => {
            const overallQualityGatePassMessage = getMessage('Overall', '60');
            const overallQualityGateFailMessage = getMessage('Overall', '90') + ' failed: build result is';
            const overallQualityGateSkipMessage = overallQualityGatePassMessage + ' skipped;';

            describe('When task process report and', () => {
                it('pass the quality gate, should set task success', async () => {
                    let codeCoverageQualityService = setUpQualityGate(fakeCoverageFileEntry, {});
                    await codeCoverageQualityService.run();

                    expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.Succeeded, overallQualityGatePassMessage + ' passed');
                    compareMarkDown(__dirname + '/resources/expect/Parasoft Code Coverage Quality Gate - Overall project.md');
                });

                it('not pass the quality gate, should set task failed', async () => {
                    settings.threshold = '90';

                    let codeCoverageQualityService = setUpQualityGate(fakeCoverageFileEntry, {});
                    await codeCoverageQualityService.run();

                    expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.Failed, overallQualityGateFailMessage + ' FAILED');
                    compareMarkDown(__dirname + '/resources/expect/Parasoft Code Coverage Quality Gate - Overall project - Failed.md');
                });

                it('not pass the quality gate, should set task unstable', async () => {
                    settings.threshold = '90';
                    settings.buildStatus = 'Unstable';

                    let codeCoverageQualityService = setUpQualityGate(fakeCoverageFileEntry, {});
                    await codeCoverageQualityService.run();

                    expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.SucceededWithIssues, overallQualityGateFailMessage + ' UNSTABLE');
                    compareMarkDown(__dirname + '/resources/expect/Parasoft Code Coverage Quality Gate - Overall project - Unstable.md');
                });
            });

            it('When no build artifact found', async () => {
                let codeCoverageQualityService = setUpQualityGate(fakeCoverageFileEntry, undefined);
                await codeCoverageQualityService.run();

                expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.SucceededWithIssues, overallQualityGateSkipMessage + ' no Parasoft coverage results were found in this build');
            });

            it('When get current build information without file entries', async () => {
                let codeCoverageQualityService = setUpQualityGate([]);
                await codeCoverageQualityService.run();

                expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.SucceededWithIssues, overallQualityGateSkipMessage + ' no Parasoft coverage results were found in this build');
            });
        });

        describe('set quality gate type to modified', () => {
            const modifiedQualityGatePassMessage = getMessage('Modified', '60');
            const modifiedQualityGateFailMessage = getMessage('Modified', '90') + ' failed: build result is';
            const modifiedQualityGateSkipMessage = modifiedQualityGatePassMessage + ' skipped;';

            beforeEach(() =>{
                settings.type = 'Modified';
            });

            describe('When task process report and', () => {
                it('pass the quality gate, should set task success', async () => {
                    let codeCoverageQualityService = setUpQualityGate(fakeModifiedCoverageFileEntry,{}, {}, fakeCoverageFileEntry);
                    await codeCoverageQualityService.run();

                    expect(tl.debug).toHaveBeenCalledWith('Retrieved Parasoft coverage results from the reference build \'TestPipelineName#9\'');
                    expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.Succeeded, modifiedQualityGatePassMessage + ' passed');
                    compareMarkDown(__dirname + '/resources/expect/Parasoft Code Coverage Quality Gate - Modified code lines.md');
                });

                it('not pass the quality gate, should set task failed', async () => {
                    settings.threshold = '90';

                    let codeCoverageQualityService = setUpQualityGate(fakeModifiedCoverageFileEntry,{}, {}, fakeCoverageFileEntry);
                    await codeCoverageQualityService.run();

                    expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.Failed, modifiedQualityGateFailMessage + ' FAILED');
                    compareMarkDown(__dirname + '/resources/expect/Parasoft Code Coverage Quality Gate - Modified code lines - Failed.md');
                });

                it('not pass the quality gate, should set task unstable', async () => {
                    settings.threshold = '90';
                    settings.buildStatus = 'Unstable';

                    let codeCoverageQualityService = setUpQualityGate(fakeModifiedCoverageFileEntry,{}, {}, fakeCoverageFileEntry);
                    await codeCoverageQualityService.run();

                    expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.SucceededWithIssues, modifiedQualityGateFailMessage + ' UNSTABLE');
                    compareMarkDown(__dirname + '/resources/expect/Parasoft Code Coverage Quality Gate - Modified code lines - Unstable.md');
                });
            });

            describe('When reference build is not specified and', () => {
                beforeEach(() => {
                    settings.type = "Modified"
                    settings.referenceBuildResult = '{"originalPipelineName":"TestPipelineName","originalBuildNumber":""}';
                });

                afterEach(() => {
                    expect(tl.debug).toHaveBeenCalledWith('No reference build has been set; using the last successful build in pipeline \'TestPipelineName\' as reference.');
                });

                it('use last successful build normally', async () => {
                    let codeCoverageQualityService = setUpQualityGate(fakeModifiedCoverageFileEntry,{}, fakeCoverageFileEntry);
                    await codeCoverageQualityService.run();

                    expect(tl.debug).toHaveBeenCalledWith('Set build \'TestPipelineName#9\' as the default reference build');
                    expect(tl.debug).toHaveBeenCalledWith('Quality Gate PASSED - Modified code coverage: 71.43% (5/7) - Threshold: 60%');
                    expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.Succeeded, 'Quality gate \'Type: Modified, Threshold: 60, Reference pipeline: TestPipelineName\' passed');
                    compareMarkDown(__dirname + '/resources/expect/Parasoft Code Coverage Quality Gate - Modified code lines.md');
                });

                it('use last successful build without Parasoft coverage results', async () => {
                    defaultBuildReportResults.status = DefaultBuildReportResultsStatus.NO_PARASOFT_RESULTS_IN_PREVIOUS_SUCCESSFUL_BUILDS;

                    let codeCoverageQualityService = setUpQualityGate(fakeModifiedCoverageFileEntry,{}, fakeCoverageFileEntry);
                    await codeCoverageQualityService.run();
                });

                it('no previous builds', async () => {
                    defaultBuildReportResults.status = DefaultBuildReportResultsStatus.NO_PREVIOUS_BUILD_WAS_FOUND;

                    let codeCoverageQualityService = setUpQualityGate(fakeModifiedCoverageFileEntry,{}, fakeCoverageFileEntry);
                    await codeCoverageQualityService.run();

                    expect(tl.debug).toHaveBeenCalledWith('No previous build was found in pipeline \'TestPipelineName\'');
                });

                it('no successful builds', async () => {
                    defaultBuildReportResults.status = DefaultBuildReportResultsStatus.NO_SUCCESSFUL_BUILD;

                    let codeCoverageQualityService = setUpQualityGate(fakeModifiedCoverageFileEntry,{}, fakeCoverageFileEntry);
                    await codeCoverageQualityService.run();
                });
            });

            it('When reference pipeline is not specified', async () => {
                settings.type = "Modified"
                settings.referenceBuildResult = '{"originalPipelineName":"","originalBuildNumber":"9"}';

                let codeCoverageQualityService = setUpQualityGate(fakeModifiedCoverageFileEntry,{}, {}, fakeCoverageFileEntry);
                await codeCoverageQualityService.run();

                expect(tl.debug).toHaveBeenCalledWith('No reference pipeline has been set; using the current pipeline as reference.');
                expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.Succeeded, 'Quality gate \'Type: Modified, Threshold: 60, Reference build: 9\' passed');
            });

            it('When reference pipeline and reference build are not specified', async () => {
                settings.type = "Modified"
                settings.referenceBuildResult = '{"originalPipelineName":"","originalBuildNumber":""}';

                let codeCoverageQualityService = setUpQualityGate(fakeModifiedCoverageFileEntry, fakeCoverageFileEntry);
                await codeCoverageQualityService.run();

                expect(tl.debug).toHaveBeenCalledWith('No reference pipeline has been set; using the current pipeline as reference.');
                expect(tl.debug).toHaveBeenCalledWith('No reference build has been set; using the last successful build in pipeline \'TestPipelineName\' as reference.');
                expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.Succeeded, 'Quality gate \'Type: Modified, Threshold: 60\' passed');
                compareMarkDown(__dirname + '/resources/expect/Parasoft Code Coverage Quality Gate - Modified code lines.md');
            });

            it('When specified reference pipeline is not unique', async () => {
                pipelines = [{name: 'TestPipelineName'}, {name: 'TestPipelineName'}];

                let codeCoverageQualityService = setUpQualityGate(fakeCoverageFileEntry, fakeCoverageFileEntry);
                await codeCoverageQualityService.run();

                expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.SucceededWithIssues, modifiedQualityGateSkipMessage + ' the specified reference pipeline \'TestPipelineName\' is not unique');
            });

            it('When specified reference pipeline is not found', async () => {
                pipelines = [];

                let codeCoverageQualityService = setUpQualityGate(fakeCoverageFileEntry, fakeCoverageFileEntry);
                await codeCoverageQualityService.run();

                expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.SucceededWithIssues, modifiedQualityGateSkipMessage + ' the specified reference pipeline \'TestPipelineName\' could not be found');
            });

            it('When specified reference build is current build', async () => {
                settings.referenceBuildResult = '{"originalPipelineName":"TestPipelineName","originalBuildNumber":"10"}'

                let codeCoverageQualityService = setUpQualityGate(fakeCoverageFileEntry, fakeCoverageFileEntry);
                await codeCoverageQualityService.run();

                expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.SucceededWithIssues, 'Quality gate \'Type: Modified, Threshold: 60, Reference pipeline: TestPipelineName, Reference build: 10\' skipped; the current build is not allowed to use as the reference');
            });

            it('When specified reference build is not unique', async () => {
                builds = [{buildNumber : '9', result: BuildResult.Succeeded, id: 9}, {buildNumber : '9', result: BuildResult.Failed, id: 9}];

                let codeCoverageQualityService = setUpQualityGate(fakeCoverageFileEntry, fakeCoverageFileEntry);
                await codeCoverageQualityService.run();

                expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.SucceededWithIssues, modifiedQualityGateSkipMessage + ' the specified reference build \'TestPipelineName#9\' is not unique');
            });

            it('When specified reference build is not found', async () => {
                builds = [];

                let codeCoverageQualityService = setUpQualityGate(fakeCoverageFileEntry, fakeCoverageFileEntry);
                await codeCoverageQualityService.run();

                expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.SucceededWithIssues, modifiedQualityGateSkipMessage + ' the specified reference build \'TestPipelineName#9\' could not be found');
            });

            it('When specified reference build is not successful or unstable', async () => {
                builds = [{buildNumber : '9', result: BuildResult.Canceled, id: 9}];

                let codeCoverageQualityService = setUpQualityGate(fakeCoverageFileEntry, fakeCoverageFileEntry);
                await codeCoverageQualityService.run();

                expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.SucceededWithIssues, modifiedQualityGateSkipMessage + ' the specified reference build \'TestPipelineName#9\' cannot be used. Only successful or unstable builds are valid references');
            });

            it('When no build artifact found in current build, quality Gate should be skipped', async () => {
                let codeCoverageQualityService = setUpQualityGate(fakeModifiedCoverageFileEntry, undefined, {}, fakeCoverageFileEntry);
                await codeCoverageQualityService.run();

                expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.SucceededWithIssues, modifiedQualityGateSkipMessage + ' no Parasoft coverage results were found in this build');
            });

            it('When no build artifact found in reference build, quality Gate should be skipped', async () => {
                let codeCoverageQualityService = setUpQualityGate(fakeModifiedCoverageFileEntry, {}, undefined, fakeCoverageFileEntry);
                await codeCoverageQualityService.run();

                expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.SucceededWithIssues, modifiedQualityGateSkipMessage + ' no Parasoft coverage results were found in the specified reference build: \'TestPipelineName#9\'');
            });

            it('When get current build information without file entries', async () => {
                let codeCoverageQualityService = setUpQualityGate([], {}, {}, fakeCoverageFileEntry);
                await codeCoverageQualityService.run();

                expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.SucceededWithIssues, modifiedQualityGateSkipMessage + ' no Parasoft coverage results were found in this build');
            });

            it('When get reference build information without file entries', async () => {
                let codeCoverageQualityService = setUpQualityGate(fakeModifiedCoverageFileEntry, {}, {}, []);
                await codeCoverageQualityService.run();

                expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.SucceededWithIssues, modifiedQualityGateSkipMessage + ' no Parasoft coverage results were found in the specified reference build: \'TestPipelineName#9\'');
            });
        });

        it('reference build result is undefined', async () => {
            settings.referenceBuildResult = undefined;
            let codeCoverageQualityService = setUpQualityGate(fakeCoverageFileEntry);
            await codeCoverageQualityService.run();

            expect(codeCoverageQualityService.originalReferencePipelineName).toBeUndefined();
            expect(codeCoverageQualityService.originalReferenceBuildNumber).toBeUndefined();
            expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.SucceededWithIssues, 'Quality gate \'Type: Overall, Threshold: 60\' skipped; please run \'Publish Parasoft Results\' task first');
        });

        it('get Build Artifact error, should print warning message', async () => {
            let codeCoverageQualityService = setUpQualityGate(fakeCoverageFileEntry, Promise.reject());
            await codeCoverageQualityService.run();

            expect(tl.warning).toHaveBeenCalledWith('Failed to process the quality gate \'Type: Overall, Threshold: 60, Reference pipeline: TestPipelineName, Reference build: 9\'. See logs for details.');
        });

        it('get Build Artifact error, should print warning message', async () => {
            let codeCoverageQualityService = setUpQualityGate(fakeCoverageFileEntry, Promise.reject());
            await codeCoverageQualityService.run();

            expect(tl.warning).toHaveBeenCalledWith('Failed to process the quality gate \'Type: Overall, Threshold: 60, Reference pipeline: TestPipelineName, Reference build: 9\'. See logs for details.');
        });
    });
});