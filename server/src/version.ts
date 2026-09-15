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

import fs from 'node:fs';
import path from 'node:path';

// Replaced by the version from server/package.json when esbuild bundles the
// server, so the standalone binary knows its version without a package.json
// beside it. Unbundled runs (the tests) read package.json instead.
declare const __MODELICA_LS_VERSION__: string | undefined;

export const serverName = 'modelica-language-server';

export const version: string =
  typeof __MODELICA_LS_VERSION__ === 'string'
    ? __MODELICA_LS_VERSION__
    : JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8')).version;

// Node's architecture names, spelled the way target triples spell them.
// Architectures missing here keep Node's name.
const tripleArch: Partial<Record<NodeJS.Architecture, string>> = {
  x64: 'x86_64',
  arm64: 'aarch64',
  ia32: 'i686',
};

function detectLibc(): 'gnu' | 'musl' {
  const report = process.report?.getReport() as { header?: { glibcVersionRuntime?: string } };
  return report?.header?.glibcVersionRuntime ? 'gnu' : 'musl';
}

/**
 * Target triple of the platform the server runs on, e.g.
 * `x86_64-unknown-linux-gnu`. For the standalone binary this is the platform
 * its embedded Node.js runtime was built for.
 *
 * @param platform  Operating system, defaults to the current one.
 * @param arch      CPU architecture, defaults to the current one.
 * @param libc      C library on Linux, detected when not given.
 * @returns         The target triple.
 */
export function hostTriple(
  platform: NodeJS.Platform = process.platform,
  arch: NodeJS.Architecture = process.arch,
  libc?: 'gnu' | 'musl',
): string {
  const cpu = tripleArch[arch] ?? arch;
  switch (platform) {
    case 'linux':
      return `${cpu}-unknown-linux-${libc ?? detectLibc()}`;
    case 'darwin':
      return `${cpu}-apple-darwin`;
    case 'win32':
      return `${cpu}-pc-windows-msvc`;
    default:
      return `${cpu}-unknown-${platform}`;
  }
}

/**
 * Text printed by `--version`: the server version, the target triple and the
 * Node.js runtime version, one per line.
 */
export function versionInfo(): string {
  return [
    `${serverName} ${version}`,
    `target: ${hostTriple()}`,
    `node: ${process.version}`,
  ].join('\n');
}
