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
     NEW = "new",
     TOTAl = "total",
 }

 export const enum SeverityEnum {
     ERROR = "error",
     WARNING = "warning",
     NOTE = "note"
 }

 export const enum BuildStatusEnum {
     FAILED = "failed",
     UNSTABLE = "unstable"
 }

 export class StaticAnalysisQualityService {
    typeString: string | undefined;
    severityString: string | undefined;
    buildStatusString: string | undefined;
    referenceBuildString: string | undefined;
    thresholdString: string | undefined;

    type: TypeEnum;
    severity: SeverityEnum;
    buildStatus: BuildStatusEnum;
    referenceBuild: string | undefined;
    threshold: number;
    constructor() {
        this.typeString = tl.getInput('type');
        this.severityString = tl.getInput('severity');
        this.buildStatusString = tl.getInput('buildStatus');
        this.referenceBuildString = tl.getInput('referenceBuild');
        this.thresholdString = tl.getInput('threshold');

        this.referenceBuild = this.referenceBuildString;
        this.threshold = parseFloat(this.thresholdString || '0.0');

        if (isNaN(this.threshold)) {
            tl.warning('Illegal threshold value \'' + this.thresholdString + '\', using default value 0.0');
            this.threshold = 0.0;
        }

        switch (this.typeString) {
            case TypeEnum.NEW :
                this.type = TypeEnum.NEW;
                break;
            case TypeEnum.TOTAl :
                this.type = TypeEnum.TOTAl;
                break;
            default :
                this.type = TypeEnum.TOTAl;
        }

        switch (this.buildStatusString) {
            case BuildStatusEnum.FAILED :
                this.buildStatus = BuildStatusEnum.FAILED;
                break;
            case BuildStatusEnum.UNSTABLE :
                this.buildStatus = BuildStatusEnum.UNSTABLE;
                break;
            default :
                this.buildStatus = BuildStatusEnum.FAILED;
        }

        switch (this.severityString) {
            case SeverityEnum.ERROR :
                this.severity = SeverityEnum.ERROR;
                break;
            case SeverityEnum.WARNING :
                this.severity = SeverityEnum.WARNING;
                break;
            case SeverityEnum.NOTE :
                this.severity = SeverityEnum.NOTE;
                break;
            default :
                this.severity = SeverityEnum.ERROR;
        }

        tl.debug("Input type: " + this.typeString);
        tl.debug("Static analysis quality type: " + this.type);

        tl.debug("Input severity: " + this.severityString);
        tl.debug("Static analysis quality severity: " + this.severity);

        tl.debug("Input buildStatus: " + this.buildStatusString);
        tl.debug("Static analysis quality buildStatus: " + this.buildStatus);

        tl.debug("Input referenceBuild: " + this.referenceBuildString);
        tl.debug("Static analysis quality referenceBuild: " + this.referenceBuild);

        tl.debug("Input threshold: " + this.thresholdString);
        tl.debug("Static analysis quality threshold: " + this.threshold);
    }
    run = (): void => {
        tl.debug("TODO");
    }
 }