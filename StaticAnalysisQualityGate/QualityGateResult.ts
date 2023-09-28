export enum QualityGateStatusEnum {
  PASSED = "PASSED",
  UNSTABLE = "UNSTABLE",
  FAILED = "FAILED"
}

export class QualityGateResult {
    private _displayName: string;
    private _referenceBuild: string;
    private _type: string;
    private _severity: string;
    private _threshold: number;

    private _status: string = '';
    private _actualNumberOfIssues: number = 0;

    constructor(displayName: string,
                referenceBuild: string,
                type: string,
                severity: string,
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
    public set displayName(v : string) {
      this._displayName = v;
    }

    public get referenceBuild() : string {
      return this._referenceBuild;
    }
    public set referenceBuild(v : string) {
      this._referenceBuild = v;
    }

    public get type() : string {
      return this._type;
    }
    public set type(v : string) {
      this._type = v;
    }

    public get severity() : string {
      return this._severity;
    }
    public set severity(v : string) {
      this._severity = v;
    }

    public get threshold() : number {
      return this._threshold;
    }
    public set threshold(v : number) {
      this._threshold = v;
    }

    public get status() : string {
      return this._status;
    }
    public set status(v : string) {
      this._status = v;
    }

    public get actualNumberOfIssues() : number {
      return this._actualNumberOfIssues;
    }
    public set actualNumberOfIssues(v : number) {
      this._actualNumberOfIssues = v;
    }

    // TODO - will remove, currently used to output the result which will be implemented in separate task
    public get string(): string {
      return `Display name: ${this._displayName}, Actual number of issues: ${this._actualNumberOfIssues}, ${this.referenceBuild ? 'Reference build: ' + this._referenceBuild + ', ' : ''} Status: ${this._status}, Type: ${this._type}, Sverity: ${this._severity}, Thershold: ${this._threshold}`;
    }
 }