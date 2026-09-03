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

import { ModelicaProject, ModelicaLibrary } from '..';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initializeParser } from '../../parser';

const TEST_LIBRARY_PATH = path.join(__dirname, 'TestLibrary 1.0.0');
const TEST_PACKAGE_PATH = path.join(TEST_LIBRARY_PATH, 'package.mo');
const TEST_CLASS_PATH = path.join(TEST_LIBRARY_PATH, 'HalfAdder.mo');
const SUB_PACKAGE_PATH = path.join(TEST_LIBRARY_PATH, 'Sub');

const TEST_PACKAGE_CONTENT = `package TestLibrary
  annotation(version="1.0.0");
end TestLibrary;
`;

describe('ModelicaProject', () => {
  describe('an empty project', () => {
    let project: ModelicaProject;
    let orphanDirectory: string;
    let orphanPath: string;

    before(() => {
      // A document that belongs to no library on disk: it has a within clause,
      // so it cannot be loaded as a standalone document, and there is no
      // `package.mo` beside it, so no library root can be discovered either.
      orphanDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'modelica-ls-test-'));
      orphanPath = path.join(orphanDirectory, 'Orphan.mo');
      fs.writeFileSync(orphanPath, 'within TestLibrary;\n\nmodel Orphan\nend Orphan;\n', 'utf-8');
    });

    after(() => {
      fs.rmSync(orphanDirectory, { recursive: true, force: true });
    });

    beforeEach(async () => {
      const parser = await initializeParser();
      project = new ModelicaProject(parser);
    });

    it('should have no libraries', () => {
      assert.equal(project.libraries.length, 0);
    });

    it('updating and deleting documents outside any library does nothing', async () => {
      // This used to be asserted with a document from TestLibrary. Such a
      // document is now discovered and loaded on demand, so the claim only
      // holds for a document no library on disk contains.
      assert(!await project.updateDocument(orphanPath, 'file content'));
      assert(!await project.removeDocument(orphanPath));
    });

    it('adds a document by discovering the library its within clause names', async () => {
      // HalfAdder.mo declares `within TestLibrary;` and no library is loaded,
      // so it can only be added by finding the library root on disk. A client
      // that opens a file before (or without) announcing its library depends
      // on this; otherwise the document is never loaded and nothing in it
      // resolves.
      const document = await project.addDocument(TEST_CLASS_PATH);
      assert.ok(document, 'expected the document to be added');
      assert.equal(project.libraries.length, 1);
      assert.equal(project.libraries[0].name, 'TestLibrary');
      // The whole library is loaded, not just the document that was opened.
      assert.notEqual(await project.getDocument(TEST_PACKAGE_PATH), undefined);
    });

    it('updating a document discovers its library too', async () => {
      assert(await project.updateDocument(TEST_CLASS_PATH, 'within TestLibrary;\n'));
      assert.equal(project.libraries.length, 1);
    });

    it('does not add a document that no library on disk contains', async () => {
      assert.equal(await project.addDocument(orphanPath), undefined);
      assert.equal(project.libraries.length, 0);
    });

    it('names a library after its root, not the subfolder it was found from', async () => {
      // ModelicaLibrary.load walks up to the real root when pointed at a child
      // folder, but used to keep the child's name: loading
      // 'TestLibrary 1.0.0/Sub' gave a library called 'Sub' rooted at
      // 'TestLibrary 1.0.0', so nothing could resolve 'TestLibrary.*' against
      // it. Discovering a library from a document inside a subpackage makes
      // this the common case.
      const library = await ModelicaLibrary.load(project, SUB_PACKAGE_PATH, false);
      assert.equal(library.name, 'TestLibrary');
      assert.equal(library.path, TEST_LIBRARY_PATH);
    });
  });

  describe('when adding a library', async () => {
    let project: ModelicaProject;
    let library: ModelicaLibrary;

    beforeEach(async () => {
      const parser = await initializeParser();
      project = new ModelicaProject(parser);
      library = await ModelicaLibrary.load(project, TEST_LIBRARY_PATH, false);
      project.addLibrary(library);
    });

    it('should add the library', () => {
      assert.equal(project.libraries.length, 1);
      assert.equal(project.libraries[0], library);
      assert.equal(project.libraries[0].name, "TestLibrary");
    });

    it('should add all the documents in the library', async () => {
      assert.notEqual(await project.getDocument(TEST_PACKAGE_PATH), undefined);
      assert.notEqual(await project.getDocument(TEST_CLASS_PATH), undefined);

      assert.equal(
        library.documents.get(TEST_PACKAGE_PATH),
        await project.getDocument(TEST_PACKAGE_PATH),
      );
      assert.equal(library.documents.get(TEST_CLASS_PATH), await project.getDocument(TEST_CLASS_PATH));
    });

    it('repeatedly adding documents has no effect', async () => {
      for (let i = 0; i < 5; i++) {
        assert(!(await project.addDocument(TEST_PACKAGE_PATH)));
        assert(!(await project.addDocument(TEST_CLASS_PATH)));
      }
    });

    it('documents can be updated', async () => {
      const document = await project.getDocument(TEST_PACKAGE_PATH);
      assert.ok(document);
      assert.equal(
        document.getText().replace(/\r\n/g, '\n'),
        TEST_PACKAGE_CONTENT.replace(/\r\n/g, '\n'),
      );

      const newContent = `within;

package TestLibrary
  annotation(version="1.0.1");
end TestLibrary;
`;
      assert(await project.updateDocument(document.path, newContent));
      assert.equal(document.getText(), newContent);
    });

    it('documents can be removed (and re-added)', async () => {
      assert.notEqual(await project.getDocument(TEST_CLASS_PATH), undefined);

      assert(await project.removeDocument(TEST_CLASS_PATH));

      // no effect -- already removed
      assert(!await project.removeDocument(TEST_CLASS_PATH));

      // can re-add document without issues
      assert(await project.addDocument(TEST_CLASS_PATH));
      assert.notEqual(await project.getDocument(TEST_CLASS_PATH), undefined);
    });
  });
});
