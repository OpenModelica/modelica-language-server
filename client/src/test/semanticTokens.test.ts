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

suite('Modelica semantic tokens', () => {
  test('classifies declarations, uses and end names after unsaved edits', async () => {
    const uri = getDocUri('semanticTokens.mo');
    await activate(uri);
    const document = await vscode.workspace.openTextDocument(uri);
    const original = document.getText();
    if (process.env.MODELICA_TEST_METAMODELICA === '1') {
      const extension = vscode.extensions.getExtension('AnHeuermann.metamodelica');
      assert.ok(extension, 'MetaModelica must be installed for the coexistence run');
      await extension.activate();
      assert.ok(extension.packageJSON.contributes.grammars.some((grammar: { language: string }) => grammar.language === 'modelica'));
    }
    async function replace(text: string) {
      const edit = new vscode.WorkspaceEdit();
      edit.replace(uri, new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)), text);
      assert.ok(await vscode.workspace.applyEdit(edit));
    }
    async function expectTokens(expected: [string, string, number][]) {
      const deadline = Date.now() + 15000;
      let actual: [string, string, number][];
      do {
        const legend = await vscode.commands.executeCommand<vscode.SemanticTokensLegend>('vscode.provideDocumentSemanticTokensLegend', uri);
        const tokens = await vscode.commands.executeCommand<vscode.SemanticTokens>('vscode.provideDocumentSemanticTokens', uri);
        actual = [];
        let line = 0, character = 0;
        if (legend && tokens) {
          for (let i = 0; i < tokens.data.length; i += 5) {
            line += tokens.data[i];
            character = tokens.data[i] === 0 ? character + tokens.data[i + 1] : tokens.data[i + 1];
            actual.push([
              document.getText(new vscode.Range(line, character, line, character + tokens.data[i + 2])),
              legend.tokenTypes[tokens.data[i + 3]], tokens.data[i + 4],
            ]);
          }
        }
        if (JSON.stringify(actual) === JSON.stringify(expected)) break;
        await new Promise(resolve => setTimeout(resolve, 25));
      } while (Date.now() < deadline);
      assert.deepEqual(actual, expected);
    }
    try {
      await expectTokens([['TokenExample', 'class', 1], ['Temperature', 'type', 1], ['Temperature', 'type', 0], ['TokenExample', 'class', 0]]);
      await replace('package Changed\r\n  // 🤖 Changed Temperature\r\n  record R end R;\r\n  R r;\r\nend Changed;\r\n');
      assert.equal(document.isDirty, true);
      await expectTokens([['Changed', 'namespace', 1], ['R', 'struct', 1], ['R', 'struct', 0], ['R', 'struct', 0], ['Changed', 'namespace', 0]]);
      await replace('model Changed Real x=; end Changed;');
      await expectTokens([['Changed', 'class', 1], ['Changed', 'class', 0]]);
    } finally {
      await replace(original);
      await document.save();
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    }
  });
});
