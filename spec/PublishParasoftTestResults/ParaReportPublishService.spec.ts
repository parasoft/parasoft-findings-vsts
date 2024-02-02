import * as tl from '../../PublishParasoftResults/node_modules/azure-pipelines-task-lib';
import * as azdev from '../../PublishParasoftResults/node_modules/azure-devops-node-api';
import * as fs from 'fs';
import * as os from 'os';
import * as dp from "../../PublishParasoftResults/node_modules/dot-properties";
import * as path from 'path';
import { ParaReportPublishService } from "../../PublishParasoftResults/ParaReportPublishService";
import { BuildResult } from '../../PublishParasoftResults/node_modules/azure-devops-node-api/interfaces/BuildInterfaces';
const axios = require('../../PublishParasoftResults/node_modules/axios/dist/node/axios.cjs');

let publisher: any;
let mockWebApi: any;
let mockGenerateUniqueFileNameFunction: any;

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
            spyOn(publisher, 'getSarifReportsOfReferenceBuild').and.returnValue([]);
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
            publisher.defaultWorkingDirectory = 'D:/RWorkspaces/project-workspace/CICD/para % bank';
            await publisher.transformReports([__dirname + '/resources/reports/SARIF.sarif'], 0);

            let expectedReport = fs.readFileSync(__dirname + '/resources/reports/expect/SARIF-sarif-pf-sast.sarif', 'utf8');
            let result = fs.readFileSync(__dirname + '/resources/reports/SARIF-sarif-pf-sast.sarif', 'utf-8');

            expect(result).toEqual(expectedReport);
            expect(publisher.transform).not.toHaveBeenCalled();
            expect(publisher.sarifReports.length).toBe(1);
            expect(tl.setVariable).toHaveBeenCalledTimes(2);

            fs.unlink(__dirname + '/resources/reports/SARIF-sarif-pf-sast.sarif', () => {});
        });

        it('XML_STATIC', async () => {
            mockGenerateUniqueFileNameFunction.and.returnValue(__dirname + '/resources/reports/XML_STATIC.xml');
            publisher.transformReports([__dirname + '/resources/reports/XML_STATIC.xml'], 0);
            await waitForTransform(__dirname + '/resources/reports/XML_STATIC-xml-pf-sast.sarif');

            let expectedReport = fs.readFileSync(__dirname + '/resources/reports/expect/XML_STATIC-xml-pf-sast.sarif', 'utf8');
            let result = fs.readFileSync(__dirname + '/resources/reports/XML_STATIC-xml-pf-sast.sarif', 'utf-8');

            expect(result).toEqual(expectedReport);
            expect(publisher.transform).toHaveBeenCalled();
            expect(publisher.sarifReports.length).toBe(1);

            fs.unlink(__dirname + '/resources/reports/XML_STATIC-xml-pf-sast.sarif', () => {});
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

        it('XML_TESTS', async () => {
            publisher.transformReports([__dirname + '/resources/reports/XML_TESTS.xml'], 0);
            await waitForTransform(__dirname + '/resources/reports/XML_TESTS-xml-junit.xml');

            let expectedReport = fs.readFileSync(__dirname + '/resources/reports/expect/XML_TESTS-xml-junit.xml', 'utf8');
            let result = fs.readFileSync(__dirname + '/resources/reports/XML_TESTS-xml-junit.xml', 'utf-8');

            expect(result).toEqual(expectedReport);
            expect(publisher.transform).toHaveBeenCalled();
            expect(publisher.xUnitReports.length).toBe(1);

            fs.unlink(__dirname + '/resources/reports/XML_TESTS-xml-junit.xml', () => {});
        });

        it('XML_STATIC_AND_TESTS', async () => {
            mockGenerateUniqueFileNameFunction.and.returnValue(__dirname + '/resources/reports/XML_STATIC_AND_TESTS.xml');
            publisher.transformReports([__dirname + '/resources/reports/XML_STATIC_AND_TESTS.xml'], 0);
            await waitForTransform(__dirname + '/resources/reports/XML_STATIC_AND_TESTS-xml-pf-sast.sarif');
            await waitForTransform(__dirname + '/resources/reports/XML_STATIC_AND_TESTS-xml-junit.xml');

            let expectedSarifReport = fs.readFileSync(__dirname + '/resources/reports/expect/XML_STATIC_AND_TESTS-xml-pf-sast.sarif', 'utf8');
            let sarifResult = fs.readFileSync(__dirname + '/resources/reports/XML_STATIC_AND_TESTS-xml-pf-sast.sarif', 'utf-8');
            let expectedJunitReport = fs.readFileSync(__dirname + '/resources/reports/expect/XML_STATIC_AND_TESTS-xml-junit.xml', 'utf8');
            let junitResult = fs.readFileSync(__dirname + '/resources/reports/XML_STATIC_AND_TESTS-xml-junit.xml', 'utf-8');

            expect(sarifResult).toEqual(expectedSarifReport);
            expect(junitResult).toEqual(expectedJunitReport);
            expect(publisher.transform).toHaveBeenCalled();
            expect(publisher.sarifReports.length).toBe(1);
            expect(publisher.xUnitReports.length).toBe(1);
            fs.unlink(__dirname + '/resources/reports/XML_STATIC_AND_TESTS-xml-pf-sast.sarif', () => {});
            fs.unlink(__dirname + '/resources/reports/XML_STATIC_AND_TESTS-xml-junit.xml', () => {});
        });

        it('XML_SOATEST', async () => {
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

        xdescribe('XML_COVERAGE', () => {

            beforeEach(() => {
                spyOn(path, 'join').and.returnValue('E:\\AzureAgent\\_work\\_temp\\CodeCoverageHtml');
                spyOn(publisher, 'generateHtmlReport').and.returnValue(false);
            });

            let testTransformCoverageReport = async (expectedReport: string) => {
                publisher.transformReports([__dirname + '/resources/reports/XML_COVERAGE.xml'], 0);
                await waitForTransform(__dirname + '/resources/reports/XML_COVERAGE-xml-cobertura.xml');

                let result = fs.readFileSync(__dirname + '/resources/reports/XML_COVERAGE-xml-cobertura.xml', 'utf-8');

                expect(result).toEqual(expectedReport);
                expect(publisher.transform).toHaveBeenCalled();
                expect(publisher.coberturaReports.length).toBe(1);

                fs.unlink(__dirname + '/resources/reports/XML_COVERAGE-xml-cobertura.xml', () => {});
            }

            describe('- report is generated in pipeline', () => {
                describe('- transform with java', () => {
                    it('- error', async () => {
                        spyOn(tl, 'execSync').and.returnValue({code: 1, stdout: 'error', stderr: 'error', error: new Error('error')});
                        publisher.defaultWorkingDirectory = 'E:/AzureAgent/_work/4/s';
                        publisher.javaPath = tl.resolve(__dirname, 'resources/toolRootPaths/java/bin/java.exe');
                        publisher.transformReports([__dirname + '/resources/reports/XML_COVERAGE.xml'], 0);

                        retryTimes = 2;
                        await waitForTransform();
                        expect(publisher.transform).toHaveBeenCalled();
                        expect(tl.execSync).toHaveBeenCalled();
                        expect(tl.warning).toHaveBeenCalledTimes(1);
                    });

                    it('- no error', async () => {
                        spyOn(tl, 'execSync').and.callThrough();
                        publisher.defaultWorkingDirectory = 'E:/AzureAgent/_work/4/s';
                        // Need to set JAVA_HOME environment or comment this test if this test is failed.
                        publisher.javaPath = tl.resolve(process.env.JAVA_HOME, 'bin', os.platform() == 'win32' ? "java.exe" : "java");
                        let expectedReport = fs.readFileSync(__dirname + '/resources/reports/expect/XML_COVERAGE-java_version-cobertura.xml', 'utf8');
                        await testTransformCoverageReport(expectedReport);
                        expect(tl.execSync).toHaveBeenCalled();
                        expect(tl.warning).not.toHaveBeenCalled();
                        expect(tl.uploadArtifact).toHaveBeenCalledWith('CoberturaContainer', __dirname + '/resources/reports/XML_COVERAGE-xml-cobertura.xml', 'ParasoftCoverageLogs');
                    });
                });

                it('- transform with node by default', async () => {
                    publisher.defaultWorkingDirectory = 'E:/AzureAgent/_work/4/s';
                    publisher.javaPath = undefined;
                    let expectedReport = fs.readFileSync(__dirname + '/resources/reports/expect/XML_COVERAGE-node_version-cobertura.xml', 'utf8');
                    await testTransformCoverageReport(expectedReport);
                    expect(tl.uploadArtifact).toHaveBeenCalledWith('CoberturaContainer', __dirname + '/resources/reports/XML_COVERAGE-xml-cobertura.xml', 'ParasoftCoverageLogs');
                });
            });

            it('- external report', async () => {
                publisher.defaultWorkingDirectory = 'path:/not/math/with/uri/attribute/of/Loc/node';
                let expectedReport = fs.readFileSync(__dirname + '/resources/reports/expect/XML_COVERAGE-cobertura(for external report).xml', 'utf8');
                await testTransformCoverageReport(expectedReport);
                expect(tl.uploadArtifact).toHaveBeenCalledWith('CoberturaContainer', __dirname + '/resources/reports/XML_COVERAGE-xml-cobertura.xml', 'ParasoftCoverageLogs');
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

    describe('getSarifReportsOfReferenceBuild()', () => {
        beforeEach(() => {
            publisher = new ParaReportPublishService();
            publisher.definitionId = 12;
            spyOn(publisher, 'getSarifReportOfPipeline');
            spyOn(publisher.buildClient, 'getPipelinesByName');
        });

        it('when the reference pipeline is undefined', async () => {
            publisher.referenceBuildResult.referencePipelineInput = undefined;
            publisher.pipelineName = 'current-pipeline';
            const warningMessage = 'Any warning message(debug message here) when getting builds for a specific pipeline';
            const referenceBuildInfo: any = {
                fileEntries: [],
                staticAnalysis: {
                    pipelineName: publisher.pipelineName,
                    buildId: undefined,
                    buildNumber: undefined,
                    warningMessage: warningMessage
                },
                isDebugMessage: true
            };
            publisher.getSarifReportOfPipeline.and.returnValue(referenceBuildInfo);

            expect(await publisher.getSarifReportsOfReferenceBuild()).toEqual([]);
            expect(publisher.getSarifReportOfPipeline).toHaveBeenCalledWith(publisher.definitionId, publisher.pipelineName);
            expect(tl.debug).toHaveBeenCalledWith(`${warningMessage} - all issues will be treated as new`);
            expect(publisher.referenceBuildResult.staticAnalysis.warningMessage).toEqual(`${warningMessage} - all issues were treated as new`);
        });

        describe('when the reference pipeline is defined', () => {
            beforeEach(() => {
                publisher.referenceBuildResult.referencePipelineInput = 'reference-pipeline';
                publisher.pipelineName = 'specific-pipeline';
            });

            it('- the reference pipeline is valid', async () => {
                const specificPipelines: any[] = [{
                    id: 1,
                    name: 'reference-pipeline'
                }];
                const referenceBuildInfo: any = {
                    fileEntries: [],
                    staticAnalysis: {
                        pipelineName: publisher.referenceBuildResult.referencePipelineInput,
                        buildId: 20,
                        buildNumber: 20,
                        warningMessage: undefined
                    },
                    isDebugMessage: false
                };
                publisher.buildClient.getPipelinesByName.and.returnValue(specificPipelines);
                publisher.getSarifReportOfPipeline.and.returnValue(referenceBuildInfo);

                expect(await publisher.getSarifReportsOfReferenceBuild()).toEqual([]);
                expect(publisher.buildClient.getPipelinesByName).toHaveBeenCalledWith(publisher.referenceBuildResult.referencePipelineInput);
                expect(publisher.getSarifReportOfPipeline).toHaveBeenCalledWith(1, publisher.referenceBuildResult.referencePipelineInput);
                expect(publisher.referenceBuildResult.staticAnalysis).toEqual(referenceBuildInfo.staticAnalysis);
            });

            it('- the reference pipeline is not unique', async () => {
                const specificPipelines: any[] = [{
                    id: 1,
                    name: 'reference-pipeline'
                }, {
                    id: 2,
                    name: 'reference-pipeline'
                }];
                publisher.buildClient.getPipelinesByName.and.returnValue(specificPipelines);
                const warningMessage = `The specified reference pipeline '${publisher.referenceBuildResult.referencePipelineInput}' is not unique`;

                expect(await publisher.getSarifReportsOfReferenceBuild()).toEqual([]);
                expect(tl.warning).toHaveBeenCalledWith(`${warningMessage} - all issues will be treated as new`);
                expect(publisher.referenceBuildResult.staticAnalysis).toEqual({
                    pipelineName: undefined,
                    buildId: undefined,
                    buildNumber: undefined,
                    warningMessage: `${warningMessage} - all issues were treated as new`
                });
            });

            it('- the reference pipeline could not be found', async () => {
                const specificPipelines: any[] = [];
                publisher.buildClient.getPipelinesByName.and.returnValue(specificPipelines);
                const warningMessage = `The specified reference pipeline '${publisher.referenceBuildResult.referencePipelineInput}' could not be found`;

                expect(await publisher.getSarifReportsOfReferenceBuild()).toEqual([]);
                expect(tl.warning).toHaveBeenCalledWith(`${warningMessage} - all issues will be treated as new`);
                expect(publisher.referenceBuildResult.staticAnalysis).toEqual({
                    pipelineName: undefined,
                    buildId: undefined,
                    buildNumber: undefined,
                    warningMessage: `${warningMessage} - all issues were treated as new`
                });
            });
        });
    });

    describe('getSarifReportOfPipeline()', () => {
        const builds: any[] = [{
            id: 1,
            buildNumber: '20',
            result: BuildResult.Succeeded
        }, {
            id: 2,
            buildNumber: '21',
            result: BuildResult.PartiallySucceeded
        }, {
            id: 3,
            buildNumber: '22',
            result: BuildResult.Failed
        }, {
            id: 4,
            buildNumber: '23',
            result: BuildResult.Succeeded
        }, {
            id: 5,
            buildNumber: '23',
            result: BuildResult.Succeeded
        }];

        beforeEach(() => {
            publisher = new ParaReportPublishService();
            publisher.pipelineName = 'default-pipeline';
            spyOn(publisher.buildClient, 'getBuildsOfPipelineById').and.returnValue(builds);
        });

        describe('when the reference build is undefined', () => {
            beforeEach(() => {
                publisher.referenceBuildResult.referenceBuildInput = undefined;
                publisher.pipelineName = 'default-pipeline';
            });

            it('- has available default report', async () => {
                spyOn(publisher.buildClient, 'getSarifArtifactOfBuildById').and.returnValue({id: 1, name: 'CodeAnalysisLogs'});
                const reports = ['path/to/sarif/report'];
                spyOn(publisher.buildClient, 'getSarifReportsOfArtifact').and.returnValue(reports);
                const expectedReferenceBuildInfo: any = {
                    fileEntries: reports,
                    staticAnalysis: {
                        pipelineName: publisher.pipelineName,
                        buildId: 1,
                        buildNumber: '20',
                        warningMessage: undefined
                    },
                    isDebugMessage: false
                };
                const result = await publisher.getSarifReportOfPipeline(1, publisher.pipelineName);
                expect(result).toEqual(expectedReferenceBuildInfo);
            });

            it('- no parasoft results in default report', async () => {
                spyOn(publisher.buildClient, 'getSarifArtifactOfBuildById').and.returnValue({id: 1, name: 'CodeAnalysisLogs'});
                spyOn(publisher.buildClient, 'getSarifReportsOfArtifact').and.returnValue([]);
                const warningMessage = `No Parasoft static analysis results were found in any of the previous successful builds in pipeline '${publisher.pipelineName}'`;
                const result = await publisher.getSarifReportOfPipeline(1, publisher.pipelineName);
                expect(result.staticAnalysis.warningMessage).toEqual(warningMessage);
                expect(result.isDebugMessage).toBeFalsy();
            });

            it('- no previous build is found', async () => {
                let tempBuilds: any[] = [{
                    id: 1,
                    buildNumber: '20',
                    result: BuildResult.Succeeded
                }];
                publisher.buildClient.getBuildsOfPipelineById.and.callFake(() => {
                    return tempBuilds; // The temporary value or behavior
                });
                publisher.buildId = 1;
                const warningMessage = `No previous build was found in pipeline '${publisher.pipelineName}'`;
                const result = await publisher.getSarifReportOfPipeline(1, publisher.pipelineName);
                expect(result.staticAnalysis.warningMessage).toEqual(warningMessage);
                expect(result.isDebugMessage).toBeTruthy();
                // Revert back to the original value or behavior
                publisher.buildClient.getBuildsOfPipelineById.and.returnValue(builds);
            });

            it('- no successful build', async () => {
                let tempBuilds: any[] = [{
                    id: 2,
                    buildNumber: '21',
                    result: BuildResult.PartiallySucceeded
                }, {
                    id: 3,
                    buildNumber: '22',
                    result: BuildResult.Failed
                }];
                publisher.buildClient.getBuildsOfPipelineById.and.callFake(() => {
                    return tempBuilds; // The temporary value or behavior
                });
                const warningMessage = `No successful build was found in pipeline '${publisher.pipelineName}'`;
                const result = await publisher.getSarifReportOfPipeline(1, publisher.pipelineName);
                expect(result.staticAnalysis.warningMessage).toEqual(warningMessage);
                expect(result.isDebugMessage).toBeFalsy();
                // Revert back to the original value or behavior
                publisher.buildClient.getBuildsOfPipelineById.and.returnValue(builds);
            });
        });

        describe('when the reference build is set', () => {
            beforeEach(() => {
                spyOn(publisher.buildClient, 'getSarifArtifactOfBuildById');
                publisher.referenceBuildResult.referencePipelineInput = 'reference-pipeline';
            });

            it('- exists in current pipeline but is not unique', async () => {
                publisher.referenceBuildResult.referenceBuildInput = 23;
                const warningMessage = `The specified reference build '${publisher.referenceBuildResult.referencePipelineInput}#${publisher.referenceBuildResult.referenceBuildInput}' is not unique`;

                const result = await publisher.getSarifReportOfPipeline(1, publisher.referenceBuildResult.referencePipelineInput);
                expect(result.staticAnalysis.warningMessage).toEqual(warningMessage);
                expect(result.isDebugMessage).toBeFalsy();
            });

            it('- does not exist in current pipeline', async () => {
                publisher.referenceBuildResult.referenceBuildInput = 32;
                const warningMessage = `The specified reference build '${publisher.referenceBuildResult.referencePipelineInput}#${publisher.referenceBuildResult.referenceBuildInput}' could not be found`;

                const result = await publisher.getSarifReportOfPipeline(1, publisher.referenceBuildResult.referencePipelineInput);
                expect(result.staticAnalysis.warningMessage).toEqual(warningMessage);
                expect(result.isDebugMessage).toBeFalsy();
            });

            it('- exists in current pipeline and is neither succeed nor partially succeed', async () => {
                publisher.referenceBuildResult.referenceBuildInput = 22;
                const warningMessage = `The specified reference build '${publisher.referenceBuildResult.referencePipelineInput}#${publisher.referenceBuildResult.referenceBuildInput}' could not be used. Only successful or unstable builds are valid references`;

                const result = await publisher.getSarifReportOfPipeline(1, publisher.referenceBuildResult.referencePipelineInput);
                expect(result.staticAnalysis.warningMessage).toEqual(warningMessage);
                expect(result.isDebugMessage).toBeFalsy();
            });

            describe('- exists in current pipeline and is partially succeed with no static analysis results', () => {
                beforeEach(() => {
                    publisher.referenceBuildResult.referenceBuildInput = '21';
                });

                it('- artifact is undefined', async () => {
                    const artifact = undefined;
                    publisher.buildClient.getSarifArtifactOfBuildById.and.returnValue(artifact);
                    const warningMessage = `No Parasoft static analysis results were found in the specified reference build: '${publisher.referenceBuildResult.referencePipelineInput}#${publisher.referenceBuildResult.referenceBuildInput}'`;

                    const result = await publisher.getSarifReportOfPipeline(1, publisher.referenceBuildResult.referencePipelineInput);
                    expect(result.staticAnalysis.warningMessage).toEqual(warningMessage);
                    expect(result.isDebugMessage).toBeFalsy();
                 });

                it('- artifact is not undefined', async () => {
                    const artifact = {
                        id: 1,
                        name: 'CodeAnalysisLogs'
                    };
                    publisher.buildClient.getSarifArtifactOfBuildById.and.returnValue(artifact);
                    const mockFileEntries: any[] = [];
                    spyOn(publisher.buildClient, 'getSarifReportsOfArtifact').and.returnValue(mockFileEntries);
                    const warningMessage = `No Parasoft static analysis results were found in the specified reference build: '${publisher.referenceBuildResult.referencePipelineInput}#${publisher.referenceBuildResult.referenceBuildInput}'`;

                    const result = await publisher.getSarifReportOfPipeline(1, publisher.referenceBuildResult.referencePipelineInput);
                    expect(result.staticAnalysis.warningMessage).toEqual(warningMessage);
                    expect(result.isDebugMessage).toBeFalsy();
                });
            });

            it('- exists in current pipeline and is succeed with static analysis results', async () => {
                publisher.referenceBuildResult.referenceBuildInput = 20;
                const artifact = {
                    id: 1,
                    name: 'CodeAnalysisLogs'
                };
                publisher.buildClient.getSarifArtifactOfBuildById.and.returnValue(artifact);
                const sarifContentString = '{"runs":[{"results":[{"ruleId":"1","level":"warning","partialFingerprints":{"unbViolId":95f6cbd1-cbe0-597a-8b6f-11f4da185fec}}]}]}';
                const expectedResult: any[] = [{
                    name: "SarifContainer/report-xml-sast.sarif",
                    contentsPromise: Promise.resolve(sarifContentString)
                }];
                spyOn(publisher.buildClient, 'getSarifReportsOfArtifact').and.returnValue(expectedResult);
                const expectedReferenceBuildInfo: any = {
                    fileEntries: expectedResult,
                    staticAnalysis: {
                        pipelineName: publisher.referenceBuildResult.referencePipelineInput,
                        buildId: 1,
                        buildNumber: publisher.referenceBuildResult.referenceBuildInput,
                        warningMessage: undefined
                    },
                    isDebugMessage: false
                };

                const result = await publisher.getSarifReportOfPipeline(1, publisher.referenceBuildResult.referencePipelineInput);
                expect(result).toEqual(expectedReferenceBuildInfo);
            });
        });
    });

    describe('appendBaselineState()', () => {
        let testAppendBaselineState: any;
        let testUnbViolId: string;

        beforeEach(() => {
            publisher = new ParaReportPublishService();
            testUnbViolId = "95f6cbd1-cbe0-597a-8b6f-11f4da185fec";

            testAppendBaselineState = async (baselineState: string) => {
                const currentSarifContentJson: any = {"runs":[{"results":[{"ruleId":"1","level":"warning","partialFingerprints":{"unbViolId":testUnbViolId}}]}]};
                const expectedResult = {"runs":[{"results":[{"ruleId":"1","level":"warning","partialFingerprints":{"unbViolId":testUnbViolId},"baselineState":baselineState}]}]};

                expect(await publisher.appendBaselineState(currentSarifContentJson, undefined)).toEqual(expectedResult);
            }
        });

        it('when unbViolId exists in the reference SARIF report, the baseline state is set as unchanged', async () => {
            spyOn(publisher, 'getUnbViolIdsFromReferenceSarifReport').and.returnValue([testUnbViolId]);
            await testAppendBaselineState("unchanged"); 
        });

        it('when unbViolId does not exist in the reference SARIF report，the baseline state is set as new', async () => {
            spyOn(publisher, 'getUnbViolIdsFromReferenceSarifReport').and.returnValue([]);
            await testAppendBaselineState("new"); 
        });
    });

    describe('getUnbViolIdsFromReferenceSarifReport()', () => {
        beforeEach(() => {
            publisher = new ParaReportPublishService();
        });

        it('when reference SARIF report is undefined', async () => {
            expect(await publisher.getUnbViolIdsFromReferenceSarifReport(undefined)).toEqual([]);
        });

        it('when unbViolId exists in the reference SARIF report', async () => {
            const referenceSarifContentPromise: Promise<string> = Promise.resolve(`{"runs":[{"results":[{"ruleId":"1","level":"warning","partialFingerprints":{"unbViolId":"95f6cbd1-cbe0-597a-8b6f-11f4da185fec"}}]}]}`);
            const referenceSarifReport = {
                name: "name",
                artifactName: "artifactName",
                filePath: "filePath",
                buildId: 1,
                contentsPromise: referenceSarifContentPromise
            };

            expect(await publisher.getUnbViolIdsFromReferenceSarifReport(referenceSarifReport)).toEqual(["95f6cbd1-cbe0-597a-8b6f-11f4da185fec"]);
        });
    });
});
