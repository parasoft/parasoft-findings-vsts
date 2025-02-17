/*
 * Copyright 2024 Parasoft Corporation
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
import * as os from 'os';
import * as fs from 'fs';
import * as sax from 'sax';
import * as lodash from 'lodash';
import * as path from 'path';
import * as tl from 'azure-pipelines-task-lib';
import { BuildAPIClient, FileEntry } from "./BuildApiClient";
import * as tr from 'azure-pipelines-task-lib/toolrunner';
import { ParaReportPublishUtils } from "./ParaReportPublishUtils";

type CoberturaCoverage = {
    lineRate: number;
    linesCovered: number;
    linesValid: number;
    version: string;
    packages: Map<string, CoberturaPackage>;
}

type CoberturaPackage = {
    name: string;
    lineRate: number;
    classes: Map<string, CoberturaClass>;
}

type CoberturaClass = {
    classId: string; // Use "name + filename" to identify the class
    fileName: string;
    name: string;
    lineRate: number;
    lines: CoberturaLine[];
}

type CoberturaLine = {
    lineNumber: number;
    lineHash: string;
    hits: number;
}

export class CoverageReportService {
    private readonly MERGED_COBERTURA_REPORT_PATH: string = path.join(tl.getVariable('System.DefaultWorkingDirectory') || '', 'parasoft-merged-cobertura.xml');
    
    private readonly buildClient: BuildAPIClient;
    private readonly buildId: string;

    constructor() {
        this.buildId = tl.getVariable('Build.BuildId') || '';

        this.buildClient = new BuildAPIClient();
    }

    async processCoberturaResults(coberturaReports: string[]): Promise<void> {
        if (coberturaReports.length > 0) {
            const parasoftFindingsTempFolder = path.join(ParaReportPublishUtils.getTempFolder(), 'ParasoftFindings')
            
            // Get merged cobertura report from artifacts and save it to a temp file
            let mergedCoberturaReportFileFromArtifacts: string | undefined;
            const mergedCoberturaReportFromArtifacts = await this.getMergedCoberturaReportByBuildId(Number(this.buildId));
            if (mergedCoberturaReportFromArtifacts) {
                mergedCoberturaReportFileFromArtifacts = path.join(parasoftFindingsTempFolder, "parasoft-merged-cobertura-from-artifact.xml");
                fs.writeFileSync(mergedCoberturaReportFileFromArtifacts, await mergedCoberturaReportFromArtifacts.contentsPromise, 'utf-8');
            }
            // Merge cobertura reports from artifacts and current task
            const finalMergedCoberturaReportFile = this.mergeCoberturaReports(coberturaReports, mergedCoberturaReportFileFromArtifacts);
            if (!finalMergedCoberturaReportFile) {
                tl.warning('No Parasoft coverage results were found in this build.'); // Should never happen
                return;
            }
            // Generate and publish code coverage html report
            const codeCoverageHtmlTempFolder = path.join(parasoftFindingsTempFolder, 'CodeCoverageHtml');
            this.generateHtmlReport(finalMergedCoberturaReportFile, codeCoverageHtmlTempFolder);

            const coveragePublisher = new tl.CodeCoveragePublisher();
            coveragePublisher.publish('Cobertura', finalMergedCoberturaReportFile, codeCoverageHtmlTempFolder, '');
            tl.uploadArtifact('CoberturaContainer', finalMergedCoberturaReportFile, 'ParasoftCoverageLogs');
        }
    }

    async getMergedCoberturaReportByBuildId(buildId: number): Promise<FileEntry | undefined> {
        const coberturaReports = await this.buildClient.getCoberturaReportsByBuildId(buildId);
        return coberturaReports.find(coberturaReport => {
            return coberturaReport.name === "CoberturaContainer/parasoft-merged-cobertura.xml";
        });
    }

    /**
     * Merges multiple Cobertura coverage reports into a single report.
     * 
     * @param reportPaths Array containing the file paths of Cobertura reports to be merged.
     * @param baseReportPath (Optional) Path to the base report for merging.
     *                       The first report in reportPaths is used as default if unspecified or undefined.
     * @returns Path to the merged Cobertura report (named 'parasoft-merged-cobertura.xml').
     *          Returns undefined if reportPaths is empty or null and baseReportPath is unspecified.
     */
    private mergeCoberturaReports = (reportPaths: string[], baseReportPath?: string): string | undefined => {
        reportPaths = reportPaths || [];
        let startIndex: number = 0;
        if (!baseReportPath) {
            if (!reportPaths.length) {
                return undefined;
            }
            baseReportPath = reportPaths[0];
            startIndex = 1;
        }

        tl.debug(`Using Cobertura report '${baseReportPath}' as base report.`);
        let baseCoverage = this.processXMLToObj(baseReportPath);
        for (let i = startIndex; i < reportPaths.length; i++) {
            const reportToMerge: CoberturaCoverage = this.processXMLToObj(reportPaths[i]);
            try {
                tl.debug(`Merging Cobertura report: ${reportPaths[i]}`);
                baseCoverage = this.mergeCoberturaCoverage(lodash.cloneDeep(baseCoverage), reportToMerge);
            } catch (error) {
                if (error instanceof Error) {
                    tl.warning(`Coverage data in report '${reportPaths[i]}' was not merged due to ${error.message}`);
                } else {
                    tl.warning(`Coverage data in report '${reportPaths[i]}' was not merged`); // Should never happen
                }
            }
        }

        this.updateAttributes(baseCoverage);
        fs.writeFileSync(this.MERGED_COBERTURA_REPORT_PATH, this.processObjToXML(baseCoverage), 'utf-8');
        return this.MERGED_COBERTURA_REPORT_PATH;
    };

    private mergeCoberturaCoverage = (baseCoverage: CoberturaCoverage, coverageToMerge: CoberturaCoverage): CoberturaCoverage => {
        coverageToMerge.packages.forEach((packageToMerge) => {
            const basePackage = baseCoverage.packages.get(packageToMerge.name);
            if (basePackage) {
                this.mergeCoberturaPackage(basePackage, packageToMerge);
            } else {
                baseCoverage.packages.set(packageToMerge.name, packageToMerge);
            }
        })
        return baseCoverage;
    }

    private mergeCoberturaPackage = (basePackage: CoberturaPackage, packageToMerge: CoberturaPackage) => {
        packageToMerge.classes.forEach((classToMerge) => {
            const baseClass = basePackage.classes.get(classToMerge.classId);
            if (baseClass) {
                this.mergeCoberturaClass(baseClass, classToMerge);
            } else {
                basePackage.classes.set(classToMerge.classId, classToMerge);
            }
        });
    }

    private mergeCoberturaClass = (baseClass: CoberturaClass, classToMerge: CoberturaClass): void => {
        this.sortLines(baseClass);
        this.sortLines(classToMerge);
        if (this.areClassesTheSame(baseClass, classToMerge)) {
            for (let i = 0; i < baseClass.lines.length; i++) {
                baseClass.lines[i].hits += classToMerge.lines[i].hits;
            }
        } else {
            throw new Error(`an inconsistent set of lines reported for file '${baseClass.fileName}'`);
        }
    }

    private areClassesTheSame = (coberturaClass1: CoberturaClass, coberturaClass2: CoberturaClass): boolean => {
        if (coberturaClass1.lines.length !== coberturaClass2.lines.length) {
            return false
        } else {
            return this.getCoberturaClassContent(coberturaClass1) === this.getCoberturaClassContent(coberturaClass2);
        }
    }

    private getCoberturaClassContent = (coberturaClass: CoberturaClass): string => {
        let classContent = '';
        coberturaClass.lines.forEach((line) => {
            classContent += `${line.lineNumber}*${line.lineHash}/`;
        });
        return classContent;
    }

    private sortLines = (coberturaClass: CoberturaClass) => {
        coberturaClass.lines.sort((line1, line2) => {return line1.lineNumber - line2.lineNumber});
    };

    /**
     * Recalculation for attribute values like 'lineRate','lines-valid','lines-covered' on <coverage>, <package> and <class>
     */
    private updateAttributes = (coberturaCoverage: CoberturaCoverage) => {
        let coverableLinesOnCoverage: number = 0;
        let coveredLinesOnCoverage: number = 0;

        coberturaCoverage.packages.forEach((coberturaPackage) => {
            let coveredLinesOnPackage: number = 0;
            let coverableLinesOnPackage: number = 0;
            coberturaPackage.classes.forEach((coberturaClass) => {
                const coveredLinesOnClass = coberturaClass.lines.filter((line) => line.hits > 0).length;
                const coverableLinesOnClass = coberturaClass.lines.length;
                coberturaClass.lineRate = coveredLinesOnClass / coverableLinesOnClass;
                coveredLinesOnPackage += coveredLinesOnClass;
                coverableLinesOnPackage += coverableLinesOnClass;
            });

            coberturaPackage.lineRate = coveredLinesOnPackage / coverableLinesOnPackage;
            coveredLinesOnCoverage += coveredLinesOnPackage;
            coverableLinesOnCoverage += coverableLinesOnPackage;
        });

        coberturaCoverage.linesCovered = coveredLinesOnCoverage;
        coberturaCoverage.linesValid = coverableLinesOnCoverage;
        coberturaCoverage.lineRate = coveredLinesOnCoverage / coverableLinesOnCoverage;
    }

    private processXMLToObj = (reportPath: string): CoberturaCoverage => {
        const xml = fs.readFileSync(reportPath, 'utf8');
        const coberturaCoverage: CoberturaCoverage = {
            lineRate: 0,
            linesValid: 0,
            linesCovered: 0,
            version: '',
            packages: new Map<string, CoberturaPackage>()
        };
        let coberturaPackage: CoberturaPackage = {
            name: '',
            lineRate: 0,
            classes: new Map<string, CoberturaClass>()
        };
        let coberturaClass: CoberturaClass = {
            fileName: '',
            name: '',
            lineRate: 0,
            classId: '',
            lines: []
        }
        const saxParser = sax.parser(true, {});
        saxParser.onopentag = (node) => {
            if (node.name == 'coverage') {
                const version = <string>node.attributes.version;
                const lineRate = <string>node.attributes['line-rate'];
                const linesCovered = <string>node.attributes['lines-covered'];
                const linesValid = <string>node.attributes['lines-valid'];
                coberturaCoverage.version = version;
                coberturaCoverage.lineRate = parseFloat(lineRate);
                coberturaCoverage.linesCovered = parseInt(linesCovered);
                coberturaCoverage.linesValid = parseInt(linesValid);
            }
            if (node.name == 'package') {
                const name = (<string> node.attributes.name).replace(/</g, '&lt;').replace(/>/g, '&gt;');
                const lineRate = <string>node.attributes['line-rate'];
                coberturaPackage.name = name;
                coberturaPackage.lineRate = parseFloat(lineRate);
            }
            if (node.name == 'class') {
                const fileName = <string>node.attributes.filename;
                const name = <string>node.attributes.name;
                const lineRate = <string>node.attributes['line-rate'];

                coberturaClass.name = name;
                coberturaClass.fileName = fileName;
                coberturaClass.classId = `${name}-${fileName}`;
                coberturaClass.lineRate = parseFloat(lineRate);
            }
            if (node.name == 'line') {
                const lineNumber = <string>node.attributes.number;
                const hits = <string>node.attributes.hits;
                const lineHash = <string>node.attributes.hash;
                const line: CoberturaLine = {
                    lineNumber: parseInt(lineNumber),
                    lineHash: lineHash,
                    hits: parseInt(hits)
                }
                coberturaClass.lines.push(line);
            }
        };

        saxParser.onerror = (e) => {
            tl.warning('Failed to process Cobertura report: ' + reportPath + '. Error was: ' + e.message);
        };

        saxParser.onclosetag = (nodeName) => {
            if (nodeName == 'class') {
                coberturaPackage.classes.set(coberturaClass.classId, coberturaClass);
                coberturaClass = {
                    fileName: '',
                    name: '',
                    lineRate: 0,
                    classId: '',
                    lines: []
                };
            }
            if (nodeName == 'package') {
                let existingCoberturaPackage: CoberturaPackage | undefined = coberturaCoverage.packages.get(coberturaPackage.name);

                if (existingCoberturaPackage) {
                    this.mergeCoberturaPackage(existingCoberturaPackage, coberturaPackage);
                } else {
                    existingCoberturaPackage = coberturaPackage;
                }
                coberturaCoverage.packages.set(coberturaPackage.name, existingCoberturaPackage);
                coberturaPackage = {
                    name: '',
                    lineRate: 0,
                    classes: new Map<string, CoberturaClass>()
                };

            }
        };

        saxParser.onend = () => {
            // do nothing
        };

        saxParser.write(xml).close();
        return coberturaCoverage;
    }

    private processObjToXML = (coberturaReport: CoberturaCoverage): string => {
        let coberturaPackagesText = '';
        for(const coberturaPackage of Array.from(coberturaReport.packages.values())) {
            coberturaPackagesText += this.generateCoberturaPackageText(coberturaPackage);
        }
        return `<?xml version="1.0" encoding="UTF-8"?>` +
            `<coverage line-rate="${coberturaReport.lineRate}" lines-covered="${coberturaReport.linesCovered}" lines-valid="${coberturaReport.linesValid}" version="${coberturaReport.version}">` +
            `<packages>${coberturaPackagesText}</packages>` +
            `</coverage>`;
    }

    private generateCoberturaPackageText = (coberturaPackage: CoberturaPackage): string => {
        let coberturaClassesText = '';
        for (const coberturaClass of Array.from(coberturaPackage.classes.values())) {
            coberturaClassesText += this.generateCoberturaClassText(coberturaClass);
        }
        return `<package name="${coberturaPackage.name}" line-rate="${coberturaPackage.lineRate}"><classes>${coberturaClassesText}</classes></package>`;
    }

    private generateCoberturaClassText = (coberturaClass: CoberturaClass): string => {
        let coberturaLinesText = '';
        for (const coberturaLine of coberturaClass.lines) {
            coberturaLinesText += `<line number="${coberturaLine.lineNumber}" hits="${coberturaLine.hits}" hash="${coberturaLine.lineHash}" />`
        }
        return `<class filename="${coberturaClass.fileName}" name="${coberturaClass.name}" line-rate="${coberturaClass.lineRate}"><lines>${coberturaLinesText}</lines></class>`;
    }

    // code from azure-pipelines-tasks/Tasks/PublishCodeCoverageResultsV1
    private generateHtmlReport = (summaryFile: string, targetDir: string): boolean => {
        const platform = os.platform();
        let dotnet: tr.ToolRunner;

        const dotnetPath = tl.which('dotnet', false);
        if (!dotnetPath && platform !== 'win32') {
            tl.warning("Please install dotnet core to enable automatic generation of coverage Html report.");
            return false;
        }

        if (!dotnetPath && platform === 'win32') {
            // use full .NET to execute
            dotnet = tl.tool(path.join(__dirname, 'lib', 'net47', 'ReportGenerator.exe'));
        } else {
            dotnet = tl.tool(dotnetPath);
            dotnet.arg(path.join(__dirname, 'lib', 'netcoreapp2.0', 'ReportGenerator.dll'));
        }

        dotnet.arg('-reports:' + summaryFile);
        dotnet.arg('-targetdir:' + targetDir);
        dotnet.arg('-reporttypes:HtmlInline_AzurePipelines');

        try {
            const result = dotnet.execSync(<tr.IExecOptions>{
                ignoreReturnCode: true,
                failOnStdErr: false,
                errStream: process.stdout,
                outStream: process.stdout
            });

            let isError = false;
            dotnet.on('stderr', (data: Buffer) => {
                console.error(data.toString());
                isError = true;
            });

            if (result.code === 0 && !isError) {
                console.log("Generated code coverage html report: " + targetDir);
                return true;
            } else {
                tl.warning("Failed to generate Html report. Error: " + result);
            }
        } catch (err) {
            tl.warning("Failed to generate Html report. Error: " + err);
        }
        return false;
    }
}