/*
 * This file is part of OpenModelica.
 *
 * Copyright (c) 1998-2024, Open Source Modelica Consortium (OSMC),
 * c/o Linköpings universitet, Department of Computer and Information Science,
 * SE-58183 Linköping, Sweden.
 *
 * All rights reserved.
 *
 * THIS PROGRAM IS PROVIDED UNDER THE TERMS OF AGPL VERSION 3 LICENSE OR
 * THIS OSMC PUBLIC LICENSE (OSMC-PL) VERSION 1.8.
 * ANY USE, REPRODUCTION OR DISTRIBUTION OF THIS PROGRAM CONSTITUTES
 * RECIPIENT'S ACCEPTANCE OF THE OSMC PUBLIC LICENSE OR THE GNU AGPL
 * VERSION 3, ACCORDING TO RECIPIENTS CHOICE.
 *
 * The OpenModelica software and the OSMC (Open Source Modelica Consortium)
 * Public License (OSMC-PL) are obtained from OSMC, either from the above
 * address, from the URLs:
 * http://www.openmodelica.org or
 * https://github.com/OpenModelica/ or
 * http://www.ida.liu.se/projects/OpenModelica,
 * and in the OpenModelica distribution.
 *
 * GNU AGPL version 3 is obtained from:
 * https://www.gnu.org/licenses/licenses.html#GPL
 *
 * This program is distributed WITHOUT ANY WARRANTY; without
 * even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE, EXCEPT AS EXPRESSLY SET FORTH
 * IN THE BY RECIPIENT SELECTED SUBSIDIARY LICENSE CONDITIONS OF OSMC-PL.
 *
 * See the full OSMC Public License conditions for more details.
 *
 */

import * as vscode from 'vscode';
import * as path from 'path';

export let doc: vscode.TextDocument;
export let editor: vscode.TextEditor;
export let documentEol: string;
export let platformEol: string;


/**
 * Activates the OpenModelica.modelica-language-server extension and opens the
 * given document.
 *
 * This resolves once the extension is activated and the document is open, but
 * NOT once the language server has finished initializing and parsing it (that
 * happens asynchronously). Callers must therefore not assume the server is
 * ready when this returns: run provider commands through
 * {@link executeProviderUntilResult}, which polls until a non-empty result is
 * available instead of relying on a fixed delay.
 *
 * @param docUri  The document to open in the editor.
 */
export async function activate(docUri: vscode.Uri): Promise<void> {
  // The extensionId is `publisher.name` from package.json
  const ext = vscode.extensions.getExtension('OpenModelica.modelica-language-server');
  if (!ext) {
    throw new Error('Could not find OpenModelica.modelica-language-server extension');
  }
  await ext.activate();
  try {
    doc = await vscode.workspace.openTextDocument(docUri);
    editor = await vscode.window.showTextDocument(doc);
    // No fixed wait for server activation here: callers use
    // `executeProviderUntilResult`, which polls until the server is ready.
  } catch (e) {
    console.error(e);
  }
}

/**
 * Repeatedly run a VS Code command until it returns a non-empty result.
 *
 * The language server initializes and parses documents asynchronously, so a
 * single fixed delay after activation is racy: on slower machines (e.g. CI)
 * the provider can still return an empty result. Polling avoids that flakiness
 * while keeping fast machines fast.
 *
 * @param command         Command id to execute, e.g. `vscode.executeDeclarationProvider`.
 * @param args            Arguments forwarded to the command.
 * @param timeoutMs       Maximum time to keep retrying.
 * @param intervalMs      Delay between attempts.
 * @returns The first non-empty result, or the last (empty) result on timeout.
 */
export async function executeProviderUntilResult<T extends { length: number }>(
  command: string,
  args: unknown[],
  timeoutMs = 20000,
  intervalMs = 250,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let result = await vscode.commands.executeCommand<T>(command, ...args);
  while ((!result || result.length === 0) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    result = await vscode.commands.executeCommand<T>(command, ...args);
  }
  return result;
}

export const getDocPath = (p: string): string => {
  return path.resolve(__dirname, '../../testFixture', p);
};

export const getDocUri = (p: string): vscode.Uri => {
  return vscode.Uri.file(getDocPath(p));
};
