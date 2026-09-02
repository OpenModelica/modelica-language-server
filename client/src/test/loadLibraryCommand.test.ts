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

import * as vscode from 'vscode';
import * as assert from 'assert';
import * as path from 'path';
import { getDocUri, activate, executeProviderUntilResult } from './helper';
import { createClientOptions } from '../extension';

/**
 * Guards the `modelica.loadLibrary` command and the configuration
 * synchronization it depends on.
 *
 * The command works by appending to `modelica.libraries`. The client only
 * forwards that change to a running server because `synchronize` names
 * `configurationSection: 'modelica'`; without it the client sends
 * `{settings: null}` and `ModelicaServer.onDidChangeConfiguration` sees no
 * libraries, so the command would silently do nothing.
 */
suite('Load Library command', () => {
  // Deliberately outside the test workspace (`testFixture`), so the server does
  // not pick it up as a workspace folder at startup.
  const libraryPath = path.resolve(__dirname, '../../testFixtureLibrary/RuntimeLoadLib');
  const configuration = () => vscode.workspace.getConfiguration('modelica');

  suiteTeardown(async () => {
    await configuration().update('libraries', undefined, vscode.ConfigurationTarget.Workspace);
  });

  test('registers the modelica.loadLibrary command', async () => {
    await activate(getDocUri('UseRuntimeLoadLib.mo'));
    const commands = await vscode.commands.getCommands(true);
    assert.ok(
      commands.includes('modelica.loadLibrary'),
      'Expected "modelica.loadLibrary" to be registered',
    );
  });

  test('synchronizes the modelica configuration section with the server', () => {
    // Without this the command can still update the setting, but the running
    // server is never told, so the library stays unresolvable until a restart.
    const synchronize = createClientOptions().synchronize;
    assert.strictEqual(
      synchronize?.configurationSection, 'modelica',
      'Expected synchronize.configurationSection to be "modelica" so that ' +
      'modelica.libraries changes reach the server as workspace/didChangeConfiguration',
    );
  });

  test('a library added to modelica.libraries becomes resolvable', async () => {
    const docUri = getDocUri('UseRuntimeLoadLib.mo');
    await activate(docUri);
    // "    RuntimeLoadLib.M m;" — cursor on "RuntimeLoadLib"
    const position = new vscode.Position(2, 4);

    // The library is outside the workspace, so it is not loaded yet.
    const before = await vscode.commands.executeCommand<vscode.LocationLink[]>(
      'vscode.executeDeclarationProvider', docUri, position,
    );
    assert.strictEqual(
      before?.length ?? 0, 0,
      'Expected no declaration before the library is added to "modelica.libraries"',
    );

    // What the command does.
    const libraries: string[] = configuration().get('libraries') ?? [];
    await configuration().update(
      'libraries', [...libraries, libraryPath], vscode.ConfigurationTarget.Workspace,
    );

    const after = await executeProviderUntilResult<vscode.LocationLink[]>(
      'vscode.executeDeclarationProvider', [docUri, position],
    );
    assert.ok(after.length > 0, 'Expected the declaration to resolve after adding the library');
    assert.ok(
      after[0].targetUri.fsPath.startsWith(libraryPath),
      `Expected resolution into '${libraryPath}', got '${after[0].targetUri.fsPath}'`,
    );
  });
});
