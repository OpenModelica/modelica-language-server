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

import * as assert from 'assert';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { hostTriple, version, versionInfo } from '../version';

const serverDir = path.join(__dirname, '..', '..');
const packageVersion = JSON.parse(
  fs.readFileSync(path.join(serverDir, 'package.json'), 'utf-8'),
).version;

describe('version', () => {
  it('is the version from package.json', () => {
    assert.equal(version, packageVersion);
  });

  it('versionInfo lists version, target triple and Node.js version', () => {
    assert.deepEqual(versionInfo().split('\n'), [
      `modelica-language-server ${packageVersion}`,
      `target: ${hostTriple()}`,
      `node: ${process.version}`,
    ]);
  });
});

describe('hostTriple', () => {
  it('names the published platforms', () => {
    assert.equal(hostTriple('linux', 'x64', 'gnu'), 'x86_64-unknown-linux-gnu');
    assert.equal(hostTriple('linux', 'arm64', 'gnu'), 'aarch64-unknown-linux-gnu');
    assert.equal(hostTriple('linux', 'x64', 'musl'), 'x86_64-unknown-linux-musl');
    assert.equal(hostTriple('darwin', 'arm64'), 'aarch64-apple-darwin');
    assert.equal(hostTriple('darwin', 'x64'), 'x86_64-apple-darwin');
    assert.equal(hostTriple('win32', 'x64'), 'x86_64-pc-windows-msvc');
  });

  it('keeps Node names it does not map', () => {
    assert.equal(hostTriple('freebsd', 'riscv64'), 'riscv64-unknown-freebsd');
  });

  it('detects the C library on Linux', function () {
    if (process.platform !== 'linux') {
      this.skip();
    }
    assert.match(hostTriple(), /-unknown-linux-(gnu|musl)$/);
  });
});

describe('modelica-language-server --version', () => {
  it('prints the version information and exits without a transport', function () {
    this.timeout(30000);
    const result = spawnSync(
      process.execPath,
      ['--require', 'tsx/cjs', path.join(serverDir, 'src', 'server.ts'), '--version'],
      { cwd: serverDir, encoding: 'utf-8' },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, `${versionInfo()}\n`);
  });
});
