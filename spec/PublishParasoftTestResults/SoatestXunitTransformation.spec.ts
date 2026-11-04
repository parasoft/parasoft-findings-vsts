import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';

// Use the task's installed processor for both transformation and XML/XPath parsing.
const SaxonJS: any = require('../../PublishParasoftResults/node_modules/saxon-js');
const taskRoot = path.resolve(__dirname, '../../PublishParasoftResults');
const fixtures = path.join(__dirname, 'resources/reports/soatest-regression');
const execution = 'SOAtest_functional_execution_violations.xml';
const visual = 'soatest_visual_difference.xml';
const changePrefix = 'soatest_parabank_change_impact_';
const changeModes = ['with_all_functional_tests', 'without_functional_tests', 'with_one_functional_test'];
const changeDetails = 'Service Details (from the Service Catalog):\n'
    + '\tService Name:  http://localhost:18080/parabank/services/store-01V2?wsdl\n'
    + '\tSaved Service Version:  Old Version\n\tCurrent Service Version:  Current Version\n\n'
    + 'Source: http://localhost:18081/current.wsdl';
const contracts: [string, number, number, number][] = [
    [execution, 1, 14, 10],
    [changePrefix + 'with_one_functional_test.xml', 1, 7, 7],
    [changePrefix + 'without_functional_tests.xml', 1, 7, 7],
    [changePrefix + 'with_all_functional_tests.xml', 1, 7, 7],
    [visual, 129, 526, 1],
    ['association_edges.xml', 1, 8, 3]
];

type XmlNode = { getAttribute(name: string): string | null; textContent: string };

function nodes(context: XmlNode, expression: string, params: object = {}): XmlNode[] {
    return SaxonJS.XPath.evaluate(expression, context, { params, resultForm: 'array' });
}

