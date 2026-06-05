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

import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

import { runTests } from '@vscode/test-electron';

const MSL_CANDIDATES = [
  path.join(os.homedir(), '.openmodelica', 'libraries', 'Modelica 4.0.0+maint.om'),
  path.join(os.homedir(), '.openmodelica', 'libraries', 'Modelica 4.1.0+maint.om'),
  '/usr/lib/omlibrary/Modelica 4.0.0+maint.om',
];

function detectMsl(): string | undefined {
  return MSL_CANDIDATES.find((p) => fs.existsSync(path.join(p, 'package.mo')));
}

async function main() {
  try {
    const extensionDevelopmentPath = path.resolve(__dirname, '../../../');
    const extensionTestsPath = path.resolve(__dirname, './index');

    // Use the testFixture folder as VS Code workspace so .vscode/settings.json is picked up
    const testFixturePath = path.resolve(__dirname, '../../testFixture');

    // Write workspace settings with MSL path if found on this machine
    const mslPath = detectMsl();
    const vscodeDir = path.join(testFixturePath, '.vscode');
    fs.mkdirSync(vscodeDir, { recursive: true });
    fs.writeFileSync(
      path.join(vscodeDir, 'settings.json'),
      JSON.stringify(
        { 'modelica.libraries': mslPath ? [mslPath] : [] },
        null,
        2,
      ),
    );

    // Download VS Code, unzip it and run the integration test
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [testFixturePath],
    });
  } catch (err) {
    console.error('Failed to run tests');
    process.exit(1);
  }
}

main();
