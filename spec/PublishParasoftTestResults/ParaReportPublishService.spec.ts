import * as tl from '../../PublishParasoftTestResults/node_modules/azure-pipelines-task-lib';
import * as fs from 'fs';
import * as axios from '../../PublishParasoftTestResults/node_modules/axios';
import * as dp from "../../PublishParasoftTestResults/node_modules/dot-properties";
import * as path from 'path';
import {ParaReportPublishService} from "../../PublishParasoftTestResults/ParaReportPublishService";

let publisher: any;

describe("Parasoft findings Azure", () => {
    beforeEach(() => {
        spyOn(tl, 'getDelimitedInput').and.returnValue(['foobar']);
        spyOn(tl, 'getInput').and.returnValue('foobar');
        spyOn(tl, 'getBoolInput').and.returnValue(false);
        spyOn(tl, 'debug');
        spyOn(tl, 'setResult');
        spyOn(tl, 'warning');
        spyOn(tl, 'getPathInput').and.returnValue(undefined);
    });

    describe('transformReports() - transform report and input report type is', () => {
        let retryTimes: number;

        async function sleep(ms: number) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        async function waitForTransform(filePath: string) {
            for (let i = 0; i < retryTimes; i++) {
                if (fs.existsSync(filePath)){
                    break;
                }
                await sleep(1000);
            }
        }

        beforeEach(() => {
            publisher = new ParaReportPublishService();
            spyOn(publisher, 'transform').and.callThrough();

            jasmine.DEFAULT_TIMEOUT_INTERVAL = 200000;
            retryTimes = 20;

            expect(publisher.sarifReports.length).toBe(0);
            expect(publisher.xUnitReports.length).toBe(0);
            expect(publisher.coberturaReports.length).toBe(0);
            expect(publisher.transform).not.toHaveBeenCalled();
        });

        it('SARIF', () => {
            publisher.transformReports([__dirname + '/resources/expect/SARIF.sarif'], 0);

            expect(publisher.transform).not.toHaveBeenCalled();
            expect(publisher.sarifReports.length).toBe(1);
        });

        it('XML_STATIC', async () => {
            publisher.transformReports([__dirname + '/resources/XML_STATIC.xml'], 0);
            await waitForTransform(__dirname + '/resources/XML_STATIC.xml-sast.sarif');

            let expectedReport = fs.readFileSync(__dirname + '/resources/expect/XML_STATIC.xml-sast.sarif', 'utf8');
            let result = fs.readFileSync(__dirname + '/resources/XML_STATIC.xml-sast.sarif', 'utf-8');

            expect(result).toEqual(expectedReport);
            expect(publisher.transform).toHaveBeenCalled();
            expect(publisher.sarifReports.length).toBe(1);

            fs.unlink(__dirname + '/resources/XML_STATIC.xml-sast.sarif', () => {});
        });

        it('XML_TESTS', async () => {
            publisher.transformReports([__dirname + '/resources/XML_TESTS.xml'], 0);
            await waitForTransform(__dirname + '/resources/XML_TESTS.xml-junit.xml');

            let expectedReport = fs.readFileSync(__dirname + '/resources/expect/XML_TESTS.xml-junit.xml', 'utf8');
            let result = fs.readFileSync(__dirname + '/resources/XML_TESTS.xml-junit.xml', 'utf-8');

            expect(result).toEqual(expectedReport);
            expect(publisher.transform).toHaveBeenCalled();
            expect(publisher.xUnitReports.length).toBe(1);

            fs.unlink(__dirname + '/resources/XML_TESTS.xml-junit.xml', () => {});
        });

        it('XML_STATIC_AND_TESTS', async () => {
            publisher.transformReports([__dirname + '/resources/XML_STATIC_AND_TESTS.xml'], 0);
            await waitForTransform(__dirname + '/resources/XML_STATIC_AND_TESTS.xml-sast.sarif');
            await waitForTransform(__dirname + '/resources/XML_STATIC_AND_TESTS.xml-junit.xml');

            let expectedSarifReport = fs.readFileSync(__dirname + '/resources/expect/XML_STATIC_AND_TESTS.xml-sast.sarif', 'utf8');
            let sarifResult = fs.readFileSync(__dirname + '/resources/XML_STATIC_AND_TESTS.xml-sast.sarif', 'utf-8');
            let expectedJunitReport = fs.readFileSync(__dirname + '/resources/expect/XML_STATIC_AND_TESTS.xml-junit.xml', 'utf8');
            let junitResult = fs.readFileSync(__dirname + '/resources/XML_STATIC_AND_TESTS.xml-junit.xml', 'utf-8');

            expect(sarifResult).toEqual(expectedSarifReport);
            expect(junitResult).toEqual(expectedJunitReport);
            expect(publisher.transform).toHaveBeenCalled();
            expect(publisher.sarifReports.length).toBe(1);
            expect(publisher.xUnitReports.length).toBe(1);
            fs.unlink(__dirname + '/resources/XML_STATIC_AND_TESTS.xml-sast.sarif', () => {});
            fs.unlink(__dirname + '/resources/XML_STATIC_AND_TESTS.xml-junit.xml', () => {});
        });

        it('XML_SOATEST', async () => {
            publisher.transformReports([__dirname + '/resources/XML_SOATEST.xml'], 0);
            await waitForTransform(__dirname + '/resources/XML_SOATEST.xml-junit.xml');

            let expectedReport = fs.readFileSync(__dirname + '/resources/expect/XML_SOATEST.xml-junit.xml', 'utf8');
            let result = fs.readFileSync(__dirname + '/resources/XML_SOATEST.xml-junit.xml', 'utf-8');

            expect(result).toEqual(expectedReport);
            expect(publisher.transform).toHaveBeenCalled();
            expect(publisher.xUnitReports.length).toBe(1);
            fs.unlink(__dirname + '/resources/XML_SOATEST.xml-junit.xml', () => {});
        });

        it('XML_STATIC_AND_SOATEST', async () => {
            publisher.transformReports([__dirname + '/resources/XML_STATIC_AND_SOATEST.xml'], 0);
            await waitForTransform(__dirname + '/resources/XML_STATIC_AND_SOATEST.xml-sast.sarif');

            let expectedSarifReport = fs.readFileSync(__dirname + '/resources/expect/XML_STATIC_AND_SOATEST.xml-sast.sarif', 'utf8');
            let sarifResult = fs.readFileSync(__dirname + '/resources/XML_STATIC_AND_SOATEST.xml-sast.sarif', 'utf-8');
            let expectedJunitReport = fs.readFileSync(__dirname + '/resources/expect/XML_STATIC_AND_SOATEST.xml-junit.xml', 'utf8');
            let junitResult = fs.readFileSync(__dirname + '/resources/XML_STATIC_AND_SOATEST.xml-junit.xml', 'utf-8');

            expect(sarifResult).toEqual(expectedSarifReport);
            expect(junitResult).toEqual(expectedJunitReport);
            expect(publisher.transform).toHaveBeenCalled();
            expect(publisher.sarifReports.length).toBe(1);
            expect(publisher.xUnitReports.length).toBe(1);
            fs.unlink(__dirname + '/resources/XML_STATIC_AND_SOATEST.xml-sast.sarif', () => {});
            fs.unlink(__dirname + '/resources/XML_STATIC_AND_SOATEST.xml-junit.xml', () => {});
        });

        it('XML_XUNIT', async () => {
            publisher.transformReports([__dirname + '/resources/XML_XUNIT.xml'], 0);
            await sleep(5000);

            expect(publisher.transform).not.toHaveBeenCalled();
            expect(publisher.xUnitReports.length).toBe(1);
        });

        it('XML_COVERAGE', async () => {
            spyOn(path, 'join').and.returnValue('E:\\AzureAgent\\_work\\_temp\\CodeCoverageHtml');
            spyOn(publisher, 'generateHtmlReport').and.returnValue(false);
            publisher.transformReports([__dirname + '/resources/XML_COVERAGE.xml'], 0);
            await waitForTransform(__dirname + '/resources/XML_COVERAGE.xml-cobertura.xml');

            let expectedReport = fs.readFileSync(__dirname + '/resources/expect/XML_COVERAGE.xml-cobertura.xml', 'utf8');
            let result = fs.readFileSync(__dirname + '/resources/XML_COVERAGE.xml-cobertura.xml', 'utf-8');

            expect(result).toEqual(expectedReport);
            expect(publisher.transform).toHaveBeenCalled();
            expect(publisher.coberturaReports.length).toBe(1);

            fs.unlink(__dirname + '/resources/XML_COVERAGE.xml-cobertura.xml', () => {});
        });
    });

    describe('run()', () => {
        it('when no input file is matched', () => {
            spyOn(tl, 'findMatch').and.returnValue([]);
            publisher = new ParaReportPublishService();
            spyOn(publisher, 'verifyDtpRuleDocsService');
            spyOn(publisher, 'transformReports');
            publisher.run();

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

            it('and the dtp url exists',  (done) => {
                spyOn(publisher, 'isNullOrWhitespace').and.returnValue(false);
                spyOn(publisher, 'verifyDtpRuleDocsService').and.returnValue(Promise.resolve());
                publisher.run();
                publisher.verifyDtpRuleDocsService().then(() =>{
                    expect(publisher.transformReports).toHaveBeenCalledOnceWith(publisher.matchingInputReportFiles, 0);
                    done();
                });
                expect(publisher.verifyDtpRuleDocsService).toHaveBeenCalled();
            });

            it('but the dtp url does not exist', () => {
                spyOn(publisher, 'verifyDtpRuleDocsService');
                spyOn(publisher, 'isNullOrWhitespace').and.returnValue(true);
                publisher.run();
                expect(publisher.verifyDtpRuleDocsService).not.toHaveBeenCalled();
                expect(publisher.transformReports).toHaveBeenCalledOnceWith(publisher.matchingInputReportFiles, 0);
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

    describe('hasCredentials()', () => {
        beforeEach(() =>{
            publisher = new ParaReportPublishService();
        });

        it('when username does not exist', () => {
            expect(publisher.hasCredentials(null, 'admin')).toBeFalse();
        })

        it('when username exists, but password does not exist', () => {
            expect(publisher.hasCredentials('admin', null)).toBeFalse();
        })

        it('when both username and password exist', () => {
            expect(publisher.hasCredentials('admin', 'admin')).toBeTrue();
        })
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
                }).catch((err) => {
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
                const message = 'Unable to retrieve the documentation for the rules from DTP. It is highly possible that the current version of DTP is older than the 2023.1 which is not supported.';
                verifyDtpRuleDocsServiceSpec(error, false, done, message);
            });

            it('and the status code is undefined', (done) => {
                const message = "Unable to connect to DTP and retrieve the documentation for rules using the provided settings (error code: " + undefined + "). " +
                    "Please make sure the values for 'dtp.*' in " + publisher.localSettingsPath + " are correct."
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

    describe('checkRunFailures(), When the report are', () => {
        beforeEach(() => {
            publisher = new ParaReportPublishService();
        });

        it('unit reports', () => {
            spyOn(publisher, 'checkFailures');
            publisher.checkRunFailures(['unit.xml'], []);
        });

        it('sarif reports', () => {
            spyOn(publisher, 'checkStaticAnalysisViolations');
            publisher.checkRunFailures([], ['static.xml']);
        });
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

    describe('checkStaticAnalysisViolations()', () => {
        beforeEach(() => {
            publisher = new ParaReportPublishService();
        });

        it('build succeed', () => {
            const sarifReports = ['static_1.xml', 'static_2.xml'];
            const sarifReport = '{"runs": [{"results": [null]}]}';
            spyOn(fs, 'readFileSync').and.returnValue(sarifReport);
            publisher.checkStaticAnalysisViolations(sarifReports, 0);
            expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.Succeeded, 'Build succeed. Test failures and/or static analysis violation were not found.');
        });

        it('failed build', () => {
            const sarifReports = ['static_1.xml'];
            const sarifReport = '{"runs": [{"results": [{}]}]}';
            spyOn(fs, 'readFileSync').and.returnValue(sarifReport);
            publisher.checkStaticAnalysisViolations(sarifReports, 0);
            expect(tl.setResult).toHaveBeenCalledWith(tl.TaskResult.Failed, 'Failed build due to test failures and/or static analysis violations.');
        });
    });

    it('isNone()', () => {
        publisher = new ParaReportPublishService();
        const node = {
            attributes: {
                id: 1,
                name: "Node 1"
            }
        }
        expect(publisher.isNone(node, 'name')).toBeFalse();
    });
});