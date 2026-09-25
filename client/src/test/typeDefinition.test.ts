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
import { activate, getDocUri, executeProviderUntilResult } from './helper';

suite('Modelica type and implementation navigation', () => {
  test('Go to Implementation opens the concrete model body through the editor command', async () => {
    const uri = getDocUri('TypeNavigation/TypeNavigation.mo');
    await activate(uri);
    const document = await vscode.workspace.openTextDocument(uri);
    const position = document.positionAt(document.getText().indexOf('FirstOrder filter') + 2);
    const locations = await executeProviderUntilResult<vscode.LocationLink[]>(
      'vscode.executeImplementationProvider', [uri, position],
    );
    assert.equal(locations.length, 1);
    assert.equal(locations[0].targetUri.toString(), uri.toString());
    assert.match(document.getText(locations[0].targetRange), /^model FirstOrder\s+Real x;\s+end FirstOrder$/);
  });

  test('opens the component type and follows unsaved type changes', async () => {
    const uri = getDocUri('TypeNavigation/TypeNavigation.mo');
    await activate(uri);
    const document = await vscode.workspace.openTextDocument(uri);
    const original = document.getText();
    async function expectType(name: string) {
      const deadline = Date.now() + 15000;
      let selected: string | undefined;
      do {
        const position = document.positionAt(document.getText().indexOf('filter.x') + 2);
        const locations = await vscode.commands.executeCommand<vscode.LocationLink[]>('vscode.executeTypeDefinitionProvider', uri, position);
        const first = locations?.[0];
        if (first) {
          assert.equal(first.targetUri.toString(), uri.toString());
          selected = document.getText(first.targetSelectionRange);
          if (selected === name) break;
        }
        await new Promise(resolve => setTimeout(resolve, 25));
      } while (Date.now() < deadline);
      assert.equal(selected, name);
    }
    try {
      await expectType('FirstOrder');
      const edit = new vscode.WorkspaceEdit();
      const start = original.indexOf('FirstOrder filter');
      edit.replace(uri, new vscode.Range(document.positionAt(start), document.positionAt(start + 'FirstOrder'.length)), 'SecondOrder');
      assert.ok(await vscode.workspace.applyEdit(edit));
      assert.ok(document.isDirty);
      await expectType('SecondOrder');
    } finally {
      const edit = new vscode.WorkspaceEdit();
      edit.replace(uri, new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)), original);
      assert.ok(await vscode.workspace.applyEdit(edit));
      await document.save();
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    }
  });
});
