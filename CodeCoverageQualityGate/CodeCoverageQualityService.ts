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
import * as tl from 'azure-pipelines-task-lib/task';

export const enum TypeEnum {
    OVERALL = "Overall",
    MODIFIED = "Modified",
}

export const enum BuildStatusEnum {
    FAILED = "Failed",
    UNSTABLE = "Unstable"
}

export class CodeCoverageQualityService {
    readonly typeString: string;
    readonly thresholdString: string;
    readonly buildStatusString: string;

    type: TypeEnum;
    threshold: number;
    buildStatus: BuildStatusEnum;

    constructor() {
        this.typeString = tl.getInput('type') || '';
        this.thresholdString = tl.getInput('threshold') || '';
        this.buildStatusString = tl.getInput('buildStatus') || '';

        this.threshold = parseFloat(this.thresholdString || '0.0');

        if (isNaN(this.threshold)) {
            tl.warning(`Invalid threshold value '${this.thresholdString}', using default value 0.0`);
            this.threshold = 0.0;
        } else if (this.threshold > 100) {
            tl.warning(`The threshold value '${this.thresholdString}' is more than 100, the value is set to 100.0`);
            this.threshold = 100.0;
        } else if (this.threshold < 0) {
            tl.warning(`The threshold value '${this.thresholdString}' is less than 0, the value is set to 0.0`);
            this.threshold = 0.0;
        }

        switch (this.typeString.toLowerCase()) {
            case TypeEnum.OVERALL.toLowerCase():
                this.type = TypeEnum.OVERALL;
                break;
            case TypeEnum.MODIFIED.toLowerCase():
                this.type = TypeEnum.MODIFIED;
                break;
            default:
                tl.warning(`Invalid value for 'type': ${this.typeString}, using default value 'Overall'`);
                this.type = TypeEnum.OVERALL;
        }

        switch (this.buildStatusString.toLowerCase()) {
            case BuildStatusEnum.FAILED.toLowerCase():
                this.buildStatus = BuildStatusEnum.FAILED;
                break;
            case BuildStatusEnum.UNSTABLE.toLowerCase():
                this.buildStatus = BuildStatusEnum.UNSTABLE;
                break;
            default:
                tl.warning(`Invalid value for 'buildStatus': ${this.buildStatusString}, using default value 'Failed'`);
                this.buildStatus = BuildStatusEnum.FAILED;
        }

        tl.debug("Input type: " + this.typeString);
        tl.debug("Code coverage quality type: " + this.type);

        tl.debug("Input threshold: " + this.thresholdString);
        tl.debug("Code coverage quality threshold: " + this.threshold);

        tl.debug("Input buildStatus: " + this.buildStatusString);
        tl.debug("Code coverage quality buildStatus: " + this.buildStatus);
    }
    run = (): void => {
        tl.debug("TODO");
    }
}