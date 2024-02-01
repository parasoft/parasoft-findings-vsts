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
import * as path from "path";

export class StaticAnalysisReportService {

    /**
     * Make the file name unique by replacing certain characters in given source path.
     *
     * @param sourcePath The original source path with file name.
     * @returns The source path with unique file name.
     *
     * For example:
     * If the source path is: D:\build\reports\cpptest-std\static\report.xml
     * The result would be: D:\build\reports\cpptest-std\static\D_build.reports.cpptest-std.static.report.xml
     */
    makeFileNameUnique = (sourcePath: string): string => {
        if(!sourcePath) {
            return sourcePath;
        }
        // Remove the '/' from the beginning of Linux absolute path
        if(sourcePath.startsWith('/')) {
            sourcePath = sourcePath.replace('/', '');
        }

        const fileName = path.basename(sourcePath);
        const nFileName = sourcePath.replace(':\\', '_')
                                    .replaceAll('/', '.')
                                    .replaceAll('\\', '.');
        return sourcePath.replace(fileName, nFileName);
    }
}