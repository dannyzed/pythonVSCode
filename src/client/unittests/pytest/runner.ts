/// <reference path="../../../../typings/globals/xml2js/index.d.ts" />

'use strict';
import { createDeferred, createTemporaryFile } from '../../common/helpers';
import { TestFile, TestsToRun, TestSuite, TestFunction, FlattenedTestFunction, Tests, TestStatus, FlattenedTestSuite } from '../common/contracts';
import { extractBetweenDelimiters, flattenTestFiles, updateResults, convertFileToPackage } from '../common/testUtils';
import { BaseTestManager } from '../common/baseTestManager';
import { CancellationToken, OutputChannel } from 'vscode';
import { updateResultsFromXmlLogFile, PassCalculationFormulae } from '../common/xUnitParser';
import { run } from '../common/runner';
import { PythonSettings } from '../../common/configSettings';

const pythonSettings = PythonSettings.getInstance();

export function runTest(rootDirectory: string, tests: Tests, args: string[], testsToRun?: TestsToRun, token?: CancellationToken, outChannel?: OutputChannel): Promise<Tests> {
    let testPaths = [];
    if (testsToRun && testsToRun.testFolder) {
        testPaths = testPaths.concat(testsToRun.testFolder.map(f => f.nameToRun));
    }
    if (testsToRun && testsToRun.testFile) {
        testPaths = testPaths.concat(testsToRun.testFile.map(f => f.nameToRun));
    }
    if (testsToRun && testsToRun.testSuite) {
        testPaths = testPaths.concat(testsToRun.testSuite.map(f => f.nameToRun));
    }
    if (testsToRun && testsToRun.testFunction) {
        testPaths = testPaths.concat(testsToRun.testFunction.map(f => f.nameToRun));
    }

    let xmlLogFile = '';
    let xmlLogFileCleanup: Function = null;

    return createTemporaryFile('.xml').then(xmlLogResult => {
        xmlLogFile = xmlLogResult.filePath;
        xmlLogFileCleanup = xmlLogResult.cleanupCallback;
        if (testPaths.length > 0){
            // Ignore the test directories, as we're running a specific test
            args = args.filter(arg => arg.trim().startsWith('-'));
        }
        const testArgs = testPaths.concat(args, [`--junitxml=${xmlLogFile}`]);
        return run(pythonSettings.unitTest.pyTestPath, testArgs, rootDirectory, token, outChannel);
    }).then(() => {
        return updateResultsFromLogFiles(tests, xmlLogFile);
    }).then(result => {
        xmlLogFileCleanup();
        return result;
    }).catch(reason => {
        xmlLogFileCleanup();
        return Promise.reject(reason);
    });
}

export function updateResultsFromLogFiles(tests: Tests, outputXmlFile: string): Promise<Tests> {
    return updateResultsFromXmlLogFile(tests, outputXmlFile, PassCalculationFormulae.pytest).then(() => {
        updateResults(tests);
        return tests;
    });
}