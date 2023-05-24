var reporters = require('jasmine-reporters');
var junitReporter = new reporters.JUnitXmlReporter({
    savePath: 'test-reports',
    consolidateAll: false
});

module.exports = {
    reporters: [ junitReporter ]
}
