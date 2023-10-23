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
            referenceBuildResult: '{"originalBuildNumber":"260","staticAnalysis":{"buildId":"260","buildNumber":"260","warningMessage":"test"}}'
        };

        mockWebApi = jasmine.createSpy('WebApi').and.returnValue({
            getBuildApi: jasmine.createSpy('getBuildApi').and.returnValue({
                getBuilds: jasmine.createSpy('getBuilds'),
                getArtifact: jasmine.createSpy('getArtifact'),
            }),
        });

        fakeFileEntry = [{
            name: 'report-pf-sast.sarif',
            artifactName: 'CodeAnalysisLogs',
            filePath: 'report-pf-sast.sarif',
            buildId: 260,
            contentsPromise: Promise.resolve(fs.readFileSync(__dirname + '/resources/report-pf-sast.sarif', {encoding: "utf-8"}))
        }];
    });

    it('When thresholds is empty, should set threshold to 0', () => {
        settings.threshold = 'NaN';

        let staticAnalysisQualityService = createQualityGate(settings, mockWebApi);

        expect(tl.warning).toHaveBeenCalledWith('Illegal threshold value \'NaN\', using default value 0');
    });

    it('Setting Quality Gate type', () => {
        settings.type = 'Total';
        let typeTotal = createQualityGate(settings, mockWebApi);
        settings.type = 'New';
        let typeNew = createQualityGate(settings, mockWebApi);
        settings.type = 'unknown';
        let typeUnknown = createQualityGate(settings, mockWebApi);

        expect(typeTotal.type).toEqual(TypeEnum.TOTAl);
        expect(typeNew.type).toEqual(TypeEnum.NEW);
        expect(typeUnknown.type).toEqual(TypeEnum.TOTAl);
    });

    it('Setting Quality Gate status', () => {
        settings.buildStatus = 'Unstable';
        let unstable = createQualityGate(settings, mockWebApi);
        settings.buildStatus = 'Failed';
        let failed = createQualityGate(settings, mockWebApi);
        settings.buildStatus = 'unknown';
        let unknown = createQualityGate(settings, mockWebApi);

        expect(unstable.buildStatus).toEqual(BuildStatusEnum.UNSTABLE);
        expect(failed.buildStatus).toEqual(BuildStatusEnum.FAILED);
        expect(unknown.buildStatus).toEqual(BuildStatusEnum.FAILED);
    });

    it('Setting Quality Gate severity', () => {
        settings.severity = 'Issue';
        let severityIssue = createQualityGate(settings, mockWebApi);
        settings.severity = 'Error';
        let severityError = createQualityGate(settings, mockWebApi);
        settings.severity = 'Warning';
        let severityWarning = createQualityGate(settings, mockWebApi);
        settings.severity = 'Note';
        let severityNote = createQualityGate(settings, mockWebApi);
        settings.severity = 'UnKnow';
        let severityUnKnow = createQualityGate(settings, mockWebApi);

        expect(severityIssue.severity).toEqual(SeverityEnum.ALL);
        expect(severityError.severity).toEqual(SeverityEnum.ERROR);
        expect(severityWarning.severity).toEqual(SeverityEnum.WARNING);
        expect(severityNote.severity).toEqual(SeverityEnum.NOTE);
        expect(severityUnKnow.severity).toEqual(SeverityEnum.ALL);
    });

    it('When reference build result is empty, Quality Gate should be skipped', async () => {
        settings.referenceBuildResult = undefined;
        let staticAnalysisQualityService = createQualityGate(settings, mockWebApi);
        await staticAnalysisQualityService.run();

        expect(tl.warning).toHaveBeenCalledWith('Quality gate \'Type: Total, Severity: All, Threshold: 10\' was skipped: please run \'Publish Parasoft Results\' task first');
    });

    it('When reference build result is not empty, Quality Gate should parse result', async () => {
        let staticAnalysisQualityService = createQualityGate(settings, mockWebApi);
        spyOn(staticAnalysisQualityService.buildClient, 'getBuildArtifact').and.returnValue(Promise.reject());

        await staticAnalysisQualityService.run();

        expect(staticAnalysisQualityService.originalReferenceBuildNumber).toEqual('260');
        expect(staticAnalysisQualityService.referenceBuildNumber).toEqual('260');
        expect(staticAnalysisQualityService.referenceBuildId).toBe('260');
        expect(staticAnalysisQualityService.referenceBuildWarningMessage).toEqual('test');
        expect(tl.debug).toHaveBeenCalledWith('test');
    });

    it('When No Build Artifact was found, should print warning message', async () => {
        let staticAnalysisQualityService = createQualityGate(settings, mockWebApi);
        // @ts-ignore
        spyOn(staticAnalysisQualityService.buildClient, 'getBuildArtifact').and.returnValue(Promise.resolve(undefined));

        await staticAnalysisQualityService.run();

        expect(tl.warning).toHaveBeenCalledWith('Quality gate \'Type: Total, Severity: All, Threshold: 10, Reference Build: 260\' was skipped; no artifacts were found in this build');
    });

    it('When Quality Gate failed, should handle error', async () => {
        let staticAnalysisQualityService = createQualityGate(settings, mockWebApi);
        spyOn(staticAnalysisQualityService.buildClient, 'getBuildArtifact').and.throwError(new Error('Error'));

        await staticAnalysisQualityService.run();

        expect(tl.warning).toHaveBeenCalledWith('Failed to process the quality gate \'Type: Total, Severity: All, Threshold: 10, Reference Build: 260\'. See logs for details.');
    });

    describe('When task process report and', () => {
        let setUpQualityGate = () => {
            let staticAnalysisQualityService = createQualityGate(settings, mockWebApi);
            spyOn(staticAnalysisQualityService.buildClient, 'getBuildArtifact').and.returnValue(Promise.resolve({}));
            spyOn(staticAnalysisQualityService.buildClient, 'getBuildReportsWithId').and.returnValue(Promise.resolve(fakeFileEntry));
            return staticAnalysisQualityService;
        }

        let compareMarkDown = (expectedReportPath: string) => {
            let markDownDir = __dirname + '/ParasoftQualityGatesMD';
            let markDown = fs.readFileSync(markDownDir + '/Parasoft Static Analysis Quality Gate - Display name.md', {encoding: 'utf-8'});
            let expectedMarkDown = fs.readFileSync(expectedReportPath, {encoding: 'utf-8'});

            expect(markDown).toEqual(expectedMarkDown);
            fs.rmSync(markDownDir, {recursive: true});
        }

        it('pass the gate -- Total issues, should set task success', async () => {
            settings.threshold = '10000000';
            let staticAnalysisQualityService = setUpQualityGate();

            await staticAnalysisQualityService.run();

            expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.Succeeded, 'Quality gate \'Type: Total, Severity: All, Threshold: 10000000, Reference Build: 260\' has been passed');
            compareMarkDown(__dirname + '/resources/expect/Parasoft Static Analysis Quality Gate - Total Issues - 10000000.md.md');
        });

        it('pass the gate -- New Error, should set task success', async () => {
            settings.threshold = '10000000';
            settings.type = 'New';
            settings.severity = 'Error';
            let staticAnalysisQualityService = setUpQualityGate();

            await staticAnalysisQualityService.run();

            expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.Succeeded, 'Quality gate \'Type: New, Severity: Error, Threshold: 10000000, Reference Build: 260\' has been passed');
            compareMarkDown(__dirname + '/resources/expect/Parasoft Static Analysis Quality Gate - New Error - 10000000.md');
        });

        it('pass the gate -- New Error and without warning message, should set task success', async () => {
            settings.threshold = '10000000';
            settings.type = 'New';
            settings.severity = 'Error';
            settings.referenceBuildResult = '{"originalBuildNumber":"260","staticAnalysis":{"buildId":"260","buildNumber":"260"}}';
            let staticAnalysisQualityService = setUpQualityGate();

            await staticAnalysisQualityService.run();

            expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.Succeeded, 'Quality gate \'Type: New, Severity: Error, Threshold: 10000000, Reference Build: 260\' has been passed');
            compareMarkDown(__dirname + '/resources/expect/Parasoft Static Analysis Quality Gate - New Error - 10000000 Without Warning message.md');
        });

        it('not pass the gate -- Total Warning, should set task unstable', async () => {
            settings.threshold = '0';
            settings.severity = 'Warning';
            settings.buildStatus = 'Unstable';
            let staticAnalysisQualityService = setUpQualityGate();

            await staticAnalysisQualityService.run();

            expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.SucceededWithIssues, 'Quality gate \'Type: Total, Severity: Warning, Threshold: 0, Reference Build: 260\' has been missed: result is UNSTABLE');
            compareMarkDown(__dirname + '/resources/expect/Parasoft Static Analysis Quality Gate - Total Warning - 0.md');
        });

        it('not pass the gate -- Total Note, should set task failed', async () => {
            // Should clean storage before generating markdown
            let mdDirPath = __dirname + '/ParasoftQualityGatesMD';
            fs.mkdirSync(mdDirPath);
            fs.writeFileSync(mdDirPath + '/temp.md', 'test');

            settings.threshold = '0';
            settings.severity = 'Note';
            settings.buildStatus = 'Failed';
            let staticAnalysisQualityService = setUpQualityGate();

            await staticAnalysisQualityService.run();

            expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.Failed, 'Quality gate \'Type: Total, Severity: Note, Threshold: 0, Reference Build: 260\' has been missed: result is FAILED');
            compareMarkDown(__dirname + '/resources/expect/Parasoft Static Analysis Quality Gate - Total Note - 0.md');
        });
    });
});