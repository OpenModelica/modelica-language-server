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
import * as path from 'node:path';
import * as url from 'node:url';

import Analyzer from '../analyzer';
import { initializeParser } from '../parser';

describe('Analyzer.loadLibrary', () => {
  let analyzer: Analyzer;

  beforeEach(async () => {
    const parser = await initializeParser();
    analyzer = new Analyzer(parser);
  });

  // Regression test for https://github.com/OpenModelica/modelica-language-server/issues/49
  it('skips a configured library whose path does not exist without throwing', async () => {
    const missingPath = path.join(__dirname, 'this-library-does-not-exist');
    const missingUri = url.pathToFileURL(missingPath).toString();

    assert.equal(await analyzer.loadLibrary(missingUri, false), false);
  });

  it('skips a workspace whose path does not exist without throwing', async () => {
    const missingPath = path.join(__dirname, 'this-workspace-does-not-exist');
    const missingUri = url.pathToFileURL(missingPath).toString();

    assert.equal(await analyzer.loadLibrary(missingUri, true), false);
  });
});

describe('Analyzer.unloadLibrary', () => {
  const FIXTURES = path.join(__dirname, 'fixtures');
  const LIB_A = path.join(FIXTURES, 'RuntimeLoadLibA');
  const libAUri = url.pathToFileURL(LIB_A).toString();

  let analyzer: Analyzer;

  beforeEach(async () => {
    const parser = await initializeParser();
    analyzer = new Analyzer(parser);
  });

  it('unloads a loaded library and reports its path once', async () => {
    assert.equal(await analyzer.loadLibrary(libAUri, false), true);

    assert.deepEqual(analyzer.unloadLibrary(libAUri), [LIB_A]);
    // Already gone: a second unload finds nothing to remove.
    assert.deepEqual(analyzer.unloadLibrary(libAUri), []);
  });

  it('unloads libraries nested under a removed root', async () => {
    assert.equal(await analyzer.loadLibrary(libAUri, false), true);

    const removed = analyzer.unloadLibrary(url.pathToFileURL(FIXTURES).toString());
    assert.ok(removed.includes(LIB_A), `expected ${LIB_A} to be unloaded, got ${JSON.stringify(removed)}`);
  });

  it('returns an empty list when no loaded library matches', () => {
    assert.deepEqual(analyzer.unloadLibrary(libAUri), []);
  });
});
