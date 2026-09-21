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
import path from 'node:path';

import { ModelicaProject, ModelicaLibrary, ModelicaDocument } from '..';
import { initializeParser } from '../../parser';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { pathToUri } from '../../util';

const TEST_LIBRARY_PATH = path.join(__dirname, 'TestLibrary 1.0.0');

describe('ModelicaLibrary.publishDocument', () => {
  let project: ModelicaProject;
  let library: ModelicaLibrary;

  beforeEach(async () => {
    const parser = await initializeParser();
    project = new ModelicaProject(parser);
    library = new ModelicaLibrary(project, TEST_LIBRARY_PATH, false);
  });

  function makeDocument(filePath: string, content: string): ModelicaDocument {
    const uri = pathToUri(filePath);
    const textDocument = TextDocument.create(uri, 'modelica', 0, content);
    const tree = project.parser.parse(content);
    assert.ok(tree);
    return new ModelicaDocument(project, library, textDocument, tree);
  }

  it('publishes a document when nothing is cached for its path yet', () => {
    const filePath = path.join(TEST_LIBRARY_PATH, 'HalfAdder.mo');
    const document = makeDocument(filePath, 'within TestLibrary;\nmodel HalfAdder\nend HalfAdder;\n');

    const published = library.publishDocument(filePath, document);

    assert.equal(published, document);
    assert.equal(library.documents.get(filePath), document);
  });

  it('keeps the already-cached document and frees a redundant parse', () => {
    // Regression test: a synchronous getOrLoadDocument (symbol resolution)
    // and an asynchronous addDocument (opening/creating a file) both load
    // the same path independently; the loser of the race must not clobber
    // the winner, and must free the tree it produced instead of leaking it.
    const filePath = path.join(TEST_LIBRARY_PATH, 'HalfAdder.mo');
    const winner = makeDocument(filePath, 'within TestLibrary;\nmodel HalfAdder\nend HalfAdder;\n');
    assert.equal(library.publishDocument(filePath, winner), winner);

    const loser = makeDocument(filePath, 'within TestLibrary;\nmodel HalfAdder\nend HalfAdder;\n');
    let loserTreeDeleted = false;
    loser.tree.delete = () => {
      loserTreeDeleted = true;
    };

    const published = library.publishDocument(filePath, loser);

    assert.equal(published, winner, 'expected the already-cached document to remain canonical');
    assert.equal(library.documents.get(filePath), winner);
    assert.ok(loserTreeDeleted, 'expected the redundant parse to be freed');
  });

  it('frees the document and returns undefined once the library has been removed', () => {
    // Regression test: a document load in flight when its library is
    // unloaded (e.g. a workspace folder removed while a file inside it is
    // still being opened) must not resurrect the library with a document
    // nothing will ever dispose.
    const filePath = path.join(TEST_LIBRARY_PATH, 'HalfAdder.mo');
    const document = makeDocument(filePath, 'within TestLibrary;\nmodel HalfAdder\nend HalfAdder;\n');

    let treeDeleted = false;
    document.tree.delete = () => {
      treeDeleted = true;
    };

    library.markRemoved();
    const published = library.publishDocument(filePath, document);

    assert.equal(published, undefined);
    assert.equal(library.documents.get(filePath), undefined);
    assert.ok(treeDeleted, 'expected the late-arriving document to be freed');
  });
});
