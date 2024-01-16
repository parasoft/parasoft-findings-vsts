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
import { BuildResultInfo as BuildInfo, TypeEnum } from "./TestResultsQualityService";

export enum QualityGateStatusEnum {
    PASSED = "PASSED",
    UNSTABLE = "UNSTABLE",
    FAILED = "FAILED"
}

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

    public uploadQualityGateSummary() : void {
        const customMarkdownSummaryDirectory = tl.resolve(tl.getVariable('System.DefaultWorkingDirectory'), 'ParasoftQualityGatesMD');
        const taskInstanceStorageDir = tl.resolve(customMarkdownSummaryDirectory, tl.getVariable('System.TaskInstanceId'));
        tl.mkdirP(taskInstanceStorageDir);
        const markdownPath = tl.resolve(taskInstanceStorageDir, `${this._displayName}.md`);
        const summaryMarkdownContent = this.getQualityGateResultSummaryContent();
        tl.writeFile(markdownPath, summaryMarkdownContent);
        console.log('##vso[task.uploadsummary]' + markdownPath);
    }

    private getQualityGateResultSummaryContent() : string {
        let text = `<div>${this.getQualityGateTypeText()}: ${this._numberOfEvaluatedTests}</div>\n`;
  
        if (this._type == TypeEnum.NEWLY_FAILED_TESTS) {
            let buildText = 'N/A';
            if (this._referenceBuildInfo?.warningMsg) {
                buildText = `<span style="font-size:13px;line-height:13px;color:orange" class="icon build-issue-icon bowtie-icon bowtie-status-warning"></span> ${this._referenceBuildInfo?.warningMsg}`;
            } else if (this._referenceBuildInfo?.pipelineName && this._referenceBuildInfo?.buildId) {
                buildText = `<a href="./?buildId=${this._referenceBuildInfo?.buildId}">${this._referenceBuildInfo?.pipelineName}#${this._referenceBuildInfo?.buildNumber || this._referenceBuildInfo?.buildId}</a>`;
            }
            text += `<div>Reference build: ${buildText}</div>\n`;
        }
  
        text += '<div>Quality gate: </div>\n' +
                `<div style="margin-left:20px;">Status: ${this.getStatusText()}</div>\n` +
                `<div style="margin-left:20px;">Type: ${this.getQualityGateTypeText()}</div>\n` +
                `<div style="margin-left:20px;">Threshold: ${this._threshold.toString()}</div>`;
        return `<div style="font-size:13px">${text}</div>`;
    }
  
    private getQualityGateTypeText = () : string => {
        switch (this._type) {
            case TypeEnum.TOTAL_PASSED_TESTS:
                return 'Total passed tests';
            case TypeEnum.TOTAL_FAILED_TESTS:
                return 'Total failed tests';
            case TypeEnum.TOTAL_EXECUTED_TESTS:
                return 'Total executed tests';
            case TypeEnum.NEWLY_FAILED_TESTS:
                return 'Newly failed tests';
        }
    }
  
    private getStatusText() : string {
        switch (this._status) {
            case QualityGateStatusEnum.FAILED:
                return '<span style="color:red"><span style="font-size:13px;line-height:14px" class="icon bowtie-icon bowtie-edit-delete"></span>Failed</span>';
            case QualityGateStatusEnum.PASSED:
                return '<span style="color:green"><span style="font-size:13px;line-height:14px" class="icon bowtie-icon bowtie-check"></span>Passed</span>';
            case QualityGateStatusEnum.UNSTABLE:
                return '<span style="color:orange"><span style="font-size:13px;line-height:12px" class="icon build-issue-icon bowtie-icon bowtie-status-warning"></span>Unstable</span>';
        }
    }
}