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

import * as assert from 'node:assert/strict';
import * as path from 'node:path';
import { ModelicaProject, ModelicaLibrary, ModelicaDocument } from '..';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { initializeParser } from '../../parser';
import { pathToUri } from '../../util';

// Fake directory path
const TEST_PACKAGE_ROOT = path.join(__dirname, 'TestPackage');
const TEST_PACKAGE_CONTENT = `package TestPackage
  annotation(version="1.0.0");
end Test;
`;
const UPDATED_TEST_PACKAGE_CONTENT = `package TestPackage
  annotation(version="1.0.1");
end Test;
`;
const TEST_CLASS_CONTENT = `within TestPackage.Foo.Bar;

class Frobnicator
end Frobnicator;
`;

function createTextDocument(filePath: string, content: string): TextDocument {
  const absolutePath = path.join(TEST_PACKAGE_ROOT, filePath);
  const uri = pathToUri(absolutePath);
  return TextDocument.create(uri, 'modelica', 0, content);
}

describe('ModelicaDocument', () => {
  let project: ModelicaProject;
  let library: ModelicaLibrary;

  beforeEach(async () => {
    const parser = await initializeParser();
    project = new ModelicaProject(parser);
    project.addLibrary(library);
    library = new ModelicaLibrary(project, TEST_PACKAGE_ROOT, true);
  });

  it('can update the entire document', () => {
    const textDocument = createTextDocument('.', TEST_PACKAGE_CONTENT);
    const tree = project.parser.parse(TEST_PACKAGE_CONTENT);
    const document = new ModelicaDocument(project, library, textDocument, tree);
    document.update(UPDATED_TEST_PACKAGE_CONTENT);

    assert.equal(document.getText().trim(), UPDATED_TEST_PACKAGE_CONTENT.trim());
  });

  it('can update incrementally', () => {
    const textDocument = createTextDocument('.', TEST_PACKAGE_CONTENT);
    const tree = project.parser.parse(TEST_PACKAGE_CONTENT);
    const document = new ModelicaDocument(project, library, textDocument, tree);
    document.update(
      '1.0.1',
      {
        start: {
          line: 1,
          character: 22,
        },
        end: {
          line: 1,
          character: 27,
        },
      }
    );

    assert.equal(document.getText().trim(), UPDATED_TEST_PACKAGE_CONTENT.trim());
  });

  it('a file with no `within` clause has the correct package path', () => {
    const textDocument = createTextDocument('./package.mo', TEST_PACKAGE_CONTENT);
    const tree = project.parser.parse(TEST_PACKAGE_CONTENT);
    const document = new ModelicaDocument(project, library, textDocument, tree);

    assert.deepEqual(document.within, []);
  });

  it('a file with a `within` clause has the correct package path', () => {
    const textDocument = createTextDocument('./Foo/Bar/Frobnicator.mo', TEST_CLASS_CONTENT);
    const tree = project.parser.parse(TEST_CLASS_CONTENT);
    const document = new ModelicaDocument(project, library, textDocument, tree);

    assert.deepEqual(document.within, ['TestPackage', 'Foo', 'Bar']);
  });
});
