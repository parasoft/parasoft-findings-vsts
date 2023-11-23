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
import { QualityGateStatusEnum, SeverityEnum, TypeEnum } from "./StaticAnalysisQualityService";

export class QualityGateResult {
    private _displayName: string;
    private _referencePipelineName: string;
    private _referenceBuildNumber: string;
    private _referenceBuildId: string;
    private _referenceBuildWarning: string;
    private _type: TypeEnum;
    private _severity: SeverityEnum;
    private _threshold: number;
    private _storageDir: string;

    private _status: QualityGateStatusEnum = QualityGateStatusEnum.FAILED;
    private _actualNumberOfIssues: number = 0;

    constructor(displayName: string,
                referencePipelineName: string,
                referenceBuildNumber: string,
                referenceBuildId: string,
                referenceBuildWarning: string,
                type: TypeEnum,
                severity: SeverityEnum,
                threshold: number,
                storageDir: string) {
      this._displayName = displayName;
      this._referencePipelineName = referencePipelineName;
      this._referenceBuildNumber = referenceBuildNumber;
      this._referenceBuildId = referenceBuildId;
      this._referenceBuildWarning = referenceBuildWarning;
      this._type = type;
      this._severity = severity;
      this._threshold = threshold;
      this._storageDir = storageDir;
    }

    public get status() : QualityGateStatusEnum {
      return this._status;
    }
    public set status(status : QualityGateStatusEnum) {
      this._status = status;
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

    public get actualNumberOfIssues() : number {
      return this._actualNumberOfIssues;
    }
    public set actualNumberOfIssues(actualNumberOfIssues : number) {
      this._actualNumberOfIssues = actualNumberOfIssues;
    }

    public getActualNumberOfIssuesText() : string {
      if (this._actualNumberOfIssues > 1) {
          return `${this._actualNumberOfIssues} violations`;
      } else {
          return `${this._actualNumberOfIssues} violation`;
      }
    }

    public getQualityGateTypeText(): string {
        switch (this._type) {
            case TypeEnum.NEW:
                return 'New issues';
            case TypeEnum.TOTAl:
                return 'Total issues'
        }
    }

    public getSeverityText(): string {
        switch (this._severity) {
            case SeverityEnum.ALL:
                return 'All';
            default:
                return `${this._severity}`;
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
      let text = `<div>${this._type} ${this._severity}s: ${this.getActualNumberOfIssuesText()}</div>\n`;

      if (this._type == TypeEnum.NEW) {
          let buildText = 'N/A';
          if (this._referenceBuildWarning == '' && this._referencePipelineName && this._referenceBuildId) {
              buildText = `<a href="./?buildId=${this._referenceBuildId}">${this._referencePipelineName}#${this._referenceBuildNumber || this._referenceBuildId}</a>`;
          } else if (this._referenceBuildWarning != '') {
              buildText = `<span style="font-size:13px;line-height:13px;color:orange" class="icon build-issue-icon bowtie-icon bowtie-status-warning"></span> ${this._referenceBuildWarning}`;
          }
          text += `<div>Reference build: ${buildText}</div>\n`;
      }

      text += '<div>Quality gate: </div>\n' +
              `<div style="margin-left:20px;">Status: ${this.getStatusText()}</div>\n` +
              `<div style="margin-left:20px;">Type: ${this.getQualityGateTypeText()}</div>\n` +
              `<div style="margin-left:20px;">Severity: ${this.getSeverityText()}</div>\n` +
              `<div style="margin-left:20px;">Threshold: ${this._threshold.toString()}</div>`;
      return `<div style="font-size:13px">${text}</div>`;
    }
 }