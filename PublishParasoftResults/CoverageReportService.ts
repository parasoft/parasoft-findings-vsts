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
import {BuildAPIClient, FileEntry} from "./BuildApiClient";

export class CoverageReportService {
    buildClient: BuildAPIClient;

    constructor() {
        this.buildClient = new BuildAPIClient();
    }

    async getMergedCoberturaReportByBuildId(buildId: number): Promise<FileEntry | undefined> {
        const coberturaReports = await this.buildClient.getCoberturaReportsByBuildId(buildId);
        return coberturaReports.find(coberturaReport => {
            return coberturaReport.name === "CoberturaContainer/parasoft-merged-cobertura.xml";
        });
    }
 }