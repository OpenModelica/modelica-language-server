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

suite('Modelica document highlights', () => {
  test('highlights the PI binding after unsaved edits and supports live toggles', async () => {
    const uri = getDocUri('documentHighlights.mo');
    await activate(uri);
    const document = await vscode.workspace.openTextDocument(uri);
    const original = document.getText();
    const config = vscode.workspace.getConfiguration('modelica');
    const setting = 'documentHighlights.enabled';
    const previous = config.inspect<boolean>(setting)?.workspaceValue;
    assert.equal(config.inspect<boolean>(setting)?.defaultValue, false);
    async function replace(text: string) {
      const edit = new vscode.WorkspaceEdit();
      edit.replace(uri, new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)), text);
      assert.ok(await vscode.workspace.applyEdit(edit));
    }
    async function expectCount(count: number) {
      const deadline = Date.now() + 15000;
      let result: vscode.DocumentHighlight[];
      do {
        result = await vscode.commands.executeCommand<vscode.DocumentHighlight[]>(
          'vscode.executeDocumentHighlights', uri,
          document.positionAt(document.getText().indexOf('PI(')),
        ) ?? [];
        if (result.length === count) break;
        await new Promise(resolve => setTimeout(resolve, 25));
      } while (Date.now() < deadline);
      assert.equal(result.length, count);
      for (const item of result) assert.equal(document.getText(item.range), 'PI');
      return result;
    }
    try {
      await replace('model M\n  External.Controller PI(mode=External.Mode.PI);\nequation\n  PI.y=PI.u;\nend M;\n');
      await config.update(setting, true, vscode.ConfigurationTarget.Workspace);
      const result = await expectCount(3);
      assert.ok(!result.some(item => item.range.start.character === document.lineAt(1).text.lastIndexOf('PI')));
      await replace('model M\n  External.Controller PI(mode=External.Mode.PI);\nequation\n  PI.y=1;\nend M;\n');
      await expectCount(2);
      await config.update(setting, false, vscode.ConfigurationTarget.Workspace);
      await expectCount(0);
      await config.update(setting, true, vscode.ConfigurationTarget.Workspace);
      await expectCount(2);
    } finally {
      await replace(original);
      await document.save();
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
      await config.update(setting, previous, vscode.ConfigurationTarget.Workspace);
    }
  });
});
