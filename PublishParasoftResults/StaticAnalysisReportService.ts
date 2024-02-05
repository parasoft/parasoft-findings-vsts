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
     * Generate unique file name according to the source path.
     *
     * @param sourcePath The source path for the file
     * @returns A unique file name generated according to the source path
     *
     * For example:
     * sourcePath: D:\build\reports\cpptest-std\static_1\report.xml
     * returns: D__build_reports_cpptest-std_static_0x5f_1_report.xml
     */
    generateUniqueFileName = (sourcePath: string): string => {
        if (!sourcePath) {
            return "";
        }
        const fileName = path.basename(sourcePath);
        const nFileName = sourcePath.replace(/^[/\\]+/, '') // Remove any leading slashes
                                    .replace(/_/g, '_0x5f_') // Replace "_" with prefixed hexadecimal "_0x5f_"
                                    .replace(/[:/\\]/g, '_'); // Replace ":" and any slashes with "_"
        return sourcePath.replace(fileName, nFileName);
    }
}