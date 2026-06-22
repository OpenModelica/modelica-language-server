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
import * as assert from 'assert';
import { getDocUri, activate, executeProviderUntilResult } from './helper';

suite('MSL Library Support', () => {
  test('go-to-declaration resolves MSL type into MSL directory', async () => {
    const libraries: string[] =
      vscode.workspace.getConfiguration('modelica').get('libraries') ?? [];
    if (libraries.length === 0) {
      console.log('Skipping MSL test: no modelica.libraries configured');
      return;
    }

    const docUri = getDocUri('UseMSL.mo');
    await activate(docUri);

    // Line 2: "    Modelica.Units.SI.Voltage v;" — cursor on "Modelica" at column 4
    const position = new vscode.Position(2, 4);
    const actualLocations = await executeProviderUntilResult<vscode.LocationLink[]>(
      'vscode.executeDeclarationProvider',
      [docUri, position],
    );

    assert.ok(actualLocations.length > 0, 'Expected at least one declaration location');

    const targetPath = actualLocations[0].targetUri.fsPath;
    const mslDir = libraries[0];
    assert.ok(
      targetPath.startsWith(mslDir),
      `Expected declaration to resolve into MSL directory '${mslDir}', got '${targetPath}'`,
    );
  });
});
