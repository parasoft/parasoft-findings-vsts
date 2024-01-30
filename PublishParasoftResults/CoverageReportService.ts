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
import * as fs from 'fs';
import * as sax from 'sax';
import * as lodash from 'lodash';
import * as tl from 'azure-pipelines-task-lib';
import {BuildAPIClient, FileEntry} from "./BuildApiClient";

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
    // Combined attribute: name + filename
    classId: string;
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
    private readonly MERGED_COBERTURA_REPORT_PATH: string = tl.getVariable('System.DefaultWorkingDirectory') + '/parasoft-merged-cobertura.xml';
    buildClient: BuildAPIClient;

    constructor() {
        this.buildClient = new BuildAPIClient();
    }

    async getMergedCoberturaReportByBuildId(buildId: number): Promise<FileEntry | undefined> {
        const coberturaReports = await this.buildClient.getCoberturaReportsByBuildId(buildId);
        return coberturaReports.find(coberturaReport => {
            return coberturaReport.name === "CoberturaContainer/parasoft-merged-cobertura.xml";
        });
    }

    mergeCoberturaReports = (reportPaths: string[]): string => {
        if (!reportPaths || reportPaths.length == 0) {
            tl.warning('No report path found.');
            return '';
        }
        if(reportPaths.length == 1) {
            fs.copyFileSync(reportPaths[0], this.MERGED_COBERTURA_REPORT_PATH);
            return this.MERGED_COBERTURA_REPORT_PATH;
        }

        let baseCoverage = this.processXMLToObj(reportPaths[0]);
        for(let i = 1; i < reportPaths.length; i++) {
            const reportToMerge: CoberturaCoverage = this.processXMLToObj(reportPaths[i]);
            try {
                tl.debug(`Merging Cobertura report: ${reportPaths[i]}`);
                baseCoverage = this.mergeCoberturaCoverage(lodash.cloneDeep(baseCoverage), reportToMerge);
            } catch (error) {
                if (error instanceof Error) {
                    tl.warning(`Skip merging Cobertura report: ${reportPaths[i]} to ${this.MERGED_COBERTURA_REPORT_PATH}, due to ${error.message}`);
                } else {
                    tl.warning(`Skipped merging Cobertura report: ${reportPaths[i]}`);
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
                this.mergeCoberturaClass(baseClass, classToMerge, packageToMerge.name);
            } else {
                basePackage.classes.set(classToMerge.classId, classToMerge);
            }
        });
    }

    private mergeCoberturaClass = (baseClass: CoberturaClass, classToMerge: CoberturaClass, packageName: string): void => {
        if (this.areClassesTheSame(baseClass, classToMerge)) {
            for (let i = 0; i < baseClass.lines.length; i++) {
                baseClass.lines[i].hits += classToMerge.lines[i].hits;
            }
        } else {
            throw new Error(`A conflict occurred while merging Class ‘${baseClass.fileName}’ in package ‘${packageName}’`);
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
        coberturaClass.lines.sort((line1, line2) => {return line1.lineNumber - line2.lineNumber})
        coberturaClass.lines.forEach((line) => {
            classContent += `${line.lineNumber}*${line.lineHash}/`;
        });
        return classContent;
    }

    private updateAttributes = (coberturaCoverage: CoberturaCoverage) => {
        // Update attributes value like 'lineRate','lines-valid','lines-covered' on <coverage>,<package> and <class>
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
                coberturaCoverage.packages.set(coberturaPackage.name, coberturaPackage);
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
}