import * as fs from "fs";
import { QualityGateStatusEnum, SeverityEnum, TypeEnum } from "./StaticAnalysisQualityService";

export class QualityGateResult {
    private _displayName: string;
    private _referenceBuild: string;
    private _referenceBuildId: string;
    private _type: TypeEnum;
    private _severity: SeverityEnum;
    private _threshold: number;
    private _workingDir: string;

    private _status: QualityGateStatusEnum = QualityGateStatusEnum.FAILED;
    private _actualNumberOfIssues: number = 0;

    constructor(displayName: string,
                referenceBuild: string,
                referenceBuildId: number | undefined,
                type: TypeEnum,
                severity: SeverityEnum,
                threshold: number,
                workingDir: string) {
      this._displayName = displayName;
      this._referenceBuild = referenceBuild;
      this._referenceBuildId = referenceBuildId ? referenceBuildId.toString() : '';
      this._type = type;
      this._severity = severity;
      this._threshold = threshold;
      this._workingDir = workingDir;
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
              return  '<span style="color:red"><span style="font-size: 12px;line-height:14px" class="icon bowtie-icon bowtie-edit-delete"></span>Failed</span>';
          case QualityGateStatusEnum.PASSED:
              return '<span style="color:green"><span style="font-size: 12px;line-height:14px" class="icon bowtie-icon bowtie-check"></span>Passed</span>';
          case QualityGateStatusEnum.UNSTABLE:
              return '<span style="color:orange"><span style="font-size: 12px;line-height:13px" class="icon build-issue-icon bowtie-icon bowtie-status-warning"></span>Unstable</span>';
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

    public uploadQualityGateSummary() : void {
      const mdStoragePath = this._workingDir + '/ParasoftQualityGatesMD';
      if (fs.existsSync(mdStoragePath)) {
        // Remove all old markdown files
        fs.rmSync(mdStoragePath, { recursive: true, force: true });
      }
      fs.mkdirSync(mdStoragePath);
      let markdownPath = `${mdStoragePath}/${this._displayName}.md`;
      let summaryMarkdownContent = this.getQualityGateResultSummaryContent();
      fs.writeFileSync(markdownPath, summaryMarkdownContent);
      console.log('##vso[task.uploadsummary]' + markdownPath);
    }

    private getQualityGateResultSummaryContent(): string {
      let text = `<div>${this._type} ${this._severity}s: ${this.getActualNumberOfIssuesText()}</div>\n`;

      if (this._type == TypeEnum.NEW) {
          text += `<div>Reference build: <a href="./?buildId=${this._referenceBuildId}">#${this._referenceBuild}</a></div>\n`;
      }

      text += '<div>Quality gate: </div>\n' +
              `<div style="margin-left: 20px;">Status: ${this.getStatusText()}</div>\n` +
              `<div style="margin-left: 20px;">Type: ${this.getQualityGateTypeText()}</div>\n` +
              `<div style="margin-left: 20px;">Severity: ${this._severity}</div>\n` +
              `<div style="margin-left: 20px;">Threshold: ${this._threshold.toString()}</div>`;
      return text;
    }
 }