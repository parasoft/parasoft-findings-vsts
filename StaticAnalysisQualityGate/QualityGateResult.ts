import { QualityGateStatusEnum, SeverityEnum, TypeEnum } from "./StaticAnalysisQualityService";

export class QualityGateResult {
    private _displayName: string;
    private _referenceBuild: string;
    private _type: TypeEnum;
    private _severity: SeverityEnum;
    private _threshold: number;

    private _status: QualityGateStatusEnum = QualityGateStatusEnum.FAILED;
    private _actualNumberOfIssues: number = 0;

    constructor(displayName: string,
                referenceBuild: string,
                type: TypeEnum,
                severity: SeverityEnum,
                threshold: number) {
      this._displayName = displayName;
      this._referenceBuild = referenceBuild;
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

    public get actualNumberOfIssues() : number {
      return this._actualNumberOfIssues;
    }
    public set actualNumberOfIssues(actualNumberOfIssues : number) {
      this._actualNumberOfIssues = actualNumberOfIssues;
    }
 }