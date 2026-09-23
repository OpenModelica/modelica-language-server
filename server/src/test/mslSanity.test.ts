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
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { checkMsl } from '../sanity/msl';

describe('MSL sanity runner', () => {
  let root: string;
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'msl-sanity-test-'));
    await fs.mkdir(path.join(root, 'Examples'));
    await fs.writeFile(path.join(root, 'package.mo'), 'package Modelica end Modelica;');
    // Examples may live inside a monolithic source outside Examples/.
    await fs.writeFile(path.join(root, 'Blocks.mo'),
      'within Modelica; package Blocks package Examples model Demo Real x; end Demo; end Examples; end Blocks;');
    await fs.writeFile(path.join(root, 'Examples', 'Demo.mo'), 'within Modelica.Examples; model Demo end Demo;');
    await fs.writeFile(path.join(root, 'ignored.txt'), 'not Modelica');
  });
  afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

  it('checks every source, including nested files and embedded examples', async () => {
    assert.deepEqual(await checkMsl(root, () => {}), { files: 3, failedFiles: 0, diagnostics: 0 });
  });

  it('reports path, line and column for invalid embedded examples', async () => {
    await fs.writeFile(path.join(root, 'Blocks.mo'),
      'within Modelica; package Blocks package Examples model Demo Real x = ; end Demo; end Examples; end Blocks;');
    const messages: string[] = [];
    assert.deepEqual(await checkMsl(root, message => messages.push(message)),
      { files: 3, failedFiles: 1, diagnostics: 1 });
    assert.ok(messages.some(message => /^Blocks.mo:1:\d+: Syntax error\.$/.test(message)));
  });

  it('rejects a missing library instead of skipping the check', async () => {
    await assert.rejects(checkMsl(path.join(root, 'missing'), () => {}), /ENOENT/);
  });

  it('returns a failing CLI exit code for diagnostics and missing input', async function () {
    this.timeout(10_000);
    const script = path.join(__dirname, '..', 'sanity', 'msl.ts');
    await fs.writeFile(path.join(root, 'Examples', 'Demo.mo'), 'model Demo');
    const broken = spawnSync(process.execPath, ['--import', 'tsx', script, root], { encoding: 'utf8' });
    assert.equal(broken.status, 1, broken.stderr);
    assert.match(broken.stdout, /1 files with diagnostics/);
    const missing = spawnSync(process.execPath, ['--import', 'tsx', script], { encoding: 'utf8' });
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /Usage:/);
  });
});