function transform(filename: string, processor: string): XmlNode {
    const source = path.join(fixtures, filename);
    let xml: string;
    if (processor === 'Java Saxon source XSL') {
        const java = process.env.JAVA_HOME
            ? path.join(process.env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java')
            : 'java';
        const saxon = path.join(taskRoot, 'lib/SaxonHE12-2J');
        const classpath = [path.join(saxon, 'saxon-he-12.2.jar'), path.join(saxon, 'lib/*')].join(path.delimiter);
        const result = spawnSync(java, ['-cp', classpath, 'net.sf.saxon.Transform',
            '-s:' + source, '-xsl:' + path.join(taskRoot, 'xsl/soatest-xunit.xsl'), '-versionmsg:off'],
        { encoding: 'utf8', timeout: 30000, maxBuffer: 10 * 1024 * 1024 });
        if (result.error || result.status !== 0) {
            throw new Error('Java Saxon failed for ' + filename + ': ' + (result.error || result.stderr));
        }
        xml = result.stdout;
    } else {
        xml = SaxonJS.transform({
            stylesheetFileName: path.join(taskRoot, 'xsl/soatest-xunit.sef.json'),
            sourceText: fs.readFileSync(source, 'utf8'),
            destination: 'serialized'
        }).principalResult;
    }
    return SaxonJS.XPath.evaluate('parse-xml($xml)', null, { params: { xml } });
}

for (const processor of ['Java Saxon source XSL', 'SaxonJS generated SEF']) {
    describe('SOAtest xUnit transformation - ' + processor, () => {
        const reports = new Map<string, XmlNode>();

        beforeAll(() => {
            for (const [filename] of contracts) {
                reports.set(filename, transform(filename, processor));
            }
        }, 120000);

        function report(filename: string): XmlNode {
            return reports.get(filename)!;
        }

        function testcase(filename: string, name: string): XmlNode {
            const cases = nodes(report(filename), '//testcase[@name = $name]', { name });
            expect(cases.length).withContext(filename + ': testcase ' + JSON.stringify(name)).toBe(1);
            if (cases.length !== 1) {
                throw new Error('Expected one testcase named ' + JSON.stringify(name) + ' in ' + filename);
            }
            return cases[0];
        }

        function failure(filename: string, name: string, message?: string, details?: string): XmlNode {
            const failures = nodes(testcase(filename, name), 'failure');
            expect(failures.length).withContext(filename + ': failure for ' + name).toBe(1);
            if (failures.length !== 1) {
                throw new Error('Expected one failure for ' + JSON.stringify(name) + ' in ' + filename);
            }
            if (message !== undefined) {
                expect(failures[0].getAttribute('message')).withContext(name).toBe(message);
            }
            if (details !== undefined) {
                expect(failures[0].textContent).withContext(name).toBe(details);
            }
            return failures[0];
        }

        function passing(filename: string, name: string): void {
            expect(nodes(testcase(filename, name), 'failure').length).withContext(name).toBe(0);
        }

        for (const [filename, suites, cases, failures] of contracts) {
            it(filename + ' counts failed testcases once and reports consistent suite totals', () => {
                const document = report(filename);
                expect(nodes(document, '//testsuite').length).toBe(suites);
                expect(nodes(document, '//testcase').length).toBe(cases);
                expect(nodes(document, '//testcase[failure]').length).toBe(failures);
                expect(nodes(document, '//failure').length).toBe(failures);
                for (const suite of nodes(document, '//testsuite')) {
                    const context = filename + ': suite ' + suite.getAttribute('name');
                    expect(Number(suite.getAttribute('tests'))).withContext(context).toBe(nodes(suite, 'testcase').length);
                    expect(Number(suite.getAttribute('failures'))).withContext(context).toBe(nodes(suite, 'testcase[failure]').length);
                }
            });
        }

        for (const kind of ['FuncViol', 'ChangeImpact', 'VisualDifference']) {
            it(kind + ' retains single-case and Safari diagnostics and durations', () => {
                for (const shape of ['Single', 'Parameterized']) {
                    const name = 'Execution violations/' + shape + ' ' + kind + (shape === 'Parameterized' ? '[Safari]' : '');
                    failure(execution, name, kind + ' failure', kind + ' details');
                    expect(testcase(execution, name).getAttribute('time')).toBe('1.000');
                }
            });

            it(kind + ' leaves the corresponding Chrome testcase passing', () => {
                passing(execution, 'Execution violations/Parameterized ' + kind + '[Chrome]');
            });
        }

        it('leaves an unrelated ordinary testcase passing', () => {
            passing(execution, 'Execution violations/Passing test');
        });

        it('combines every violation with reference separators, details and a missing-message fallback', () => {
            failure(execution, 'Execution violations/Mixed violations', 'Multiple errors reported',
                '==== ERROR ====\nFunctional failure'
                + '\n\n==== ERROR ====\nChange impact failure\nChange impact details'
                + '\n\n==== ERROR ====\nVisual difference failure\nSource: screenshot.png'
                + '\n\n==== ERROR ====\nFuncViol\nMixed details without summary');
        });

        it('preserves unknown kinds, missing or blank messages, and tests without case children', () => {
            failure(execution, 'Execution violations/Functional without message', 'FuncViol', 'Details without summary');
            failure(execution, 'Execution violations/Unknown violation', 'Future violation failure', 'Future violation details');
            failure(execution, 'Execution violations/Without test case', 'Visual comparison failed', '');
            failure('association_edges.xml', 'Edges/Whitespace message', 'FutureViolation', '');
        });

        it('keeps delimiter boundaries and missing IDs from acquiring unrelated failures', () => {
            const filename = 'association_edges.xml';
            failure(filename, 'Edges/Left boundary[gamma]', 'Left failure', 'Left details');
            failure(filename, 'Edges/Right boundary[beta|gamma]', 'Right failure', 'Right details');
            for (const name of ['Edges/Left boundary[pass]', 'Edges/Right boundary[|betagamma]',
                '', 'Edges/Missing case ID[]', 'Edges/Missing case ID[known]']) {
                passing(filename, name);
            }
        });

        it('keeps the native screenshot diagnostic on its only failing visual testcase', () => {
            const name = 'Test Suite: Test Suite/Test Suite: Web Scenarios/'
                + 'Scenario: SOA-18974/Test 7: Visually Compare Window 2';
            failure(visual, name, 'Visual difference found at (0, 0) of size 1,920 x 870.',
                'Source: SOA-18974_ScreenshotOutputs_test4_window2.png');
            for (const other of nodes(report(visual), '//testcase[@name != $name]', { name })) {
                expect(nodes(other, 'failure').length).withContext(other.getAttribute('name') || '').toBe(0);
            }
        });

        const scenario = 'Test Suite: Test Suite/Test Suite: CartServicePort/';
        const operations = ['addItemToCart', 'addNewItemToInventory', 'getItemById', 'getItemByTitle',
            'getItemsInCart', 'submitOrder', 'updateItemInCart'];
        for (const mode of changeModes) {
            it('preserves the seven matching Change Advisor diagnostics in ' + mode, () => {
                const filename = changePrefix + mode + '.xml';
                for (const [index, operation] of operations.entries()) {
                    const name = scenario + 'Test ' + (index + 1) + ': ' + operation;
                    const details = failure(filename, name, 'Multiple errors reported').textContent;
                    expect(details).withContext(name).toContain('Operation "' + operation + '" - targetObjectUri changed');
                    expect(details).withContext(name).toContain('Element "' + operation + '" - namespace changed');
                    expect(details).withContext(name).toContain(changeDetails);
                    for (const unrelated of operations.filter(other => other !== operation)) {
                        expect(details).withContext(name).not.toContain('Operation "' + unrelated + '"');
                    }
                    if (mode === 'with_all_functional_tests' && operation !== 'submitOrder') {
                        expect(details).withContext(name).toContain('SOAP Fault');
                    } else {
                        expect(details).withContext(name).not.toContain('SOAP Fault');
                    }
                }
                expect(failure(filename, scenario + 'Test 3: getItemById').textContent).toContain('getItemByIdentifier');
            });
        }

        it('retains the exact combined native Change Advisor message and service details', () => {
            failure(changePrefix + 'with_all_functional_tests.xml', scenario + 'Test 6: submitOrder',
                'Multiple errors reported',
                '==== ERROR ====\nOperation "submitOrder" - targetObjectUri changed from "http://bookstore.parasoft.com/"'
                + ' to "http://bookstore2.parasoft.com/"\n' + changeDetails
                + '\n\n==== ERROR ====\nElement "submitOrder" - namespace changed from "http://bookstore.parasoft.com/"'
                + ' to "http://bookstore2.parasoft.com/"\n' + changeDetails);
        });
    });
}
