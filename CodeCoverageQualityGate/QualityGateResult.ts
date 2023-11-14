/*
 * Copyright 2023 Parasoft Corporation
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
import { QualityGateStatusEnum, TypeEnum } from "./CodeCoverageQualityService";

export class QualityGateResult {
    private _displayName: string;
    private _referencePipelineName: string;
    private _referenceBuildNumber: string;
    private _referenceBuildId: string;
    private _type: TypeEnum;
    private _threshold: number;
    private _workingDir: string;

    private _status: QualityGateStatusEnum = QualityGateStatusEnum.FAILED;
    private _coverableLines: number;
    private _coveredLines: number;
    private _codeCoverage: string = 'N/A';

    constructor(displayName: string,
                coverableLines: number,
                coveredLines: number,
                referencePipelineName: string,
                referenceBuildNumber: string,
                referenceBuildId: string,
                type: TypeEnum,
                threshold: number,
                workingDir: string) {
        this._displayName = displayName;
        this._referencePipelineName = referencePipelineName;
        this._referenceBuildNumber = referenceBuildNumber;
        this._referenceBuildId = referenceBuildId;
        this._type = type;
        this._threshold = threshold;
        this._workingDir = workingDir;

        this._coverableLines = coverableLines;
        this._coveredLines = coveredLines;
        if (coverableLines != 0) {
            this._codeCoverage = ((coveredLines/coverableLines) * 100).toFixed(2) + '%';
        }
    }

    public get status(): QualityGateStatusEnum {
        return this._status;
    }

    public set status(status: QualityGateStatusEnum) {
        this._status = status;
    }

    public get codeCoverage() {
        return this._codeCoverage;
    }

    public set codeCoverage(codeCoverage: string) {
        this._codeCoverage = codeCoverage;
    }
}