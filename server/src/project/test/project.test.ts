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

import Parser from 'web-tree-sitter';
import { ModelicaProject, ModelicaLibrary } from '..';
import assert from 'node:assert/strict';
import path from 'node:path';
import { initializeParser } from '../../parser';

const TEST_LIBRARY_PATH = path.join(__dirname, 'TestLibrary');
const TEST_PACKAGE_PATH = path.join(TEST_LIBRARY_PATH, 'package.mo');
const TEST_CLASS_PATH = path.join(TEST_LIBRARY_PATH, 'HalfAdder.mo');

const TEST_PACKAGE_CONTENT = `package TestLibrary
  annotation(version="1.0.0");
end TestLibrary;
`;

describe('ModelicaProject', () => {
  describe('an empty project', () => {
    let project: ModelicaProject;

    beforeEach(async () => {
      const parser = await initializeParser();
      project = new ModelicaProject(parser);
    });

    it('should have no libraries', () => {
      assert.equal(project.libraries.length, 0);
    });

    it('should not allow loading documents', () => {
      assert.rejects(async () => {
        await project.addDocument(TEST_CLASS_PATH);
      });
      assert.equal(project.getDocument(TEST_CLASS_PATH), undefined);
    });

    it('updating and deleting documents does nothing', () => {
      assert(!project.updateDocument(TEST_CLASS_PATH, 'file content'));
      assert(!project.removeDocument(TEST_CLASS_PATH));
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
    });

    it('should add all the documents in the library', async () => {
      assert.notEqual(project.getDocument(TEST_PACKAGE_PATH), undefined);
      assert.notEqual(project.getDocument(TEST_CLASS_PATH), undefined);

      assert.equal(
        library.documents.get(TEST_PACKAGE_PATH),
        project.getDocument(TEST_PACKAGE_PATH),
      );
      assert.equal(library.documents.get(TEST_CLASS_PATH), project.getDocument(TEST_CLASS_PATH));
    });

    it('repeatedly adding documents has no effect', async () => {
      for (let i = 0; i < 5; i++) {
        assert(!(await project.addDocument(TEST_PACKAGE_PATH)));
        assert(!(await project.addDocument(TEST_CLASS_PATH)));
      }
    });

    it('documents can be updated', () => {
      const document = project.getDocument(TEST_PACKAGE_PATH)!;
      assert.equal(
        document.getText().replace(/\r\n/g, '\n'),
        TEST_PACKAGE_CONTENT.replace(/\r\n/g, '\n'),
      );

      const newContent = `within;

package TestLibrary
  annotation(version="1.0.1");
end TestLibrary;
`;
      assert(project.updateDocument(document.path, newContent));
      assert.equal(document.getText(), newContent);
    });

    it('documents can be removed (and re-added)', async () => {
      assert.notEqual(project.getDocument(TEST_CLASS_PATH), undefined);

      assert(project.removeDocument(TEST_CLASS_PATH));
      assert.equal(project.getDocument(TEST_CLASS_PATH), undefined);

      // no effect -- already removed
      assert(!project.removeDocument(TEST_CLASS_PATH));

      // can re-add document without issues
      assert(await project.addDocument(TEST_CLASS_PATH));
      assert.notEqual(project.getDocument(TEST_CLASS_PATH), undefined);
    });
  });
});
