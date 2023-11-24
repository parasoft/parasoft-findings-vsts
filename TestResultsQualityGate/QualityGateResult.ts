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

import { BuildResultInfo as BuildInfo, QualityGateStatusEnum, TypeEnum } from "./TestResultsQualityGateService";

export class QualityGateResult {
    private _displayName: string;
    private _type: TypeEnum;
    private _threshold: number;
    private _numberOfEvaluatedTests: number;
    private _referenceBuildInfo?: BuildInfo;

    private _status: QualityGateStatusEnum = QualityGateStatusEnum.FAILED;

    constructor(displayName: string,
                type: TypeEnum,
                threshold: number,
                numberOfEvaluatedTests: number,
                referenceTestResultsInfo?: BuildInfo
                ) {
        this._displayName = displayName;
        this._type = type;
        this._threshold = threshold;
        this._numberOfEvaluatedTests = numberOfEvaluatedTests;
        this._referenceBuildInfo = referenceTestResultsInfo;
    }

    public get status() : QualityGateStatusEnum {
        return this._status;
    }

    public set status(status : QualityGateStatusEnum) {
        this._status = status;
    }
}