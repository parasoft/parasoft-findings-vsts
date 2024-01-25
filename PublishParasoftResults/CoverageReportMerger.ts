import * as fs from 'fs';
import * as sax from 'sax';

type CoberturaReport = {
    lineRate: number;
    linesCovered: number;
    linesValid: number;
    version: string;
    packages: Map<string, PackageFolder>;
}

type PackageFolder = {
    name: string;
    lineRate: number;
    classes: Map<string, ClassFile>;
}

type ClassFile = {
    fileName: string;
    name: string;
    lineRate: number;
    classId: string;
    lines: codeLine[];
}

type codeLine = {
    lineNumber: number;
    lineHash: string;
    hits: number;
}

export class CoverageReportMerger{
    private readonly defaultWorkingDirectory: string;

    constructor(defaultWorkingDirectory: string) {
        this.defaultWorkingDirectory = defaultWorkingDirectory;
    }

    mergeCoberturaReports = (reportPath: string[]): string => {
        if(reportPath.length == 1) {
            return reportPath[0];
        }
        let path = reportPath[0];
        const baseReport = this.processToJson(reportPath[0]);
        for(let i = 1; i <reportPath.length; i++) {
            const report: CoberturaReport = this.processToJson(reportPath[i]);
            // Todo: Make sure these two reports have same files and file contents are same then do the merge
            this.mergeCoberturaReport(baseReport, report);
            path = `${this.defaultWorkingDirectory}/parasoft-merged-cobertura.xml`;
        }
        fs.writeFileSync(path, this.processToXML(baseReport), 'utf-8');
        return path;
    };

    private processToJson = (reportPath: string): CoberturaReport => {
        const xml = fs.readFileSync(reportPath, 'utf8');
        const report: CoberturaReport = {
            lineRate: 0,
            linesValid: 0,
            linesCovered: 0,
            version: '',
            packages: new Map<string, PackageFolder>()
        };
        let packageFolder: PackageFolder = {
            name: '',
            lineRate: 0,
            classes: new Map<string, ClassFile>()
        };
        let classFile: ClassFile = {
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
                if (!version) {
                    throw new Error("error in Cobertura code coverage report: failed to parse 'version' attribute.");
                } if (!lineRate || isNaN(parseFloat(lineRate))) {
                    throw new Error("error in Cobertura code coverage report: failed to parse 'line-rate' attribute.");
                } if (!linesCovered || isNaN(parseInt(linesCovered))) {
                    throw new Error("error in Cobertura code coverage report: failed to parse 'lines-covered' attribute.");
                } if (!linesValid || isNaN(parseInt(linesValid))) {
                    throw new Error("error in Cobertura code coverage report: failed to parse 'lines-valid' attribute.");
                } else {
                    report.version = version;
                    report.lineRate = parseFloat(lineRate);
                    report.linesCovered = parseInt(linesCovered);
                    report.linesValid = parseInt(linesValid);
                }
            }
            if (node.name == 'package') {
                const name = (<string> node.attributes.name).replace(/</g, '&lt;').replace(/>/g, '&gt;');
                const lineRate = <string>node.attributes['line-rate'];
                if (!name) {
                    throw new Error("error in Cobertura code coverage report: failed to parse 'name' attribute.");
                } if (!lineRate || isNaN(parseFloat(lineRate))) {
                    throw new Error("error in Cobertura code coverage report: failed to parse 'line-rate' attribute.");
                } else {
                    packageFolder.name = name;
                    packageFolder.lineRate = parseFloat(lineRate);
                }
            }
            if (node.name == 'class') {
                const fileName = <string>node.attributes.filename;
                const name = <string>node.attributes.name;
                const lineRate = <string>node.attributes['line-rate'];

                if (!fileName || !name) {
                    throw new Error("error in Cobertura code coverage report: failed to parse 'filename/name' attribute.");
                } if (!lineRate || isNaN(parseFloat(lineRate))) {
                    throw new Error("error in Cobertura code coverage report: failed to parse 'line-rate' attribute.");
                } else {
                    classFile.name = name;
                    classFile.fileName = fileName;
                    classFile.classId = `${name}-${fileName}`;
                    classFile.lineRate = parseFloat(lineRate);
                }
            }
            if (node.name == 'line') {
                const lineNumber = <string>node.attributes.number;
                const hits = <string>node.attributes.hits;
                const lineHash = <string>node.attributes.hash;

                if (!lineNumber || isNaN(parseInt(lineNumber))) {
                    throw new Error("error in Cobertura code coverage report: failed to parse 'number' attribute.");
                } else if (!lineHash) {
                    throw new Error("error in Cobertura code coverage report: failed to parse 'hash' attribute.");
                } else if (!hits || isNaN(parseInt(hits))) {
                    throw new Error("error in Cobertura code coverage report: failed to parse 'hits' attribute.");
                } else {
                    const line: codeLine = {
                        lineNumber: parseInt(lineNumber),
                        lineHash: lineHash,
                        hits: parseInt(hits)
                    }
                    classFile.lines.push(line);
                }
            }
        };

