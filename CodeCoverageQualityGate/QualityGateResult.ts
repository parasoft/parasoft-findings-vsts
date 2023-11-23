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
import { QualityGateStatusEnum, TypeEnum } from "./CodeCoverageQualityService";

export class QualityGateResult {
    private _displayName: string;
    private _referencePipelineName: string;
    private _referenceBuildNumber: string;
    private _referenceBuildId: string;
    private _type: TypeEnum;
    private _threshold: number;
    private _storageDir: string;

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
                storageDir: string) {
        this._displayName = displayName;
        this._referencePipelineName = referencePipelineName;
        this._referenceBuildNumber = referenceBuildNumber;
        this._referenceBuildId = referenceBuildId;
        this._type = type;
        this._threshold = threshold;
        this._storageDir = storageDir;

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

    public getStatusText() : string {
        switch (this._status) {
            case QualityGateStatusEnum.FAILED:
                return '<span style="color:red"><span style="font-size:13px;line-height:14px" class="icon bowtie-icon bowtie-edit-delete"></span>Failed</span>';
            case QualityGateStatusEnum.PASSED:
                return '<span style="color:green"><span style="font-size:13px;line-height:14px" class="icon bowtie-icon bowtie-check"></span>Passed</span>';
            case QualityGateStatusEnum.UNSTABLE:
                return '<span style="color:orange"><span style="font-size:13px;line-height:12px" class="icon build-issue-icon bowtie-icon bowtie-status-warning"></span>Unstable</span>';
        }
    }

    public getCodeCoverageText() : string {
        let coverageText = `${this._type}  code coverage: `;
        if (this._codeCoverage != 'N/A') {
            coverageText += `${this._codeCoverage} (${this._coveredLines}/${this._coverableLines})`;
        } else {
            if (this._type == TypeEnum.MODIFIED) {
                coverageText += `${this._codeCoverage} (no modified code)`;
            } else {
                coverageText += `${this._codeCoverage} (no code)`;
            }
        }
        return coverageText;
    }

    public getQualityGateTypeText(): string {
        switch (this._type) {
            case TypeEnum.OVERALL:
                return 'Overall project';
            case TypeEnum.MODIFIED:
                return 'Modified code lines'
        }
    }

    public uploadQualityGateSummary() : void {
      tl.mkdirP(this._storageDir);
      let markdownPath = tl.resolve(this._storageDir, `${this._displayName}.md`);
      let summaryMarkdownContent = this.getQualityGateResultSummaryContent();
      tl.writeFile(markdownPath, summaryMarkdownContent);
      console.log('##vso[task.uploadsummary]' + markdownPath);
    }

    private getQualityGateResultSummaryContent(): string {
        let text = `<div>${this.getCodeCoverageText()}</div>\n`;

        if (this._type == TypeEnum.MODIFIED) {
            let buildText = 'N/A';
            if (this._referencePipelineName && this._referenceBuildId) {
                buildText = `<a href="./?buildId=${this._referenceBuildId}">${this._referencePipelineName}#${this._referenceBuildNumber || this._referenceBuildId}</a>`;
            }
            text += `<div>Reference build: ${buildText}</div>\n`;
        }

        text += '<div>Quality gate: </div>\n' +
            `<div style="margin-left:20px;">Status: ${this.getStatusText()}</div>\n` +
            `<div style="margin-left:20px;">Type: ${this.getQualityGateTypeText()}</div>\n` +
            `<div style="margin-left:20px;">Threshold: ${this._threshold.toString()}%</div>`;
        return `<div style="font-size:13px">${text}</div>`;
    }
}