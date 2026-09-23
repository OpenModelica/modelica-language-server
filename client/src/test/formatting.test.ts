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
import { activate, executeProviderUntilResult, getDocUri } from './helper';

suite('Modelica formatting providers', () => {
  const uri = getDocUri('formatting.mo');

  function applyEdits(document: vscode.TextDocument, edits: vscode.TextEdit[]): string {
    let text = document.getText();
    for (const edit of [...edits].sort((a, b) => document.offsetAt(b.range.start) - document.offsetAt(a.range.start))) {
      text = text.slice(0, document.offsetAt(edit.range.start)) + edit.newText + text.slice(document.offsetAt(edit.range.end));
    }
    return text;
  }

  test('Format Document uses two-space Modelica indentation', async () => {
    await activate(uri);
    const document = await vscode.workspace.openTextDocument(uri);
    const config = vscode.workspace.getConfiguration('editor', document);
    assert.equal(config.get('tabSize'), 2);
    assert.equal(config.get('insertSpaces'), true);
    const edits = await executeProviderUntilResult<vscode.TextEdit[]>(
      'vscode.executeFormatDocumentProvider', [uri, { tabSize: 2, insertSpaces: true }],
    );
    assert.ok(edits?.length);
    assert.equal(applyEdits(document, edits), 'within;\nmodel Formatting\n  Real x(start = 1, fixed = true);\nequation\n  der(x) = -x;\nend Formatting;\n');
  });

  test('Format Selection preserves text outside the selected lines', async () => {
    await activate(uri);
    const document = await vscode.workspace.openTextDocument(uri);
    const edits = await executeProviderUntilResult<vscode.TextEdit[]>(
      'vscode.executeFormatRangeProvider', [uri, new vscode.Range(2, 0, 3, 0), { tabSize: 2, insertSpaces: true }],
    );
    assert.ok(edits?.length);
    assert.equal(applyEdits(document, edits), document.getText().replace('Real x(start=1,fixed=true);', '  Real x(start = 1, fixed = true);'));
  });
});
