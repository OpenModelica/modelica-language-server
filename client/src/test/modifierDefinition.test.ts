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

suite('Modelica modifier navigation', () => {
  test('follows an inherited parameter renamed in unsaved declaration and modifier buffers', async () => {
    const sourceUri = getDocUri('ModifierNavigation/Use.mo');
    const targetUri = getDocUri('ModifierNavigation/Base.mo');
    await activate(sourceUri);
    const source = await vscode.workspace.openTextDocument(sourceUri);
    const target = await vscode.workspace.openTextDocument(targetUri);
    const originalSource = source.getText();
    const originalTarget = target.getText();

    async function expectDefinition(name: string) {
      const marker = `PI(${name}=`;
      const offset = source.getText().indexOf(marker);
      assert.ok(offset >= 0, `missing modifier ${marker}`);
      const position = source.positionAt(offset + 'PI('.length + 1);
      const expected = `parameter Real ${name} = 1`;
      const deadline = Date.now() + 15000;
      let selected: string | undefined;
      do {
        const locations = await vscode.commands.executeCommand<vscode.LocationLink[]>(
          'vscode.executeDefinitionProvider', sourceUri, position,
        );
        if (locations?.length) {
          assert.equal(locations.length, 1);
          const location = locations[0];
          assert.equal(location.targetUri.toString(), targetUri.toString(), 'must resolve the inherited parameter, not a same-name local');
          selected = target.getText(location.targetRange);
          if (selected === expected) {
            assert.equal(target.offsetAt(location.targetRange.start), target.getText().indexOf(expected));
            return;
          }
        }
        await new Promise(resolve => setTimeout(resolve, 25));
      } while (Date.now() < deadline);
      assert.equal(selected, expected);
    }

    try {
      await expectDefinition('Ti');
      const edit = new vscode.WorkspaceEdit();
      const declarationStart = originalTarget.indexOf('Ti = 1');
      const modifierStart = originalSource.indexOf('PI(Ti=') + 'PI('.length;
      assert.ok(declarationStart >= 0);
      assert.ok(originalSource.includes('PI(Ti='));
      edit.replace(targetUri, new vscode.Range(target.positionAt(declarationStart), target.positionAt(declarationStart + 2)), 'integralTime');
      edit.replace(sourceUri, new vscode.Range(source.positionAt(modifierStart), source.positionAt(modifierStart + 2)), 'integralTime');
      assert.ok(await vscode.workspace.applyEdit(edit));
      assert.ok(source.isDirty);
      assert.ok(target.isDirty);
      await expectDefinition('integralTime');
      assert.equal(Buffer.from(await vscode.workspace.fs.readFile(sourceUri)).toString('utf8'), originalSource);
      assert.equal(Buffer.from(await vscode.workspace.fs.readFile(targetUri)).toString('utf8'), originalTarget);
    } finally {
      const restore = new vscode.WorkspaceEdit();
      restore.replace(sourceUri, new vscode.Range(source.positionAt(0), source.positionAt(source.getText().length)), originalSource);
      restore.replace(targetUri, new vscode.Range(target.positionAt(0), target.positionAt(target.getText().length)), originalTarget);
      assert.ok(await vscode.workspace.applyEdit(restore));
      await source.save();
      await target.save();
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    }
  });
});