        saxParser.onerror = (e) => {
            console.error(e);
        };

        saxParser.onclosetag = (nodeName) => {
            if (nodeName == 'class') {
                packageFolder.classes.set(classFile.classId, classFile);
                classFile = {
                    fileName: '',
                    name: '',
                    lineRate: 0,
                    classId: '',
                    lines: []
                };
            }
            if (nodeName == 'package') {
                report.packages.set(packageFolder.name, packageFolder);
                packageFolder = {
                    name: '',
                    lineRate: 0,
                    classes: new Map<string, ClassFile>()
                };

            }
        };

        saxParser.onend = () => {
            // do nothing
        };

        saxParser.write(xml).close();
        return report;
    }

    private mergeCoberturaReport = (baseReport: CoberturaReport, report: CoberturaReport): void => {
        report.packages.forEach((packageFolder) => {
            packageFolder.classes.forEach((classFile) => {
                this.mergeSameClassCoverage(baseReport, classFile, packageFolder.name);
            });
        })
    }

    private mergeSameClassCoverage = (baseReport: CoberturaReport, classFile: ClassFile, packageName: string): void => {
        let newlyCoveredLineNumber: number;

        const basePackageFolder = <PackageFolder> baseReport.packages.get(packageName);
        const baseClass = <ClassFile> basePackageFolder.classes.get(classFile.classId);

        const oldCoveredLines = baseClass.lines.filter((line) => line.hits > 0).length;
        for (let i = 0; i < baseClass.lines.length; i++) {
            baseClass.lines[i].hits += classFile.lines[i].hits;
        }
        newlyCoveredLineNumber = baseClass.lines.filter((line) => line.hits > 0).length - oldCoveredLines;

        baseClass.lineRate = baseClass.lines.filter(line => line.hits > 0).length / baseClass.lines.length;
        basePackageFolder.classes.set(classFile.classId, baseClass);

        const classFiles = Array.from(basePackageFolder.classes.values());
        basePackageFolder.lineRate = classFiles.reduce((sum, packageFolder) => sum + packageFolder.lineRate, 0) / classFiles.length;
        baseReport.packages.set(packageName, basePackageFolder);

        const packageFolders = Array.from(baseReport.packages.values());
        baseReport.lineRate = packageFolders.reduce((sum, packageFolder) => sum + packageFolder.lineRate, 0) / packageFolders.length;
        baseReport.linesCovered += newlyCoveredLineNumber;
    }

    private processToXML = (coberturaReport: CoberturaReport): string => {
        let packageText = '';
        for(const packageFolder of Array.from(coberturaReport.packages.values())) {
            packageText += this.generatePackageText(packageFolder);
        }
        return `<?xml version="1.0" encoding="UTF-8"?>` +
                `<coverage line-rate="${coberturaReport.lineRate}" lines-covered="${coberturaReport.linesCovered}" lines-valid="${coberturaReport.linesValid}" version="${coberturaReport.version}">` +
                `<packages>${packageText}</packages>` +
                `</coverage>`;
    }

    private generatePackageText = (packageFolder: PackageFolder): string => {
        let classesText = '';
        for (const classEle of Array.from(packageFolder.classes.values())) {
            classesText += this.generateClassText(classEle);
        }
        return `<package name="${packageFolder.name}" line-rate="${packageFolder.lineRate}"><classes>${classesText}</classes></package>`;
    }

    private generateClassText = (classFile: ClassFile): string => {
        let linesText = '';
        for (const line of classFile.lines) {
            linesText += `<line number="${line.lineNumber}" hits="${line.hits}" hash="${line.lineHash}" />`
        }
        return `<class filename="${classFile.fileName}" name="${classFile.name}" line-rate="${classFile.lineRate}"><lines>${linesText}</lines></class>`;
    }
}