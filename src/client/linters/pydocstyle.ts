'use strict';

import * as path from 'path';
import * as baseLinter from './baseLinter';
import { ILintMessage } from './baseLinter';
import { OutputChannel } from 'vscode';
import { execPythonFile, IS_WINDOWS } from './../common/utils';
import { Product } from '../common/installer';

export class Linter extends baseLinter.BaseLinter {
    constructor(outputChannel: OutputChannel, workspaceRootPath: string) {
        super('pydocstyle', Product.pydocstyle, outputChannel, workspaceRootPath);
    }

    public isEnabled(): Boolean {
        return this.pythonSettings.linting.pydocstyleEnabled;
    }
    public runLinter(filePath: string, txtDocumentLines: string[]): Promise<baseLinter.ILintMessage[]> {
        if (!this.pythonSettings.linting.pydocstyleEnabled) {
            return Promise.resolve([]);
        }

        let pydocStylePath = this.pythonSettings.linting.pydocStylePath;
        let pydocstyleArgs = Array.isArray(this.pythonSettings.linting.pydocstleArgs) ? this.pythonSettings.linting.pydocstleArgs : [];
        return new Promise<baseLinter.ILintMessage[]>(resolve => {
            this.run(pydocStylePath, pydocstyleArgs.concat([filePath]), filePath, txtDocumentLines).then(messages => {
                // All messages in pep8 are treated as warnings for now
                messages.forEach(msg => {
                    msg.severity = baseLinter.LintMessageSeverity.Information;
                });

                resolve(messages);
            });
        });
    }

    protected run(commandLine: string, args: string[], filePath: string, txtDocumentLines: string[]): Promise<ILintMessage[]> {
        let outputChannel = this.outputChannel;

        return new Promise<ILintMessage[]>((resolve, reject) => {
            execPythonFile(commandLine, args, this.workspaceRootPath, true).then(data => {
                outputChannel.append('#'.repeat(10) + 'Linting Output - ' + this.Id + '#'.repeat(10) + '\n');
                outputChannel.append(data);
                let outputLines = data.split(/\r?\n/g);
                let diagnostics: ILintMessage[] = [];
                let baseFileName = path.basename(filePath);

                // Remember, the first line of the response contains the file name and line number, the next line contains the error message
                // So we have two lines per message, hence we need to take lines in pairs
                let maxLines = this.pythonSettings.linting.maxNumberOfProblems * 2;
                // First line is almost always empty
                let oldOutputLines = outputLines.filter(line => line.length > 0);
                outputLines = [];
                for (let counter = 0; counter < oldOutputLines.length / 2; counter++) {
                    outputLines.push(oldOutputLines[2 * counter] + oldOutputLines[(2 * counter) + 1]);
                }

                outputLines = outputLines.filter((value, index) => {
                    return index < maxLines && value.indexOf(':') >= 0;
                }).map(line => {
                    // Windows will have a : after the drive letter (e.g. c:\)
                    if (IS_WINDOWS) {
                        return line.substring(line.indexOf(baseFileName + ':') + baseFileName.length + 1).trim();
                    }
                    return line.substring(line.indexOf(':') + 1).trim();
                });
                // Iterate through the lines (skipping the messages)
                // So, just iterate the response in pairs
                outputLines.forEach(line => {
                    try {
                        if (line.trim().length === 0) {
                            return;
                        }
                        let lineNumber = parseInt(line.substring(0, line.indexOf(' ')));
                        let part = line.substring(line.indexOf(':') + 1).trim();
                        let code = part.substring(0, part.indexOf(':')).trim();
                        let message = part.substring(part.indexOf(':') + 1).trim();

                        let sourceLine = txtDocumentLines[lineNumber - 1];
                        let trmmedSourceLine = sourceLine.trim();
                        let sourceStart = sourceLine.indexOf(trmmedSourceLine);

                        diagnostics.push({
                            code: code,
                            message: message,
                            column: sourceStart,
                            line: lineNumber,
                            type: '',
                            provider: this.Id
                        });
                    }
                    catch (ex) {
                        // Hmm, need to handle this later
                    }
                });
                resolve(diagnostics);
            }, error => {
                this.handleError(this.Id, commandLine, error);
                resolve([]);
            });
        });
    }
}
