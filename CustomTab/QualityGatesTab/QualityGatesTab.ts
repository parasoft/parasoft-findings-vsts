import Controls = require("VSS/Controls");

export class InfoTab extends Controls.BaseControl {
    constructor() {
        super();
    }

    public initialize(): void {
        super.initialize();
    }
}

InfoTab.enhance(InfoTab, $(".build-info"), {});

VSS.notifyLoadSucceeded();