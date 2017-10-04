/*
 * Copyright 2017 Parasoft Corporation
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

import * as tl from 'vsts-task-lib/task';
import * as fs from 'fs';
import * as sax from 'sax';

const SUFFIX = "-junit.xml";
const XTEST10X_OPTION = "XTest10x";

const testRunner = tl.getInput('testRunner', true);
const testResultsFiles: string[] = tl.getDelimitedInput('testResultsFiles', '\n', true);
const mergeResults = tl.getInput('mergeTestResults');
const platform = tl.getInput('platform');
const config = tl.getInput('configuration');
const testRunTitle = tl.getInput('testRunTitle');
const publishRunAttachments = tl.getInput('publishRunAttachments');
const failOnTestFailures = tl.getInput('failOnTestFailures');
let searchFolder = tl.getInput('searchFolder');

tl.debug('testRunner: ' + testRunner);
tl.debug('testResultsFiles: ' + testResultsFiles);
tl.debug('mergeResults: ' + mergeResults);
tl.debug('platform: ' + platform);
tl.debug('config: ' + config);
tl.debug('testRunTitle: ' + testRunTitle);
tl.debug('publishRunAttachments: ' + publishRunAttachments);
tl.debug('failOnTestFailures: ' + failOnTestFailures);

if (isNullOrWhitespace(searchFolder)) {
    searchFolder = tl.getVariable('System.DefaultWorkingDirectory');
}

let transformedReports: string[] = [];
let matchingTestResultsFiles: string[] = tl.findMatch(searchFolder, testResultsFiles);
if (!matchingTestResultsFiles || matchingTestResultsFiles.length === 0) {
    tl.warning('No test result files matching ' + testResultsFiles + ' were found.');
} else {
    let sheetPath: string = __dirname + "/xsl/soatest-xunit.xsl"
    if (testRunner == XTEST10X_OPTION) {
        sheetPath = __dirname + "/xsl/xunit.xsl"
    }
    const jarPath = __dirname + "/Saxon-HE.jar";
    let tp: tl.TestPublisher = new tl.TestPublisher('JUnit');
    for (var i = 0; i < matchingTestResultsFiles.length; ++i) {
        const sourcePath = matchingTestResultsFiles[i];
        const outPath = sourcePath + SUFFIX;
        let result = tl.execSync("java", ["-jar", jarPath, "-s:"+sourcePath, "-xsl:"+sheetPath, "-o:"+outPath, "-versionmsg:off"]);
        if (result.code == 0) {
            transformedReports.push(outPath);
        } else {
            tl.warning("Failed to transform report: " + sourcePath + ". See log for details.");
        }
    }
    if (transformedReports.length > 0) {
        tp.publish(transformedReports, mergeResults, platform, config, testRunTitle, publishRunAttachments);
    }
}

if (transformedReports.length > 0 && failOnTestFailures == 'true') {
    setResultUsingReportOutput(transformedReports, 0);
} else {
    tl.setResult(tl.TaskResult.Succeeded, '');
}

function setResultUsingReportOutput(transformedReports: string[], index: number) {
    let success: boolean = true;
    let report: string = transformedReports[index];
    const saxStream = sax.createStream(true, {});
    saxStream.on("opentag", function (node) {
        if (node.name == 'testsuites' || node.name == 'testsuite') {
            success = success && (node.attributes.failures == 0 && node.attributes.errors == 0);
        }
    });
    saxStream.on("error", function (e) {
        tl.warning('Failed to parse ' + report + '. Error was: ' + e.message);
    });
    saxStream.on("end", function() {
        if (success) {
            if (index < transformedReports.length - 1) {
                setResultUsingReportOutput(transformedReports, ++index);
            } else {
                tl.setResult(tl.TaskResult.Succeeded, '');
            }
        } else {
            tl.setResult(tl.TaskResult.Failed, 'Failed build due to test failures.');
        }
    });
    fs.createReadStream(report).pipe(saxStream);
}

function isNullOrWhitespace(input: any) {
    if (typeof input === 'undefined' || input === null) {
        return true;
    }
    return input.replace(/\s/g, '').length < 1;
}