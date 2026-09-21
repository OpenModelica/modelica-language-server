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

/* -----------------------------------------------------------------------------
 * Regression tests for a real interleaving that lazy library loading turned
 * from a rare edge case into a routine one: `ModelicaProject.addDocument`
 * suspends on an `await fs.readFile(...)`, and while it's suspended, another
 * request handler can run to completion on the same connection (e.g. a
 * `textDocument/definition` that synchronously loads and caches the same
 * file via `ModelicaLibrary.getOrLoadDocument`, or a workspace folder
 * removal). These tests drive that suspension deterministically with a FIFO
 * (a real blocking read, released on cue) instead of guessing at scheduling.
 * -----------------------------------------------------------------------------
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as fsPromises from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { ModelicaProject, ModelicaLibrary, ModelicaDocument } from '..';
import { initializeParser } from '../../parser';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { pathToUri } from '../../util';

const PACKAGE_CONTENT = `package FifoLib\nend FifoLib;\n`;
const CLASS_CONTENT_ON_DISK = `within FifoLib;\nmodel Late\nend Late;\n`;

/** Creates a scratch library on disk with a `package.mo` and an unwritten FIFO at `<dir>/<fifoName>`. */
function makeScratchLibraryWithFifo(fifoName: string): { dir: string; fifoPath: string } {
  const dir = fsSync.mkdtempSync(path.join(os.tmpdir(), 'modelica-ls-fifo-test-'));
  fsSync.writeFileSync(path.join(dir, 'package.mo'), PACKAGE_CONTENT, 'utf-8');
  const fifoPath = path.join(dir, fifoName);
  execFileSync('mkfifo', [fifoPath]);
  return { dir, fifoPath };
}

function makeDocument(project: ModelicaProject, library: ModelicaLibrary, filePath: string, content: string): ModelicaDocument {
  const uri = pathToUri(filePath);
  const textDocument = TextDocument.create(uri, 'modelica', 0, content);
  const tree = project.parser.parse(content);
  assert.ok(tree);
  return new ModelicaDocument(project, library, textDocument, tree);
}

// These tests use a POSIX FIFO (`mkfifo`) to deterministically suspend a real
// `fs.readFile` and release it on cue, instead of guessing at scheduling.
// There's no equivalent on Windows, and CI only runs this suite on
// ubuntu-latest (see .github/workflows/test.yml), so skip rather than fail
// `npm test` for a contributor running it locally on Windows.
const describeOnFifoSupportingPlatforms = process.platform === 'win32' ? describe.skip : describe;

describeOnFifoSupportingPlatforms('concurrent document loading', () => {
  let project: ModelicaProject;
  let scratchDirs: string[];

  beforeEach(async () => {
    const parser = await initializeParser();
    project = new ModelicaProject(parser);
    scratchDirs = [];
  });

  afterEach(() => {
    for (const dir of scratchDirs) {
      fsSync.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not clobber a document another loader already published while its own read was in flight', async function () {
    this.timeout(10_000);

    const { dir, fifoPath } = makeScratchLibraryWithFifo('Late.mo');
    scratchDirs.push(dir);
    const library = await ModelicaLibrary.load(project, dir, false);
    project.addLibrary(library);

    // Start loading the fifo path; this suspends on the blocking read below,
    // exactly like a suspended `await fs.readFile` on a slow real file.
    const pending = project.addDocument(fifoPath);

    // While that read is still blocked, something else (symbol resolution's
    // synchronous ModelicaLibrary.getOrLoadDocument, or a second concurrent
    // addDocument) publishes a document for the same path, and it gets
    // edited before the suspended load ever resumes.
    const winner = makeDocument(project, library, fifoPath, CLASS_CONTENT_ON_DISK);
    assert.equal(library.publishDocument(fifoPath, winner), winner);
    winner.update('within FifoLib;\nmodel Late\n  Real edited = 1;\nend Late;\n');

    let winnerTreeDeleted = false;
    const originalDelete = winner.tree.delete.bind(winner.tree);
    winner.tree.delete = () => {
      winnerTreeDeleted = true;
      originalDelete();
    };

    // Release the blocked read now; addDocument's own parse arrives late.
    await fsPromises.writeFile(fifoPath, CLASS_CONTENT_ON_DISK, 'utf-8');
    const result = await pending;

    assert.equal(result, winner, 'expected the already-published document to remain canonical');
    assert.equal(library.documents.get(fifoPath), winner);
    assert.ok(
      result?.getText().includes('edited'),
      'expected the edit applied before the late load resumed to survive',
    );
    assert.ok(!winnerTreeDeleted, 'the winning document must not be disposed');
  });

  it('discards its result if the library is unloaded while the load is in flight', async function () {
    this.timeout(10_000);

    const { dir, fifoPath } = makeScratchLibraryWithFifo('Removed.mo');
    scratchDirs.push(dir);
    const library = await ModelicaLibrary.load(project, dir, false);
    project.addLibrary(library);

    const pending = project.addDocument(fifoPath);

    // Unload the library while the read above is still blocked - e.g. the
    // user removed the workspace folder while this file was being opened.
    const removed = project.removeLibrariesUnder(dir);
    assert.deepEqual(removed, [dir]);
    assert.equal(project.libraries.length, 0);

    await fsPromises.writeFile(fifoPath, CLASS_CONTENT_ON_DISK, 'utf-8');
    const result = await pending;

    assert.equal(result, undefined, 'a load into an unloaded library must not be returned as usable');
    assert.equal(project.libraries.length, 0, 'the unloaded library must not be resurrected');
  });
});
