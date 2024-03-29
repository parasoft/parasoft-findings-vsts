import * as tl from '../../StaticAnalysisQualityGate/node_modules/azure-pipelines-task-lib';
import * as azdev from '../../StaticAnalysisQualityGate/node_modules/azure-devops-node-api';
import {
    BuildStatusEnum,
    SeverityEnum,
    StaticAnalysisQualityService,
    TypeEnum
} from "../../StaticAnalysisQualityGate/StaticAnalysisQualityService";
import {FileEntry} from "../../StaticAnalysisQualityGate/BuildApiClient";
import * as fs from "fs";
import {QualityGateTestUtils} from "../QualityGateTestUtils";


type TestSettings = {
    defaultWorkingDirectory: string
    teamProject: string
    buildId: string
    buildNumber: string
    definitionId: string
    displayName: string
    type: string
    severity: string
    buildStatus: string
    threshold: string
    taskInstanceId: string
    referenceBuildResult?: string
}

describe('Parasoft Findings Static Analysis Quality Gate', () => {
    let settings: TestSettings;
    let mockWebApi: any;
    let getVariableSpy: jasmine.Spy;
    let getInputSpy: jasmine.Spy;
    let azDevSpy: jasmine.Spy;
    let fakeFileEntry: FileEntry[];

    let createQualityGate = (setting: TestSettings, apiSpy: any): StaticAnalysisQualityService => {
        getVariableSpy.and.callFake((param: string) => {
            switch (param) {
                case 'System.DefaultWorkingDirectory':
                    return setting.defaultWorkingDirectory;
                case 'System.TeamProject':
                    return setting.teamProject;
                case 'Build.BuildId':
                    return setting.buildId;
                case 'Build.BuildNumber':
                    return setting.buildNumber;
                case 'System.DefinitionId':
                    return setting.definitionId;
                case 'Task.DisplayName':
                    return setting.displayName;
                case 'PF.ReferenceBuildResult':
                    return setting.referenceBuildResult;
                case 'System.TaskInstanceId':
                    return setting.taskInstanceId;
            }
        });
        getInputSpy.and.callFake((param: string) => {
            switch (param) {
                case 'type':
                    return setting.type;
                case 'severity':
                    return setting.severity;
                case 'buildStatus':
                    return setting.buildStatus;
                case 'threshold':
                    return setting.threshold;
            }
        });
        azDevSpy.and.callFake(apiSpy);

        return new StaticAnalysisQualityService();
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
            teamProject: 'Test',
            buildId: '10',
            buildNumber: '10',
            definitionId: '1',
            displayName: 'Parasoft Static Analysis Quality Gate - Display name',
            type: 'Total',
            severity: 'Issue',
            buildStatus: 'Failed',
            threshold: '10',
            taskInstanceId: 'task-instance-id',
            referenceBuildResult: '{"referencePipelineInput":"TestPipelineName","referenceBuildInput":"260","staticAnalysis":{"pipelineName":"TestPipelineName","buildId":"260","buildNumber":"260","warningMessage":"any warning messages when getting Parasoft static analysis reports from reference build"}}'
        };

        mockWebApi = jasmine.createSpy('WebApi').and.returnValue({
            getBuildApi: jasmine.createSpy('getBuildApi').and.returnValue({
                getBuilds: jasmine.createSpy('getBuilds'),
                getArtifact: jasmine.createSpy('getArtifact'),
            }),
        });

        fakeFileEntry = [{
            name: 'report-pf-sast.sarif',
            contentsPromise: Promise.resolve(fs.readFileSync(__dirname + '/resources/report-pf-sast.sarif', {encoding: "utf-8"}))
        }];
    });

    it('Setting Quality Gate thresholds', () => {
        settings.threshold = 'a10';
        let staticAnalysisQualityService = createQualityGate(settings, mockWebApi);
        expect(staticAnalysisQualityService.threshold).toEqual(0);
        expect(tl.warning).toHaveBeenCalledWith('Invalid value for \'threshold\': a10, using default value 0');

        settings.threshold = '-1';
        staticAnalysisQualityService = createQualityGate(settings, mockWebApi);
        expect(staticAnalysisQualityService.threshold).toEqual(0);
        expect(tl.warning).toHaveBeenCalledWith('The threshold value \'-1\' is less than 0, the value is set to 0');

        settings.threshold = '10a';
        staticAnalysisQualityService = createQualityGate(settings, mockWebApi);
        expect(staticAnalysisQualityService.threshold).toEqual(10);

        settings.threshold='10.0';
        staticAnalysisQualityService = createQualityGate(settings, mockWebApi);
        expect(staticAnalysisQualityService.threshold).toEqual(10);
    });

    it('Setting Quality Gate type', () => {
        settings.type = 'unknown';
        let typeUnknown = createQualityGate(settings, mockWebApi);
        expect(tl.warning).toHaveBeenCalledWith('Invalid value for \'type\': unknown, using default value \'total\'');
        expect(typeUnknown.type).toEqual(TypeEnum.TOTAl);

        settings.type = 'total';
        let typeTotal = createQualityGate(settings, mockWebApi);
        expect(typeTotal.type).toEqual(TypeEnum.TOTAl);
        settings.type = 'new';
        let typeNew = createQualityGate(settings, mockWebApi);
        expect(typeNew.type).toEqual(TypeEnum.NEW);

        settings.type = 'Total';
        typeTotal = createQualityGate(settings, mockWebApi);
        expect(typeTotal.type).toEqual(TypeEnum.TOTAl);
        settings.type = 'New';
        typeNew = createQualityGate(settings, mockWebApi);
        expect(typeNew.type).toEqual(TypeEnum.NEW);
    });

    it('Setting Quality Gate status', () => {
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

    it('Setting Quality Gate severity', () => {
        settings.severity = 'UnKnown';
        let severityUnKnow = createQualityGate(settings, mockWebApi);
        expect(severityUnKnow.severity).toEqual(SeverityEnum.ALL);
        expect(tl.warning).toHaveBeenCalledWith('Invalid value for \'severity\': UnKnown, using default value \'issue\'');

        settings.severity = 'issue';
        let severityIssue = createQualityGate(settings, mockWebApi);
        expect(severityIssue.severity).toEqual(SeverityEnum.ALL);
        settings.severity = 'error';
        let severityError = createQualityGate(settings, mockWebApi);
        expect(severityError.severity).toEqual(SeverityEnum.ERROR);
        settings.severity = 'warning';
        let severityWarning = createQualityGate(settings, mockWebApi);
        expect(severityWarning.severity).toEqual(SeverityEnum.WARNING);
        settings.severity = 'note';
        let severityNote = createQualityGate(settings, mockWebApi);
        expect(severityNote.severity).toEqual(SeverityEnum.NOTE);

        settings.severity = 'Issue';
        severityIssue = createQualityGate(settings, mockWebApi);
        expect(severityIssue.severity).toEqual(SeverityEnum.ALL);
        settings.severity = 'Error';
        severityError = createQualityGate(settings, mockWebApi);
        expect(severityError.severity).toEqual(SeverityEnum.ERROR);
        settings.severity = 'Warning';
        severityWarning = createQualityGate(settings, mockWebApi);
        expect(severityWarning.severity).toEqual(SeverityEnum.WARNING);
        settings.severity = 'Note';
        severityNote = createQualityGate(settings, mockWebApi);
        expect(severityNote.severity).toEqual(SeverityEnum.NOTE);
    });

    it('When reference build result is empty, Quality Gate should be skipped', async () => {
        settings.referenceBuildResult = undefined;
        let staticAnalysisQualityService = createQualityGate(settings, mockWebApi);
        await staticAnalysisQualityService.run();

        expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.SucceededWithIssues, 'Quality gate \'Type: Total, Severity: All, Threshold: 10\' skipped; please run \'Publish Parasoft Results\' task first');
    });

    it('When reference build result is not empty, Quality Gate should parse result', async () => {
        let staticAnalysisQualityService = createQualityGate(settings, mockWebApi);
        spyOn(staticAnalysisQualityService.buildClient, 'getSarifArtifactOfBuildById').and.returnValue(Promise.reject());

        await staticAnalysisQualityService.run();

        expect(staticAnalysisQualityService.referenceInputs.pipelineName).toEqual('TestPipelineName');
        expect(staticAnalysisQualityService.referenceInputs.buildNumber).toEqual('260');
        expect(staticAnalysisQualityService.referenceBuildInfo.buildNumber).toEqual('260');
        expect(staticAnalysisQualityService.referenceBuildInfo.buildId).toBe('260');
        expect(staticAnalysisQualityService.referenceBuildInfo.warningMsg).toEqual('any warning messages when getting Parasoft static analysis reports from reference build');
        expect(tl.debug).toHaveBeenCalledWith('any warning messages when getting Parasoft static analysis reports from reference build');
    });

    it('When No Build Artifact was found, should print warning message', async () => {
        let staticAnalysisQualityService = createQualityGate(settings, mockWebApi);
        // @ts-ignore
        spyOn(staticAnalysisQualityService.buildClient, 'getSarifArtifactOfBuildById').and.returnValue(Promise.resolve(undefined));

        await staticAnalysisQualityService.run();

        expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.SucceededWithIssues, 'Quality gate \'Type: Total, Severity: All, Threshold: 10\' skipped; no Parasoft static analysis results were found in this build');
    });

    it('When Quality Gate failed, should handle error', async () => {
        let staticAnalysisQualityService = createQualityGate(settings, mockWebApi);
        spyOn(staticAnalysisQualityService.buildClient, 'getSarifArtifactOfBuildById').and.throwError(new Error('Error'));

        await staticAnalysisQualityService.run();

        expect(tl.warning).toHaveBeenCalledWith('Failed to process the quality gate \'Type: Total, Severity: All, Threshold: 10\'. See logs for details.');
    });

    describe('When task process report and', () => {
        afterAll(() => {
            fs.rmSync(__dirname + '/ParasoftQualityGatesMD', {recursive: true});
        });

        let setUpQualityGate = () => {
            let staticAnalysisQualityService = createQualityGate(settings, mockWebApi);
            spyOn(staticAnalysisQualityService.buildClient, 'getSarifArtifactOfBuildById').and.returnValue(Promise.resolve({}));
            spyOn(staticAnalysisQualityService.buildClient, 'getSarifReportsOfArtifact').and.returnValue(Promise.resolve(fakeFileEntry));
            return staticAnalysisQualityService;
        }

        let markDownPath = __dirname + '/ParasoftQualityGatesMD/task-instance-id/Parasoft Static Analysis Quality Gate - Display name.md'

        it('pass the gate -- Total Issues, should set task success', async () => {
            settings.threshold = '10000000';
            let staticAnalysisQualityService = setUpQualityGate();

            await staticAnalysisQualityService.run();

            expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.Succeeded, 'Quality gate \'Type: Total, Severity: All, Threshold: 10000000\' passed');
            QualityGateTestUtils.compareMarkDown(markDownPath, __dirname + '/resources/expect/Parasoft Static Analysis Quality Gate - Total Issues - 10000000.md.md');
        });

        it('pass the gate -- Total Notes, should set task success', async () => {
            settings.threshold = '0';
            settings.severity = 'Note';
            let staticAnalysisQualityService = setUpQualityGate();

            await staticAnalysisQualityService.run();

            expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.Succeeded, 'Quality gate \'Type: Total, Severity: Note, Threshold: 0\' passed');
            QualityGateTestUtils.compareMarkDown(markDownPath, __dirname + '/resources/expect/Parasoft Static Analysis Quality Gate - Total Notes - 0.md');
        });

        it('pass the gate -- New Errors, should set task success', async () => {
            settings.threshold = '10000000';
            settings.type = 'New';
            settings.severity = 'Error';
            let staticAnalysisQualityService = setUpQualityGate();

            await staticAnalysisQualityService.run();

            expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.Succeeded, 'Quality gate \'Type: New, Severity: Error, Threshold: 10000000, Reference pipeline: TestPipelineName, Reference build: 260\' passed');
            QualityGateTestUtils.compareMarkDown(markDownPath, __dirname + '/resources/expect/Parasoft Static Analysis Quality Gate - New Errors - 10000000.md');
        });

        it('pass the gate -- New Errors and without warning message, should set task success', async () => {
            settings.threshold = '10000000';
            settings.type = 'New';
            settings.severity = 'Error';
            settings.referenceBuildResult = '{"referencePipelineInput":"TestPipelineName","referenceBuildInput":"260","staticAnalysis":{"pipelineName":"TestPipelineName","buildId":"260","buildNumber":"260"}}';
            let staticAnalysisQualityService = setUpQualityGate();

            await staticAnalysisQualityService.run();

            expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.Succeeded, 'Quality gate \'Type: New, Severity: Error, Threshold: 10000000, Reference pipeline: TestPipelineName, Reference build: 260\' passed');
            QualityGateTestUtils.compareMarkDown(markDownPath, __dirname + '/resources/expect/Parasoft Static Analysis Quality Gate - New Errors - 10000000 Without Warning message.md');
        });

        it('not pass the gate -- Total Warnings, should set task unstable', async () => {
            settings.threshold = '0';
            settings.severity = 'Warning';
            settings.buildStatus = 'Unstable';
            let staticAnalysisQualityService = setUpQualityGate();

            await staticAnalysisQualityService.run();

            expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.SucceededWithIssues, 'Quality gate \'Type: Total, Severity: Warning, Threshold: 0\' failed: build result is UNSTABLE');
            QualityGateTestUtils.compareMarkDown(markDownPath, __dirname + '/resources/expect/Parasoft Static Analysis Quality Gate - Total Warnings - 0.md');
        });

        it('not pass the gate -- Total Errors, should set task failed', async () => {
            settings.threshold = '0';
            settings.severity = 'Error';
            settings.buildStatus = 'Failed';
            let staticAnalysisQualityService = setUpQualityGate();

            await staticAnalysisQualityService.run();

            expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.Failed, 'Quality gate \'Type: Total, Severity: Error, Threshold: 0\' failed: build result is FAILED');
            QualityGateTestUtils.compareMarkDown(markDownPath, __dirname + '/resources/expect/Parasoft Static Analysis Quality Gate - Total Errors - 0.md');
        });
    });
});