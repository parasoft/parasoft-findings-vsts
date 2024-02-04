import * as os from 'os';
import * as tl from 'azure-pipelines-task-lib';

export class ParaReportPublishUtils {

    // code from azure-pipelines-tasks/Tasks/PublishCodeCoverageResultsV1
    static getTempFolder = (): string => {
        try {
            tl.assertAgent('2.115.0');
            const tmpDir = tl.getVariable('Agent.TempDirectory');
            return <string>tmpDir;
        } catch (err) {
            tl.warning('Please upgrade your agent version. https://github.com/Microsoft/vsts-agent/releases')
            return os.tmpdir();
        }
    }
}