/*
 * This file is part of OpenModelica.
 *
 * Copyright (c) 1998-2026, Open Source Modelica Consortium (OSMC),
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


import assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { activate, getDocUri } from './helper';

suite('Modelica syntax diagnostics', () => {
  test('defaults off, supports live toggles, and clears errors after an unsaved fix', async () => {
    const uri = getDocUri('diagnostics.mo');
    await activate(uri);
    const document = await vscode.workspace.openTextDocument(uri);
    const original = document.getText();
    const config = vscode.workspace.getConfiguration('modelica');
    const setting = 'diagnostics.syntax';
    const previous = config.inspect<boolean>(setting)?.workspaceValue;
    assert.equal(config.inspect<boolean>(setting)?.defaultValue, false);
    const ownDiagnostics = () => vscode.languages.getDiagnostics(uri).filter(d => d.source === 'modelica');
    async function waitFor(predicate: () => boolean) {
      const deadline = Date.now() + 15_000;
      while (!predicate() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25));
      assert.ok(predicate(), 'expected diagnostics update from the language server');
    }
    async function replace(text: string) {
      const edit = new vscode.WorkspaceEdit();
      edit.replace(uri, new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)), text);
      assert.ok(await vscode.workspace.applyEdit(edit));
    }
    try {
      await config.update(setting, undefined, vscode.ConfigurationTarget.Workspace);
      await new Promise(resolve => setTimeout(resolve, 500));
      assert.deepEqual(ownDiagnostics(), []);
      await config.update(setting, true, vscode.ConfigurationTarget.Workspace);
      await waitFor(() => ownDiagnostics().length > 0);
      assert.equal(ownDiagnostics()[0].code, 'missing-token');
      assert.equal(ownDiagnostics()[0].severity, vscode.DiagnosticSeverity.Error);
      await replace('model Diagnostics\n  Real x;\nend Diagnostics;\n');
      await waitFor(() => ownDiagnostics().length === 0);
      await replace('model Diagnostics\n  String s = "🃏🔑🤖🌳é"; Real x = ;\nend Diagnostics;\n');
      await waitFor(() => ownDiagnostics().length > 0);
      const diagnostic = ownDiagnostics()[0];
      assert.equal(diagnostic.range.start.line, 1);
      assert.equal(diagnostic.range.start.character, '  String s = "🃏🔑🤖🌳é"; Real x '.length);
      await config.update(setting, false, vscode.ConfigurationTarget.Workspace);
      await waitFor(() => ownDiagnostics().length === 0);
      await replace('model Diagnostics');
      await new Promise(resolve => setTimeout(resolve, 350));
      assert.deepEqual(ownDiagnostics(), []);
    } finally {
      await replace(original);
      await document.save();
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
      await config.update(setting, previous, vscode.ConfigurationTarget.Workspace);
    }
  });
});
