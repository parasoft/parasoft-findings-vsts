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
    TOTAL_PASSED_TESTS = 'totalPassed',
    TOTAL_FAILED_TESTS = 'totalFailed',
    TOTAL_EXECUTED_TESTS = 'totalExecuted',
    NEWLY_FAILED_TESTS = 'newlyFailed'
}

export const enum BuildStatusEnum {
    FAILED = 'failed',
    UNSTABLE = 'unstable'
}

export class TestResultsQualityGateService {
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

        this.threshold = parseInt(this.thresholdString || '0');

        if (isNaN(this.threshold)) {
            tl.warning(`Invalid threshold value '${this.thresholdString}', using default value 0`);
            this.threshold = 0;
        } else if (this.threshold < 0) {
            tl.warning(`The threshold value '${this.thresholdString}' is less than 0, the value is set to 0`);
            this.threshold = 0;
        }

        switch (this.typeString.toLowerCase()) {
            case TypeEnum.TOTAL_EXECUTED_TESTS.toLowerCase():
                this.type = TypeEnum.TOTAL_EXECUTED_TESTS;
                break;
            case TypeEnum.TOTAL_PASSED_TESTS.toLowerCase():
                this.type = TypeEnum.TOTAL_PASSED_TESTS;
                break;
            case TypeEnum.TOTAL_FAILED_TESTS.toLowerCase():
                this.type = TypeEnum.TOTAL_FAILED_TESTS;
                break;
            case TypeEnum.NEWLY_FAILED_TESTS.toLowerCase():
                this.type = TypeEnum.NEWLY_FAILED_TESTS;
                break;
            default:
                tl.warning(`Invalid value for 'type': ${this.typeString}, using default value 'totalPassed'`);
                this.type = TypeEnum.TOTAL_PASSED_TESTS;
        }

        switch (this.buildStatusString.toLowerCase()) {
            case BuildStatusEnum.FAILED.toLowerCase():
                this.buildStatus = BuildStatusEnum.FAILED;
                break;
            case BuildStatusEnum.UNSTABLE.toLowerCase():
                this.buildStatus = BuildStatusEnum.UNSTABLE;
                break;
            default:
                tl.warning(`Invalid value for 'buildStatus': ${this.buildStatusString}, using default value 'failed'`);
                this.buildStatus = BuildStatusEnum.FAILED;
        }

        tl.debug("Input type: " + this.typeString);
        tl.debug("Test results quality type: " + this.type);

        tl.debug("Input threshold: " + this.thresholdString);
        tl.debug("Test results quality threshold: " + this.threshold);

        tl.debug("Input buildStatus: " + this.buildStatusString);
        tl.debug("Test results quality buildStatus: " + this.buildStatus);
    }
    run = (): void => {
        tl.debug("TODO");
    }
}