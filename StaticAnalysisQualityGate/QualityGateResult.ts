import * as fs from "fs";
import { QualityGateStatusEnum, SeverityEnum, TypeEnum } from "./StaticAnalysisQualityService";

export class QualityGateResult {
    private _displayName: string;
    private _referenceBuild: string;
    private _referenceBuildId: string;
    private _type: TypeEnum;
    private _severity: SeverityEnum;
    private _threshold: number;

    private _status: QualityGateStatusEnum = QualityGateStatusEnum.FAILED;
    private _actualNumberOfIssues: number = 0;

    constructor(displayName: string,
                referenceBuild: string,
                referenceBuildId: number | undefined,
                type: TypeEnum,
                severity: SeverityEnum,
                threshold: number) {
      this._displayName = displayName;
      this._referenceBuild = referenceBuild;
      this._referenceBuildId = referenceBuildId? referenceBuildId.toString() : '';
      this._type = type;
      this._severity = severity;
      this._threshold = threshold;
    }

    public get displayName() : string {
      return this._displayName;
    }
    public set displayName(displayName : string) {
      this._displayName = displayName;
    }

    public get referenceBuild() : string {
      return this._referenceBuild;
    }
    public set referenceBuild(referenceBuild : string) {
      this._referenceBuild = referenceBuild;
    }

    public get referenceBuildId() : string {
        return this._referenceBuildId;
    }
    public set referenceBuildId(referenceBuildId : string) {
        this._referenceBuild = referenceBuildId;
    }

    public get type() : TypeEnum {
      return this._type;
    }
    public set type(type : TypeEnum) {
      this._type = type;
    }

    public get severity() : SeverityEnum {
      return this._severity;
    }
    public set severity(severity : SeverityEnum) {
      this._severity = severity;
    }

    public get threshold() : number {
      return this._threshold;
    }
    public set threshold(threshold : number) {
      this._threshold = threshold;
    }

    public get status() : QualityGateStatusEnum {
      return this._status;
    }
    public set status(status : QualityGateStatusEnum) {
      this._status = status;
    }
    public getStatusText() : string {
        switch (this.status) {
            case QualityGateStatusEnum.FAILED:
                return  '<span style="color:red" class="icon build-failure-icon-color bowtie-icon bowtie-edit-delete"></span>Failed';
            case QualityGateStatusEnum.PASSED:
                return '<span style="color:green" class="icon build-success-icon-color bowtie-icon bowtie-check"></span>Passed';
            case QualityGateStatusEnum.UNSTABLE:
                return '<span style="color:orange" class="icon build-issue-icon build-warning-icon-color bowtie-icon bowtie-status-warning"></span>Unstable';
        }
    }

    public get actualNumberOfIssues() : number {
      return this._actualNumberOfIssues;
    }
    public set actualNumberOfIssues(actualNumberOfIssues : number) {
      this._actualNumberOfIssues = actualNumberOfIssues;
    }
    public getActualNumberOfIssuesText() : string {
        if (this.actualNumberOfIssues > 1) {
            return `${this.actualNumberOfIssues} violations`;
        } else {
            return `${this.actualNumberOfIssues} violation`;
        }
    }

    public uploadQualityGateSummary(displayName : string, workingDir: string) : void {
        let markdownPath = `${workingDir}/${displayName}.md`;
        let summaryMarkdownContent = this.getQualityGateResultSummaryContent();
        fs.writeFileSync(markdownPath, summaryMarkdownContent);
        console.log('##vso[task.uploadsummary]' + markdownPath);
    }

    private getQualityGateResultSummaryContent(): string {
        let text = `<div>${this.type} ${this.severity}s: ${this.getActualNumberOfIssuesText()}</div>\n`;

        if (this.type == TypeEnum.NEW) {
            text += `<div>Reference build: <a href="./?buildId=${this.referenceBuildId}">${this.referenceBuild}</a></div>\n`;
        }

        text += '<div>Quality gate: </div>\n' +
                `<div style="margin-left: 20px;">Status: ${this.getStatusText()}</div>\n` +
                `<div style="margin-left: 20px;">Type: ${this.type}</div>\n` +
                `<div style="margin-left: 20px;">Severity: ${this.severity}</div>\n` +
                `<div style="margin-left: 20px;">Threshold: ${this.threshold.toString()}</div>`;
        return text;
    }
 }