import * as tl from '../../PublishParasoftResults/node_modules/azure-pipelines-task-lib';
import * as azdev from '../../PublishParasoftResults/node_modules/azure-devops-node-api';
import * as fs from 'fs';
import * as os from 'os';
import * as dp from "../../PublishParasoftResults/node_modules/dot-properties";
import * as path from 'path';
import { ParaReportPublishService } from "../../PublishParasoftResults/ParaReportPublishService";
const axios = require('../../PublishParasoftResults/node_modules/axios/dist/node/axios.cjs');

let publisher: any;
let mockWebApi: any;
let mockGenerateUniqueFileNameFunction: any;
let mockGetSarifReportsOfReferenceBuildFunction: any;

describe("Parasoft findings Azure", () => {
    beforeEach(() => {
        spyOn(tl, 'getDelimitedInput').and.returnValue(['foobar']);
        spyOn(tl, 'getInput').and.returnValue('foobar');
        spyOn(tl, 'getBoolInput').and.returnValue(false);
        spyOn(tl, 'debug');
        spyOn(tl, 'setResult');
        spyOn(tl, 'setVariable');
        spyOn(tl, 'warning');
        spyOn(tl, 'error');
        spyOn(tl, 'getEndpointAuthorization');
        spyOn(tl, 'getPathInput').and.returnValue(undefined);
        spyOn(tl, 'uploadArtifact');

        mockWebApi = jasmine.createSpy('WebApi').and.returnValue({
            getBuildApi: jasmine.createSpy('getBuildApi').and.returnValue({
                getDefinitions: jasmine.createSpy('getDefinitions'),
                getBuilds: jasmine.createSpy('getBuilds'),
                getArtifact: jasmine.createSpy('getArtifact'),
            }),
        });
        spyOn(azdev, 'WebApi').and.callFake(mockWebApi);
    });

    describe('transformReports() - transform report and input report type is', () => {
        let retryTimes: number;

        async function sleep(ms: number) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        async function waitForTransform(filePath?: string) {
            for (let i = 0; i < retryTimes; i++) {
                if (filePath) {
                    if (fs.existsSync(filePath)){
                        break;
                    }
                }
                await sleep(1000);
            }
        }

        beforeEach(() => {
            publisher = new ParaReportPublishService();
            spyOn(publisher, 'transform').and.callThrough();
            mockGetSarifReportsOfReferenceBuildFunction = spyOn(publisher.staticAnalysisReportService, 'getSarifReportsOfReferenceBuild');
            mockGetSarifReportsOfReferenceBuildFunction.and.returnValue([]);
            mockGenerateUniqueFileNameFunction = spyOn(publisher.staticAnalysisReportService, 'generateUniqueFileName');
            jasmine.DEFAULT_TIMEOUT_INTERVAL = 200000;
            retryTimes = 20;

            expect(publisher.sarifReports.length).toBe(0);
            expect(publisher.xUnitReports.length).toBe(0);
            expect(publisher.coberturaReports.length).toBe(0);
            expect(publisher.transform).not.toHaveBeenCalled();
            expect(tl.setVariable).toHaveBeenCalledTimes(1);
        });

        it('SARIF', async () => {
            mockGenerateUniqueFileNameFunction.and.returnValue(__dirname + '/resources/reports/SARIF.sarif');
            publisher.staticAnalysisReportService.defaultWorkingDirectory = 'D:/RWorkspaces/project-workspace/CICD/para % bank';
            await publisher.transformReports([__dirname + '/resources/reports/SARIF.sarif'], 0);

            let expectedReport = fs.readFileSync(__dirname + '/resources/reports/expect/SARIF-sarif-pf-sast.sarif', 'utf8');
            let result = fs.readFileSync(__dirname + '/resources/reports/SARIF-sarif-pf-sast.sarif', 'utf-8');

            expect(result).toEqual(expectedReport);
            expect(publisher.transform).not.toHaveBeenCalled();
            expect(publisher.sarifReports.length).toBe(1);
            expect(tl.setVariable).toHaveBeenCalledTimes(2);

            fs.unlink(__dirname + '/resources/reports/SARIF-sarif-pf-sast.sarif', () => {});
        });

        describe('XML_STATIC', () => {
            let reportTempFolder: string;
            const agentTempDirectory = `${__dirname}/_temp`;

            beforeEach(() => {
                reportTempFolder = path.join(agentTempDirectory, 'ParasoftFindings/SarifContainer');
                mockGenerateUniqueFileNameFunction.and.returnValue(__dirname + '/resources/reports/XML_STATIC.xml');
                spyOn(tl, 'getVariable').and.callFake((param: string) => {
                    switch (param) {
                        case 'Agent.TempDirectory':
                            return agentTempDirectory
                    }
                });
            });

            afterEach(() => {
                let expectedReport = fs.readFileSync(__dirname + '/resources/reports/expect/XML_STATIC-xml-pf-sast.sarif', 'utf8');
                let result = fs.readFileSync(__dirname + '/resources/reports/XML_STATIC-xml-pf-sast.sarif', 'utf-8');

                expect(result).toEqual(expectedReport);
                expect(publisher.transform).toHaveBeenCalled();
                expect(publisher.sarifReports.length).toBe(1);

                fs.unlink(__dirname + '/resources/reports/XML_STATIC-xml-pf-sast.sarif', () => {});
                if (fs.existsSync(agentTempDirectory)) {
                    fs.rmSync(agentTempDirectory, {recursive: true});
                }
            });

            it('when no need to update baseline state of report in artifact', async () => {
                const buildResultForTest = {referencePipelineInput: 'testPipelineName', referenceBuildInput: '10'};
                publisher.staticAnalysisReportService.previousReferenceBuildResult = JSON.stringify(buildResultForTest);
                publisher.staticAnalysisReportService.referenceBuildResult = buildResultForTest;

                await publisher.transformReports([__dirname + '/resources/reports/XML_STATIC.xml'], 0);
                await waitForTransform(__dirname + '/resources/reports/XML_STATIC-xml-pf-sast.sarif');

                expect(tl.uploadArtifact).toHaveBeenCalledTimes(1);
                expect(tl.uploadArtifact).not.toHaveBeenCalledWith('SarifContainer', path.join(reportTempFolder, 'XML_STATIC-xml-pf-sast.sarif'), 'CodeAnalysisLogs');
            });

            it('when need to update baseline state of report in artifact', async () => {
                const sarifReportFile = {name: 'XML_STATIC-xml-pf-sast.sarif', contentsPromise: Promise.resolve(fs.readFileSync(__dirname + '/resources/reports/expect/SARIF-sarif-pf-sast.sarif', 'utf-8'))};
                spyOn(publisher.staticAnalysisReportService.buildClient, 'getSarifReportsByBuildId').and.returnValue([sarifReportFile]);
                mockGetSarifReportsOfReferenceBuildFunction.and.returnValue([sarifReportFile]);
                publisher.staticAnalysisReportService.previousReferenceBuildResult = '{"referencePipelineInput":"testPipelineName","referenceBuildInput":"9"}';
                publisher.staticAnalysisReportService.referenceBuildResult = {referencePipelineInput: 'testPipelineName2', referenceBuildInput: '10'};

                await publisher.transformReports([__dirname + '/resources/reports/XML_STATIC.xml'], 0);
                await waitForTransform(__dirname + '/resources/reports/XML_STATIC-xml-pf-sast.sarif');

                expect(tl.uploadArtifact).toHaveBeenCalledTimes(2);
                expect(tl.uploadArtifact).toHaveBeenCalledWith('SarifContainer', path.join(reportTempFolder, 'XML_STATIC-xml-pf-sast.sarif'), 'CodeAnalysisLogs');
                expect(tl.debug).toHaveBeenCalledWith(`Updated existing sarif report '${sarifReportFile.name}' in artifacts due to the reference build was changed.`);
            });
        });

        it('XML_STATIC_BD.PB.VOVR_RULE', async () => {
            mockGenerateUniqueFileNameFunction.and.returnValue(__dirname + '/resources/reports/XML_STATIC_BD.PB.VOVR_RULE.xml');
            publisher.transformReports([__dirname + '/resources/reports/XML_STATIC_BD.PB.VOVR_RULE.xml'], 0);
            await waitForTransform(__dirname + '/resources/reports/XML_STATIC_BD.PB.VOVR_RULE-xml-pf-sast.sarif');

            let expectedReport = fs.readFileSync(__dirname + '/resources/reports/expect/XML_STATIC_BD.PB.VOVR_RULE-xml-pf-sast.sarif', 'utf8');
            let result = fs.readFileSync(__dirname + '/resources/reports/XML_STATIC_BD.PB.VOVR_RULE-xml-pf-sast.sarif', 'utf-8');

            expect(result).toEqual(expectedReport);
            expect(publisher.transform).toHaveBeenCalled();
            expect(publisher.sarifReports.length).toBe(1);

            fs.unlink(__dirname + '/resources/reports/XML_STATIC_BD.PB.VOVR_RULE-xml-pf-sast.sarif', () => {});
        });

        it('XML_STATIC_1 with multiple violations which have the same identify info, should generate unique unbViolId', async () => {
            mockGenerateUniqueFileNameFunction.and.returnValue(__dirname + '/resources/reports/XML_STATIC_1-same_violations_with_different_unbViolId.xml');
            publisher.transformReports([__dirname + '/resources/reports/XML_STATIC_1-same_violations_with_different_unbViolId.xml'], 0);
            await waitForTransform(__dirname + '/resources/reports/XML_STATIC_1-same_violations_with_different_unbViolId-xml-pf-sast.sarif');

            let expectedReport = fs.readFileSync(__dirname + '/resources/reports/expect/XML_STATIC_1-same_violations_with_different_unbViolId-xml-pf-sast.sarif', 'utf8');
            let result = fs.readFileSync(__dirname + '/resources/reports/XML_STATIC_1-same_violations_with_different_unbViolId-xml-pf-sast.sarif', 'utf-8');

            expect(result).toEqual(expectedReport);
            expect(publisher.transform).toHaveBeenCalled();
            expect(publisher.sarifReports.length).toBe(1);

            fs.unlink(__dirname + '/resources/reports/XML_STATIC_1-same_violations_with_different_unbViolId-xml-pf-sast.sarif', () => {});
        });

        describe('XML_TESTS', () => {
            it('and the report is from CPP', async () => {
                publisher.transformReports([__dirname + '/resources/reports/XML_TESTS_CPP.xml'], 0);
                await waitForTransform(__dirname + '/resources/reports/XML_TESTS_CPP-xml-junit.xml');

                let expectedReport = fs.readFileSync(__dirname + '/resources/reports/expect/XML_TESTS_CPP-xml-junit.xml', 'utf8');
                let result = fs.readFileSync(__dirname + '/resources/reports/XML_TESTS_CPP-xml-junit.xml', 'utf-8');

                expect(result).toEqual(expectedReport);
                expect(publisher.transform).toHaveBeenCalled();
                expect(publisher.xUnitReports.length).toBe(1);

                fs.unlink(__dirname + '/resources/reports/XML_TESTS_CPP-xml-junit.xml', () => {});
            });

            it('and the report is from JTEST', async() => {
                publisher.defaultWorkingDirectory = 'E:/RLIU_DEVS/SonarQube/sonar_integration_test_example_projects/example_projects/multi-module-demo/demo-module-three';
                publisher.transformReports([__dirname + '/resources/reports/XML_TESTS_JTEST.xml'], 0);
                await waitForTransform(__dirname + '/resources/reports/XML_TESTS_JTEST-xml-junit.xml');

                let expectedReport = fs.readFileSync(__dirname + '/resources/reports/expect/XML_TESTS_JTEST-xml-junit.xml', 'utf8');
                let result = fs.readFileSync(__dirname + '/resources/reports/XML_TESTS_JTEST-xml-junit.xml', 'utf-8');

                expect(result).toEqual(expectedReport);
                expect(publisher.transform).toHaveBeenCalled();
                expect(publisher.xUnitReports.length).toBe(1);

                fs.unlink(__dirname + '/resources/reports/XML_TESTS_JTEST-xml-junit.xml', () => {});
            });

            it('and the report is from DOTTEST', async() => {
                publisher.defaultWorkingDirectory = 'C:/Workspace/jenkins_refactoring_code_workspace/workspace/cicd.findings.dottest.2023.1.BankExample.pipeline.local_docs';
                // Need to set JAVA_HOME environment or comment this test if this test is failed.
                publisher.javaPath = tl.resolve(process.env.JAVA_HOME, 'bin', os.platform() == 'win32' ? "java.exe" : "java");
                publisher.transformReports([__dirname + '/resources/reports/XML_TESTS_DOTTEST.xml'], 0);
                await waitForTransform(__dirname + '/resources/reports/XML_TESTS_DOTTEST-xml-junit.xml');

                let expectedReport = fs.readFileSync(__dirname + '/resources/reports/expect/XML_TESTS_DOTTEST-xml-junit.xml', 'utf8');
                let result = fs.readFileSync(__dirname + '/resources/reports/XML_TESTS_DOTTEST-xml-junit.xml', 'utf-8');

                expect(result).toEqual(expectedReport);
                expect(publisher.transform).toHaveBeenCalled();
                expect(publisher.xUnitReports.length).toBe(1);

                fs.unlink(__dirname + '/resources/reports/XML_TESTS_DOTTEST-xml-junit.xml', () => {});
            });
        })

        it('XML_STATIC_AND_TESTS', async () => {
            mockGenerateUniqueFileNameFunction.and.returnValue(__dirname + '/resources/reports/XML_STATIC_AND_TESTS_CPP.xml');
            publisher.transformReports([__dirname + '/resources/reports/XML_STATIC_AND_TESTS_CPP.xml'], 0);
            await waitForTransform(__dirname + '/resources/reports/XML_STATIC_AND_TESTS_CPP-xml-pf-sast.sarif');
            await waitForTransform(__dirname + '/resources/reports/XML_STATIC_AND_TESTS_CPP-xml-junit.xml');

            let expectedSarifReport = fs.readFileSync(__dirname + '/resources/reports/expect/XML_STATIC_AND_TESTS_CPP-xml-pf-sast.sarif', 'utf8');
            let sarifResult = fs.readFileSync(__dirname + '/resources/reports/XML_STATIC_AND_TESTS_CPP-xml-pf-sast.sarif', 'utf-8');
            let expectedJunitReport = fs.readFileSync(__dirname + '/resources/reports/expect/XML_STATIC_AND_TESTS_CPP-xml-junit.xml', 'utf8');
            let junitResult = fs.readFileSync(__dirname + '/resources/reports/XML_STATIC_AND_TESTS_CPP-xml-junit.xml', 'utf-8');

            expect(sarifResult).toEqual(expectedSarifReport);
            expect(junitResult).toEqual(expectedJunitReport);
            expect(publisher.transform).toHaveBeenCalled();
            expect(publisher.sarifReports.length).toBe(1);
            expect(publisher.xUnitReports.length).toBe(1);
            fs.unlink(__dirname + '/resources/reports/XML_STATIC_AND_TESTS_CPP-xml-pf-sast.sarif', () => {});
            fs.unlink(__dirname + '/resources/reports/XML_STATIC_AND_TESTS_CPP-xml-junit.xml', () => {});
        });

        it('XML_SOATEST', async () => {
            publisher.defaultWorkingDirectory = 'C:/home/marzec/nightly/soavirt-server/virtualize_workspace_clean';
            publisher.transformReports([__dirname + '/resources/reports/XML_SOATEST.xml'], 0);
            await waitForTransform(__dirname + '/resources/reports/XML_SOATEST-xml-junit.xml');

            let expectedReport = fs.readFileSync(__dirname + '/resources/reports/expect/XML_SOATEST-xml-junit.xml', 'utf8');
            let result = fs.readFileSync(__dirname + '/resources/reports/XML_SOATEST-xml-junit.xml', 'utf-8');

            expect(result).toEqual(expectedReport);
            expect(publisher.transform).toHaveBeenCalled();
            expect(publisher.xUnitReports.length).toBe(1);

            fs.unlink(__dirname + '/resources/reports/XML_SOATEST-xml-junit.xml', () => {});
        });

        it('XML_STATIC_AND_SOATEST', async () => {
            mockGenerateUniqueFileNameFunction.and.returnValue(__dirname + '/resources/reports/XML_STATIC_AND_SOATEST.xml');
            publisher.defaultWorkingDirectory = 'C:/Users/mgorecka/parasoft/soavirt-static-workspace';
            publisher.transformReports([__dirname + '/resources/reports/XML_STATIC_AND_SOATEST.xml'], 0);
            await waitForTransform(__dirname + '/resources/reports/XML_STATIC_AND_SOATEST-xml-pf-sast.sarif');

            let expectedSarifReport = fs.readFileSync(__dirname + '/resources/reports/expect/XML_STATIC_AND_SOATEST-xml-pf-sast.sarif', 'utf8');
            let sarifResult = fs.readFileSync(__dirname + '/resources/reports/XML_STATIC_AND_SOATEST-xml-pf-sast.sarif', 'utf-8');
            let expectedJunitReport = fs.readFileSync(__dirname + '/resources/reports/expect/XML_STATIC_AND_SOATEST-xml-junit.xml', 'utf8');
            let junitResult = fs.readFileSync(__dirname + '/resources/reports/XML_STATIC_AND_SOATEST-xml-junit.xml', 'utf-8');

            expect(sarifResult).toEqual(expectedSarifReport);
            expect(junitResult).toEqual(expectedJunitReport);
            expect(publisher.transform).toHaveBeenCalled();
            expect(publisher.sarifReports.length).toBe(1);
            expect(publisher.xUnitReports.length).toBe(1);
            fs.unlink(__dirname + '/resources/reports/XML_STATIC_AND_SOATEST-xml-pf-sast.sarif', () => {});
            fs.unlink(__dirname + '/resources/reports/XML_STATIC_AND_SOATEST-xml-junit.xml', () => {});
        });

        it('XML_XUNIT', async () => {
            publisher.transformReports([__dirname + '/resources/reports/XML_XUNIT.xml'], 0);
            await sleep(5000);

            expect(publisher.transform).not.toHaveBeenCalled();
            expect(publisher.xUnitReports.length).toBe(1);
        });

        describe('XML_COVERAGE', () => {
            const mergeCoberturaReportPath = `${__dirname}/parasoft-merged-cobertura.xml`;
            const agentTempDirectory = `${__dirname}/_temp`;

            beforeEach(() => {
                spyOn(tl, 'getVariable').and.callFake((param: string) => {
                    switch (param) {
                        case 'Agent.TempDirectory':
                            return agentTempDirectory
                    }
                });
                publisher.coverageReportService.MERGED_COBERTURA_REPORT_PATH = mergeCoberturaReportPath;
                publisher.defaultWorkingDirectory = 'E:/AzureAgent/_work/4/s';
                spyOn(publisher.coverageReportService, 'generateHtmlReport').and.callThrough();
            });

            afterEach(() => {
                if (fs.existsSync(mergeCoberturaReportPath)) {
                    fs.unlinkSync(mergeCoberturaReportPath);
                }
                if (fs.existsSync(agentTempDirectory)) {
                    fs.rmSync(agentTempDirectory, {recursive: true});
                }
            });

            let testTransformCoverageReport = async (parasoftCoverageReportsPath: string[], mergedCoberturaReportString: string) => {
                publisher.transformReports(parasoftCoverageReportsPath, 0);
                await waitForTransform(`${__dirname}/resources/reports/parsoft-merged-cobertura.xml`);

                let result = fs.readFileSync(mergeCoberturaReportPath, 'utf-8');
                expect(result).toEqual(mergedCoberturaReportString);
                expect(publisher.transform).toHaveBeenCalled();
                expect(publisher.coverageReportService.generateHtmlReport).toHaveBeenCalledWith(mergeCoberturaReportPath, path.join(agentTempDirectory, 'ParasoftFindings', 'CodeCoverageHtml'));
                expect(tl.uploadArtifact).toHaveBeenCalledWith('CoberturaContainer', mergeCoberturaReportPath, 'ParasoftCoverageLogs');
            }

            describe('only one parasoft coverage report', () => {

                afterEach(() => {
                    const filePathToDelete = `${__dirname}/resources/reports/XML_COVERAGE-xml-cobertura.xml`;
                    if (fs.existsSync(filePathToDelete)) {
                        fs.unlink(filePathToDelete, () => {});
                    }
                });

                describe('- report is generated in pipeline', () => {
                    describe('- transform with java', () => {
                        it('- error', async () => {
                            spyOn(tl, 'execSync').and.returnValue({code: 1, stdout: 'error', stderr: 'error', error: new Error('error')});
                            publisher.javaPath = `${__dirname}resources/toolRootPaths/java/bin/java.exe`;
                            publisher.transformReports([`${__dirname}/resources/reports/XML_COVERAGE.xml`], 0);
    
                            retryTimes = 2;
                            await waitForTransform();
                            expect(publisher.transform).toHaveBeenCalled();
                            expect(tl.execSync).toHaveBeenCalled();
                            expect(tl.warning).toHaveBeenCalledTimes(1);
                        });
    
                        it('- no error', async () => {
                            spyOn(tl, 'execSync').and.callThrough();
                            
                            // Need to set JAVA_HOME environment or comment this test if this test is failed.
                            publisher.javaPath = tl.resolve(process.env.JAVA_HOME, 'bin', os.platform() == 'win32' ? "java.exe" : "java");
                            const parasoftCoverageReportsPath = [`${__dirname}/resources/reports/XML_COVERAGE.xml`]
                            let expectedCoberturaReportString = fs.readFileSync(`${__dirname}/resources/reports/expect/XML_COVERAGE-java_version-cobertura.xml`, 'utf8');
                            await testTransformCoverageReport(parasoftCoverageReportsPath, expectedCoberturaReportString);
    
                            expect(tl.execSync).toHaveBeenCalled();
                            expect(tl.warning).not.toHaveBeenCalled();
                            expect(publisher.coberturaReports.length).toBe(1);
                        });
                    });
    
                    it('- transform with node by default', async () => {
                        publisher.javaPath = undefined;
                        const parasoftCoverageReportsPath = [`${__dirname}/resources/reports/XML_COVERAGE.xml`]
                        let expectedCoberturaReportString = fs.readFileSync(`${__dirname}/resources/reports/expect/XML_COVERAGE-node_version-cobertura.xml`, 'utf8');
                        await testTransformCoverageReport(parasoftCoverageReportsPath, expectedCoberturaReportString);
    
                        expect(publisher.coberturaReports.length).toBe(1);
                    });
                });
    
                it('- external report', async () => {
                    publisher.defaultWorkingDirectory = 'path:/not/math/with/uri/attribute/of/Loc/node';
                    const parasoftCoverageReportsPath = [`${__dirname}/resources/reports/XML_COVERAGE.xml`]
                    let expectedCoberturaReportString = fs.readFileSync(`${__dirname}/resources/reports/expect/XML_COVERAGE-cobertura(for external report).xml`, 'utf8');
                    await testTransformCoverageReport(parasoftCoverageReportsPath, expectedCoberturaReportString);
    
                    expect(publisher.coberturaReports.length).toBe(1);
                });
            });

            describe('multiple parasoft coverage reports', () => {

                afterEach(() => {
                    let filePathToDelete = `${__dirname}/resources/reports/XML_COVERAGE_part1-xml-cobertura.xml`;
                    if (fs.existsSync(filePathToDelete)) {
                        fs.unlink(filePathToDelete, () => {});
                    }
                    filePathToDelete = `${__dirname}/resources/reports/XML_COVERAGE_part2-xml-cobertura.xml`;
                    if (fs.existsSync(filePathToDelete)) {
                        fs.unlink(filePathToDelete, () => {});
                    }
                    filePathToDelete = `${__dirname}/resources/reports/XML_COVERAGE_part2_with_conflict-xml-cobertura.xml`;
                    if (fs.existsSync(filePathToDelete)) {
                        fs.unlink(filePathToDelete, () => {});
                    }
                });
                
                describe('- reports are only from current task', () => {
                    it('and without class conflict', async () => {
                        const parasoftCoverageReportsPath = [`${__dirname}/resources/reports/XML_COVERAGE_part1.xml`, `${__dirname}/resources/reports/XML_COVERAGE_part2.xml`]
                        let expectedCoberturaReportString = fs.readFileSync(`${__dirname}/resources/reports/expect/XML_COVERAGE_merged_part1&2.xml`, 'utf8');
                        await testTransformCoverageReport(parasoftCoverageReportsPath, expectedCoberturaReportString);
        
                        expect(publisher.coberturaReports.length).toBe(2);
                    });

                    it('but with class conflict', async () => {
                        const conflictParasoftReportPath = `${__dirname}/resources/reports/XML_COVERAGE_part2_with_conflict.xml`;
                        const conflictCoberturaReportPath = `${__dirname}/resources/reports/XML_COVERAGE_part2_with_conflict-xml-cobertura.xml`;
                        const parasoftCoverageReportsPath = [`${__dirname}/resources/reports/XML_COVERAGE_part1.xml`, conflictParasoftReportPath]
                        let expectedCoberturaReportString = fs.readFileSync(`${__dirname}/resources/reports/expect/XML_COVERAGE_merged_part1_without_part2.xml`, 'utf8');
                        await testTransformCoverageReport(parasoftCoverageReportsPath, expectedCoberturaReportString);
        
                        expect(publisher.coberturaReports.length).toBe(2);
                        expect(tl.warning).toHaveBeenCalledWith(`Coverage data in report '${conflictCoberturaReportPath}' was not merged due to an inconsistent set of lines reported for file 'src/main/java/com/parasoft/Demo.java'`);
                    });
                });
                

                it('- reports are from current task and previous task', async () => {
                    const parasoftFindingsTempFolder = `${agentTempDirectory}/ParasoftFindings`;
                    const mergedCoberturaReportFromArtifacts = `${parasoftFindingsTempFolder}/parasoft-merged-cobertura-from-artifact.xml`;
                    fs.mkdirSync(parasoftFindingsTempFolder, {recursive: true});
                    spyOn(publisher.coverageReportService.buildClient, 'getCoberturaReportsByBuildId').and.returnValue(
                        [{
                            name: "CoberturaContainer/parasoft-merged-cobertura.xml",
                            contentsPromise: Promise.resolve(fs.readFileSync(`${__dirname}/resources/reports/XML_COVERAGE_part1-cobertura.xml`))
                        }]);

                    const parasoftCoverageReportsPath = [`${__dirname}/resources/reports/XML_COVERAGE_part2.xml`]
                    let expectedCoberturaReportString = fs.readFileSync(`${__dirname}/resources/reports/expect/XML_COVERAGE_merged_part1&2.xml`, 'utf8');
                    await testTransformCoverageReport(parasoftCoverageReportsPath, expectedCoberturaReportString);
    
                    expect(publisher.coberturaReports.length).toBe(1);
                    expect(publisher.coverageReportService.buildClient.getCoberturaReportsByBuildId).toHaveBeenCalledTimes(1);
                    expect(fs.existsSync(mergedCoberturaReportFromArtifacts)).toBeTrue();
                });
            });
        });
    });

    describe('run()', () => {
        it('when no input file is matched', async () => {
            spyOn(tl, 'findMatch').and.returnValue([]);
            publisher = new ParaReportPublishService();
            spyOn(publisher, 'verifyDtpRuleDocsService');
            spyOn(publisher, 'transformReports');
            await publisher.run();

            expect(tl.warning).toHaveBeenCalledOnceWith('No test result files matching '+ publisher.inputReportFiles +' were found.');
            expect(tl.setResult).toHaveBeenCalledOnceWith(tl.TaskResult.Succeeded, '');
            expect(publisher.verifyDtpRuleDocsService).not.toHaveBeenCalled();
            expect(publisher.transformReports).not.toHaveBeenCalled();
        });

        describe('when matched to the input report file', () => {
            beforeEach(() => {
                spyOn(tl, 'findMatch').and.returnValue(['foobar']);
                publisher = new ParaReportPublishService();
                spyOn(publisher, 'transformReports');
            });

            it('and the dtp url exists', (done) => {
                spyOn(publisher, 'isNullOrWhitespace').and.returnValue(false);
                spyOn(publisher, 'verifyDtpRuleDocsService').and.returnValue(Promise.resolve());
                publisher.run();
                publisher.verifyDtpRuleDocsService().then(() =>{
                    expect(publisher.transformReports).toHaveBeenCalledOnceWith(publisher.matchingInputReportFiles, 0);
                    done();
                });
                expect(publisher.verifyDtpRuleDocsService).toHaveBeenCalled();
            });

            it('but the dtp url does not exist', async () => {
                spyOn(publisher, 'verifyDtpRuleDocsService');
                spyOn(publisher, 'isNullOrWhitespace').and.returnValue(true);
                await publisher.run();
                expect(publisher.verifyDtpRuleDocsService).not.toHaveBeenCalled();
                expect(publisher.transformReports).toHaveBeenCalledOnceWith(publisher.matchingInputReportFiles, 0);
            });

            it('error will be catched if promise reject', async () => {
                spyOn(publisher, 'isNullOrWhitespace').and.returnValue(true);
                publisher.transformReports.and.returnValue(Promise.reject());
                await publisher.run();
                expect(tl.error).toHaveBeenCalledOnceWith('Error. See log for details');
            });
        });
    });

    it('loadSettings(), when the local setting path exists', () => {
        const loadProperties = {};
        spyOn(tl, 'resolve').and.returnValue('E:/AzureAgent/_work/4/s/localsettings.properties');
        publisher = new ParaReportPublishService();
        spyOn(publisher, 'loadProperties').and.returnValue(loadProperties);
        expect(publisher.loadSettings('localsettings.properties')).toEqual(loadProperties);
    });

    describe('getDtpBaseUrl()',() => {
        beforeEach(() => {
            publisher = new ParaReportPublishService();
        });

        describe('when dtp url exists', () => {
            it('and is legal', () => {
                const settings = {
                    'dtp.url': 'https://dtp.parasoft.com',
                };
                expect(publisher.getDtpBaseUrl(settings)).toEqual(settings["dtp.url"] + '/');
            });

            it('but is illegal', () => {
                const settings = {
                    'dtp.url': '5448',
                };
                expect(publisher.getDtpBaseUrl(settings)).toEqual('');
                expect(tl.warning).toHaveBeenCalledOnceWith('Invalid dtp.url.');
            });
        });

        describe('When dtp server exists, dtp url does not exist', () => {
            it('and the port is legal', () => {
                const settings = {
                    'dtp.server': 'localhost',
                    'dtp.port': '8443',
                    'dtp.context.path': '/a'
                };
                expect(publisher.getDtpBaseUrl(settings)).toEqual('https://' + settings["dtp.server"] + ':' + settings["dtp.port"] + settings["dtp.context.path"] + '/');
            });

            it('but the port is illegal', () => {
                const settings = {
                    'dtp.server': 'localhost',
                    'dtp.port': '844111111'
                };
                expect(publisher.getDtpBaseUrl(settings)).toEqual('https://' + settings["dtp.server"] + '/');
                expect(tl.warning).toHaveBeenCalledOnceWith('Invalid dtp.port.');
            });

            it('but the dtp server is illegal', () => {
                const settings = {
                    'dtp.server': '@@@@',
                };
                expect(publisher.getDtpBaseUrl(settings)).toEqual('');
                expect(tl.warning).toHaveBeenCalledOnceWith('Invalid dtp.server.');
            });
        });

        it('when neither dtp server nor dtp url exist', () => {
            expect(publisher.getDtpBaseUrl({})).toEqual('');
            expect(tl.warning).toHaveBeenCalledOnceWith('dtp.url (since 10.6.1) or dtp.server is required in settings file.');
        });
    });

    describe('verifyDtpRuleDocsService()', () => {
        beforeEach(() => {
            publisher = new ParaReportPublishService();
        });

        it('when DTP rule docs service  is accessible', (done) => {
            spyOn(axios.default, 'get').and.returnValue(Promise.resolve());
            publisher.verifyDtpRuleDocsService();
            axios.default.get(publisher.dtpBaseUrl+ "grs/api/v1.0/rules/doc?rule=notExistingRule&analyzerId=notExistingAnalyzerId", {httpsAgent: publisher.httpsAgent}).then(() => {
                expect(publisher.isDtpRuleDocsServiceAvailable).toBeTrue();
                done();
            });
        });

        describe('when DTP rule docs service is not accessible', () => {
            let verifyDtpRuleDocsServiceSpec = (error: any, isDtpRuleDocsServiceAvailable: boolean, done: any, message?: string) => {
                spyOn(axios.default, 'get').and.returnValue(Promise.reject(error));
                publisher.verifyDtpRuleDocsService();
                axios.default.get(publisher.dtpBaseUrl+ "grs/api/v1.0/rules/doc?rule=notExistingRule&analyzerId=notExistingAnalyzerId", {httpsAgent: publisher.httpsAgent}).then(() => {
                    done();
                }).catch((err: any) => {
                    expect(publisher.isDtpRuleDocsServiceAvailable).toEqual(isDtpRuleDocsServiceAvailable);
                    expect(err).toEqual(error);
                    if (message) {
                        expect(tl.warning).toHaveBeenCalledWith(message);
                    }
                    done();
                });
            }
            it('and the status code is 404', (done) => {
                const error = {
                    response: {
                        data: {
                            status: 404
                        }
                    }
                };
                verifyDtpRuleDocsServiceSpec(error, true, done);
            });

            it('and the status code is 401', (done) => {
                const error = {
                    response: {
                        data: {
                            status: 401
                        }
                    }
                };
                const message = 'Unable to retrieve the documentation for rules from DTP. It is likely that the current DTP version is older than 2023.1 and is no longer supported.';
                verifyDtpRuleDocsServiceSpec(error, false, done, message);
            });

            it('and the status code is undefined', (done) => {
                const message = "Unable to connect to DTP and retrieve the documentation for rules using the provided settings (error code: " + undefined + "). " +
                    "Please make sure the values of 'dtp.*' in " + publisher.localSettingsPath + " are correct."
                verifyDtpRuleDocsServiceSpec(null, false, done, message);
            });
        });
    });

    describe('getRuleDoc(), when get rule documentation URL fails and returns', () => {
        const ruleId = 'CDD.DUPM';
        const analyzerId = 'com.parasoft.xtest.dupcode.parser';

        beforeEach(() => {
            publisher = new ParaReportPublishService();
        });

        it('two 404 errors', (done) => {
            const error = {
                status: 404
            };
            spyOn(publisher, 'doGetRuleDoc').and.returnValues(Promise.reject(error), Promise.reject(error));
            publisher.getRuleDoc(ruleId, analyzerId).then((res: any) =>{
                expect(res).toBeUndefined();
                expect(publisher.ruleDocUrlMap.get(ruleId)).toEqual('');
                done();
            });
        });

        it('an other error', (done) => {
            const error = {
                status: 500
            };
            spyOn(publisher, 'doGetRuleDoc').and.returnValue(Promise.reject(error));
            publisher.getRuleDoc(ruleId, analyzerId).then((res: any) =>{
                expect(res).toEqual(error);
                expect(publisher.ruleDocUrlMap.size).toEqual(0);
                done();
            });
        });

        it('one other error and one 404 error', (done) => {
            const error_1 = {
                status: 404
            };

            const error_2 = {
                status: 500
            };
            spyOn(publisher, 'doGetRuleDoc').and.returnValues(Promise.reject(error_1), Promise.reject(error_2));
            publisher.getRuleDoc(ruleId, analyzerId).then((res: any) =>{
                expect(res).toEqual(error_2);
                expect(publisher.ruleDocUrlMap.size).toEqual(0);
                done();
            });
        });
    });

    describe('doGetRuleDoc()', () => {
        beforeEach(() => {
            publisher = new ParaReportPublishService();
        });

        it('the rule doc was successfully obtained', (done) => {
            const apiVersion = 1.6;
            const ruleId = 'CDD.DUPM';
            const analyzerId = 'com.parasoft.xtest.dupcode.parser';
            const response = {
              data: {
                  docsUrl: 'https://dtp.parasoft.com/grs/api/v'+ apiVersion + '/rules/doc?rule=' + ruleId + '&analyzerId=' + analyzerId
              }
            };
            spyOn(axios.default, 'get').and.returnValue(Promise.resolve(response));
            publisher.doGetRuleDoc(ruleId, analyzerId, apiVersion).then((res: any) => {
                expect(res).toBeUndefined();
                expect(publisher.ruleDocUrlMap.get(ruleId)).toEqual(response.data.docsUrl);
                done();
            });
        });

        it('failed to get rule doc', (done) => {
            const apiVersion = 1.6;
            const ruleId = 'CDD.DUPM1';
            const analyzerId = 'com.parasoft.xtest.dupcode.parser1';
            const error = {
                response: {
                    data: {
                        status: 404
                    }
                }
            };
            spyOn(axios.default, 'get').and.returnValue(Promise.reject(error));
            publisher.doGetRuleDoc(ruleId, analyzerId, apiVersion).catch((err: any) => {
                expect(err).toEqual(error.response.data);
                expect(publisher.ruleDocUrlMap.size).toEqual(0)
                done();
            });
        });
    });

    describe('mapToAnalyzer(), when violation type is', () => {
        beforeEach(() => {
            publisher = new ParaReportPublishService();
        });

        it('DupViol', () => {
            expect(publisher.mapToAnalyzer('', 'DupViol')).toEqual('com.parasoft.xtest.cpp.analyzer.static.dupcode');
        });

        it('FlowViol', () => {
            expect(publisher.mapToAnalyzer('', 'FlowViol')).toEqual('com.parasoft.xtest.cpp.analyzer.static.flow');
        });

        it('MetViol', () => {
            expect(publisher.mapToAnalyzer('', 'MetViol')).toEqual('com.parasoft.xtest.cpp.analyzer.static.metrics');
        });

        it('others', () => {
            publisher.rulesInGlobalCategory.add('CDD.DUPM');
            expect(publisher.mapToAnalyzer('CDD.DUPM', 'others')).toEqual('com.parasoft.xtest.cpp.analyzer.static.global');
            publisher.rulesInGlobalCategory.clear();
        });
    });

    it('appendRuleDocUrls()', () => {
        publisher = new ParaReportPublishService();
        const rule = {
            id: 'CDD.DUPM',
            docsUrl: 'https://dtp.parasoft.com/grs/api/v1.6/rules/doc?rule=CDD.DUPM&analyzerId=com.parasoft.xtest.dupcode.parser'
        }
        publisher.ruleDocUrlMap.set(rule.id, rule.docsUrl);
        const sarifReport = '{"runs":[{"tool":{"driver":{"rules":[{"id":"'+ rule.id +'","helpUri":""}]}}}]}';
        const result = '{"runs":[{"tool":{"driver":{"rules":[{"id":"'+ rule.id +'","helpUri":"'+ rule.docsUrl +'"}]}}}]}';
        expect(publisher.appendRuleDocUrls(sarifReport)).toEqual(result);
        publisher.ruleDocUrlMap.clear();
    });

    describe('loadProperties()', () => {
        beforeEach(() => {
            publisher = new ParaReportPublishService();
        });

        it('when properties are successfully loaded', () => {
            const loadSettings = {
                'dtp.url': 'https://dtp.parasoft.com'
            };
            spyOn(fs, 'readFileSync').and.returnValue('parasoft.eula.accepted=true');
            spyOn(dp, 'parse').and.returnValue(loadSettings);
            expect(publisher.loadProperties('E:\\AzureAgent\\_work\\4\\s\\localsettings.properties')).toEqual(loadSettings);
        });

        it('failed to read settings file', () => {
            expect(publisher.loadProperties('')).toEqual(null);
            expect(tl.warning).toHaveBeenCalledOnceWith('Failed to read settings file.');
        });
    });

    describe('getJavaPath()', () => {
        beforeEach(() => {
            publisher = new ParaReportPublishService();
        });

        it('java from jtest installation', () => {
            const jtestRootPath = __dirname + '/resources/toolRootPaths/jtest';
            const result = publisher.getJavaPath(jtestRootPath);

            expect(result).toContain('jtest');
            expect(result).toContain('java');
            expect(fs.existsSync(tl.resolve(result))).toBeTruthy();
        });

        it('java from dottest installation', () => {
            const dottestRootPath = __dirname + '/resources/toolRootPaths/dottest';
            const result = publisher.getJavaPath(dottestRootPath);

            expect(result).toContain('dottest');
            expect(result).toContain('java');
            expect(fs.existsSync(tl.resolve(result))).toBeTruthy();
        });

        it('java from cpptest installation', () => {
            const cpptestRootPath = __dirname + '/resources/toolRootPaths/cpptest';
            const result = publisher.getJavaPath(cpptestRootPath);

            expect(result).toContain('cpptest');
            expect(result).toContain('java');
            expect(fs.existsSync(tl.resolve(result))).toBeTruthy();
        });

        it('java from java installation', () => {
            const javaRootPath = __dirname + '/resources/toolRootPaths/java';
            const result = publisher.getJavaPath(javaRootPath);

            expect(result).not.toContain('cpptest');
            expect(result).not.toContain('dottest');
            expect(result).not.toContain('jtest');
            expect(result).toContain('java');
            expect(fs.existsSync(tl.resolve(result))).toBeTruthy();
        });

        it('incorrect root path', () => {
            const javaRootPath = __dirname + '/resources/toolRootPaths/nojava';
            const result = publisher.getJavaPath(javaRootPath);

            expect(result).toBeUndefined();
        });
    });
});
