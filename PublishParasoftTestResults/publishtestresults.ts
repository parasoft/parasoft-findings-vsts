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

const SUFFIX = "-junit.xml";

const testRunner = tl.getInput('testRunner', true);
const testResultsFiles: string[] = tl.getDelimitedInput('testResultsFiles', '\n', true);
const mergeResults = tl.getInput('mergeTestResults');
const platform = tl.getInput('platform');
const config = tl.getInput('configuration');
const testRunTitle = tl.getInput('testRunTitle');
const publishRunAttachments = tl.getInput('publishRunAttachments');
let searchFolder = tl.getInput('searchFolder');

tl.debug('testRunner: ' + testRunner);
tl.debug('testResultsFiles: ' + testResultsFiles);
tl.debug('mergeResults: ' + mergeResults);
tl.debug('platform: ' + platform);
tl.debug('config: ' + config);
tl.debug('testRunTitle: ' + testRunTitle);
tl.debug('publishRunAttachments: ' + publishRunAttachments);

if (isNullOrWhitespace(searchFolder)) {
    searchFolder = tl.getVariable('System.DefaultWorkingDirectory');
}

let matchingTestResultsFiles: string[] = tl.findMatch(searchFolder, testResultsFiles);
if (!matchingTestResultsFiles || matchingTestResultsFiles.length === 0) {
    tl.warning('No test result files matching ' + testResultsFiles + ' were found.');
} else {
    const sheetPath = __dirname + "/xsl/soatest-xunit.xsl";
    const jarPath = __dirname + "/Saxon-HE.jar";
    let transformedReports: string[] = [];
    let tp: tl.TestPublisher = new tl.TestPublisher('JUnit');
    for (var i = 0; i < matchingTestResultsFiles.length; ++i) {
        const sourcePath = matchingTestResultsFiles[i];
        const outPath = sourcePath + SUFFIX;
        let result = tl.execSync("java", ["-jar", jarPath, "-s:"+sourcePath, "-xsl:"+sheetPath, "-o:"+outPath, "-versionmsg:off"]);
        if (result.code == 0) {
            transformedReports.push(outPath);
        } else {
            console.error("Failed to transform report."); // stderr will already be logged to console
        }
    }
    if (transformedReports.length > 0) {
        tp.publish(transformedReports, mergeResults, platform, config, testRunTitle, publishRunAttachments);
    }
}

tl.setResult(tl.TaskResult.Succeeded, '');

function isNullOrWhitespace(input: any) {
    if (typeof input === 'undefined' || input === null) {
        return true;
    }
    return input.replace(/\s/g, '').length < 1;
}