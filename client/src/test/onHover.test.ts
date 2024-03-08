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

import * as fs from 'fs';
import * as vscode from 'vscode';
import * as assert from 'assert';
import { getDocUri, getDocPath, activate } from './helper';

suite('onHover information', async () => {
  const docUri = getDocUri('step.mo');
  const position = new vscode.Position(19, 25);
  const content = new vscode.MarkdownString(
    fs.readFileSync(getDocPath('output.md'), 'utf-8'));
  const expectedHoverInstances: vscode.Hover[] = [
    new vscode.Hover(content)
  ];

  test('onHover()', async () => {
    await testOnHover(docUri, position, expectedHoverInstances);
  });
});

async function testOnHover(
  uri: vscode.Uri,
  position: vscode.Position,
  expectedHoverInstances: vscode.Hover[]
) {
  await activate(uri);

  // Execute `vscode.executeHoverProvider` to execute all hover providers
  const actualHoverInstances = await vscode.commands.executeCommand<vscode.Hover[]>("vscode.executeHoverProvider", uri, position);

  assertHoverInstancesEqual(expectedHoverInstances, actualHoverInstances);
}

function assertHoverInstancesEqual(expected: vscode.Hover[], actual: vscode.Hover[]) {
  assert.strictEqual(expected.length, actual.length, 'Array lengths do not match.');

  for (let i = 0; i < expected.length; i++) {
    const expectedHover = expected[i];
    const actualHover = actual[i];

    let expectedContent = "";
    for (let j = 0; j < expectedHover.contents.length; j++) {
      const content = expectedHover.contents[j];
      if (content instanceof vscode.MarkdownString) {
        expectedContent += content.value;
      }
    }

    let actualContent = "";
    for (let j = 0; j < actualHover.contents.length; j++) {
      const content = actualHover.contents[j];
      if (content instanceof vscode.MarkdownString) {
        actualContent += content.value;
      }
    }

    assert.strictEqual(actualContent.trim(), expectedContent.trim(), `Content does not match expected content.`);
  }
}
