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

suite('Modelica completion', () => {
  test('completes and inserts local names after an unsaved edit, then qualified names', async () => {
    const uri = getDocUri('completion.mo');
    await activate(uri);
    const document = await vscode.workspace.openTextDocument(uri);
    const original = document.getText();
    const config = vscode.workspace.getConfiguration('modelica');
    const setting = 'completion.enabled';
    const previous = config.inspect<boolean>(setting)?.workspaceValue;
    const editorConfig = vscode.workspace.getConfiguration('editor');
    const previousWords = editorConfig.inspect<string>('wordBasedSuggestions')?.workspaceValue;
    assert.equal(config.inspect<boolean>(setting)?.defaultValue, false);
    async function replace(text: string) {
      const edit = new vscode.WorkspaceEdit();
      edit.replace(uri, new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)), text);
      assert.ok(await vscode.workspace.applyEdit(edit));
    }
    async function completion(prefix: string, expected: string) {
      const position = document.positionAt(document.getText().lastIndexOf(prefix) + prefix.length);
      const deadline = Date.now() + 15000;
      do {
        const list = await vscode.commands.executeCommand<vscode.CompletionList>(
          'vscode.executeCompletionItemProvider', uri, position,
        );
        const item = list?.items.find(item => item.label === expected && item.kind !== vscode.CompletionItemKind.Text);
        if (item) return item;
        await new Promise(resolve => setTimeout(resolve, 25));
      } while (Date.now() < deadline);
      assert.fail('Missing completion: ' + expected);
    }
    try {
      // Exclude VS Code's independent word-based fallback provider.
      await editorConfig.update('wordBasedSuggestions', 'off', vscode.ConfigurationTarget.Workspace);
      await config.update(setting, true, vscode.ConfigurationTarget.Workspace);
      await replace('model Completion\n  Real velocity;\nequation\n  vel = 0;\nend Completion;\n');
      const item = await completion('vel', 'velocity');
      assert.ok(item.range instanceof vscode.Range);
      assert.equal(document.getText(item.range), 'vel');
      const edit = new vscode.WorkspaceEdit();
      const insertion = item.insertText;
      assert.equal(typeof insertion, 'string');
      edit.replace(uri, item.range, insertion as string);
      assert.ok(await vscode.workspace.applyEdit(edit));
      assert.ok(document.getText().includes('velocity = 0;'));
      await replace('package Completion\n  package Parts\n    model Sensor end Sensor;\n  end Parts;\n  model M\n    Parts.Se\n  end M;\nend Completion;\n');
      const qualified = await completion('Parts.Se', 'Sensor');
      assert.ok(qualified.range instanceof vscode.Range);
      assert.equal(document.getText(qualified.range), 'Se');
      await config.update(setting, false, vscode.ConfigurationTarget.Workspace);
      const deadline = Date.now() + 15000;
      let disabled = false;
      do {
        const list = await vscode.commands.executeCommand<vscode.CompletionList>(
          'vscode.executeCompletionItemProvider', uri,
          document.positionAt(document.getText().indexOf('Parts.Se') + 'Parts.Se'.length),
        );
        disabled = !list?.items.length;
        if (!disabled) await new Promise(resolve => setTimeout(resolve, 25));
      } while (!disabled && Date.now() < deadline);
      assert.ok(disabled, 'disabling completion must take effect without restarting');
    } finally {
      await replace(original);
      await document.save();
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
      await config.update(setting, previous, vscode.ConfigurationTarget.Workspace);
      await editorConfig.update('wordBasedSuggestions', previousWords, vscode.ConfigurationTarget.Workspace);
    }
  });
});
