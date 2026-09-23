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


import fs from 'node:fs/promises';
import path from 'node:path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { pathToFileURL } from 'node:url';
import { initializeParser } from '../parser';
import { syntaxDiagnostics } from '../util/diagnostics';

async function* modelicaFiles(directory: string): AsyncGenerator<string> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* modelicaFiles(filename);
    else if (entry.isFile() && entry.name.endsWith('.mo')) yield filename;
  }
}

/** Check all source files, including example classes embedded in package files. */
export async function checkMsl(
  root: string,
  log: (message: string) => void = console.log,
): Promise<{ files: number; failedFiles: number; diagnostics: number }> {
  // Wrong paths must fail rather than silently turning this check into a no-op.
  await fs.access(path.join(root, 'package.mo'));
  const parser = await initializeParser();
  let files = 0;
  let failedFiles = 0;
  let diagnostics = 0;
  try {
    for await (const filename of modelicaFiles(root)) {
      const text = await fs.readFile(filename, 'utf8');
      const document = TextDocument.create(pathToFileURL(filename).toString(), 'modelica', 1, text);
      // Use the throwing collector, not the editor's recovery wrapper:
      // a parser failure must fail CI, not count as a clean file.
      const reports = syntaxDiagnostics(parser, document);
      files++;
      if (reports.length) failedFiles++;
      diagnostics += reports.length;
      for (const report of reports) {
        log(path.relative(root, filename) + ':' + (report.range.start.line + 1) + ':' +
          (report.range.start.character + 1) + ': ' + report.message);
      }
      if (files % 250 === 0) log('Checked ' + files + ' Modelica files...');
    }
  } finally {
    parser.delete();
  }
  if (!files) throw new Error('No Modelica files found');
  log('MSL sanity: ' + files + ' files checked, ' + failedFiles + ' files with diagnostics, ' + diagnostics + ' diagnostics.');
  return { files, failedFiles, diagnostics };
}

if (require.main === module) {
  const root = process.argv[2];
  if (!root || process.argv.length !== 3) {
    console.error('Usage: npm run test:msl -- /path/to/ModelicaStandardLibrary/Modelica');
    process.exitCode = 1;
  } else {
    checkMsl(path.resolve(root)).then(result => {
      if (result.failedFiles) process.exitCode = 1;
    }).catch(error => {
      console.error(error);
      process.exitCode = 1;
    });
  }
}
