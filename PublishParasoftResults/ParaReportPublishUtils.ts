/*
 * Copyright 2024 Parasoft Corporation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import * as os from 'os';
import * as tl from 'azure-pipelines-task-lib';
import * as path from 'path';

export class ParaReportPublishUtils {
    static readonly XUNIT_SUFFIX: string = "-junit.xml";
    static readonly SARIF_SUFFIX: string = "-pf-sast.sarif";
    static readonly COBERTURA_SUFFIX: string = "-cobertura.xml";
    static readonly XML_EXTENSION: string = ".xml";
    static readonly SARIF_EXTENSION: string = ".sarif";

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

    static generateReportNameWithPFSuffix  = (sourcePath: string, reportSuffix: string) : string => {
        let extension = path.extname(sourcePath); // extension with dot
        const fileName = path.basename(sourcePath);
        const fileNameWithoutExt = path.basename(sourcePath, extension);
        extension = extension.substring(1); // extension without dot
        return sourcePath.replace(fileName, fileNameWithoutExt) + (extension ? ('-' + extension) : '') + reportSuffix;
    }
}