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
import assert from 'node:assert/strict';
import path from 'node:path';
import { ModelicaProject, ModelicaLibrary, ModelicaDocument } from '../../project';
import { initializeParser } from '../../parser';
import resolveReference from '../resolveReference';
import {
  UnresolvedAbsoluteReference,
  UnresolvedRelativeReference,
  ResolvedReference,
} from '../reference';
import * as TreeSitterUtil from '../../util/tree-sitter';

const TEST_LIBRARY_PATH = path.join(__dirname, 'TestLibrary');
const TEST_CLASS_PATH = path.join(TEST_LIBRARY_PATH, 'TestPackage', 'TestClass.mo');
const CONSTANTS_PATH = path.join(TEST_LIBRARY_PATH, 'Constants.mo');

describe('resolveReference', () => {
  let project: ModelicaProject;

  beforeEach(async () => {
    const parser = await initializeParser();
    project = new ModelicaProject(parser);
    project.addLibrary(await ModelicaLibrary.load(project, TEST_LIBRARY_PATH, true));
  });

  it('should resolve absolute references to classes', async () => {
    const unresolved = new UnresolvedAbsoluteReference(['TestLibrary', 'TestPackage', 'TestClass']);
    const resolved = resolveReference(project, unresolved, 'declaration');

    const resolvedDocument = await project.getDocument(TEST_CLASS_PATH);
    assert(resolvedDocument !== undefined);

    // Get node declaring `TestClass`
    const resolvedNode = TreeSitterUtil.findFirst(
      resolvedDocument.tree.rootNode,
      (node) =>
        node.type === 'class_definition' && TreeSitterUtil.getIdentifier(node) === 'TestClass',
    )!;
    const resolvedSymbols = ['TestLibrary', 'TestPackage', 'TestClass'];

    assert(
      resolved?.equals(
        new ResolvedReference(resolvedDocument, resolvedNode, resolvedSymbols, 'class'),
      ),
    );
  });

  it('should resolve absolute references to variables', async () => {
    const unresolved = new UnresolvedAbsoluteReference(['TestLibrary', 'Constants', 'e']);
    const resolved = resolveReference(project, unresolved, 'declaration');

    const resolvedDocument = (await project.getDocument(CONSTANTS_PATH))!;

    // Get the node declaring `e`
    const resolvedNode = TreeSitterUtil.findFirst(
      resolvedDocument.tree.rootNode,
      (node) =>
        node.type === 'component_clause' && TreeSitterUtil.getDeclaredIdentifiers(node)[0] === 'e',
    )!;
    const resolvedSymbols = ['TestLibrary', 'Constants', 'e'];

    assert(
      resolved?.equals(
        new ResolvedReference(resolvedDocument, resolvedNode, resolvedSymbols, 'variable'),
      ),
    );
  });

  it('should resolve relative references to locals', async () => {
    const document = (await project.getDocument(TEST_CLASS_PATH))!;
    const unresolvedNode = TreeSitterUtil.findFirst(
      document.tree.rootNode,
      (node) => node.startPosition.row === 7 && node.startPosition.column === 21,
    )!;
    const unresolved = new UnresolvedRelativeReference(document, unresolvedNode, ['tau']);
    const resolved = resolveReference(project, unresolved, 'declaration');

    // the resolved node is the declaration of tau
    // `input Real tau = 2 * pi;`
    const resolvedNode = TreeSitterUtil.findFirst(
      document.tree.rootNode,
      (node) =>
        node.type === 'component_clause' &&
        TreeSitterUtil.getDeclaredIdentifiers(node)[0] === 'tau',
    )!;

    assert(
      resolved?.equals(
        new ResolvedReference(
          document,
          resolvedNode,
          ['TestLibrary', 'TestPackage', 'TestClass', 'tau'],
          'variable',
        ),
      ),
    );
  });

  it('should resolve relative references to globals', async () => {
    // input Real twoE = 2 * Constants.e;
    //                                 ^ 5:33
    const unresolvedDocument = (await project.getDocument(TEST_CLASS_PATH))!;
    const unresolvedNode = TreeSitterUtil.findFirst(
      unresolvedDocument.tree.rootNode,
      (node) => node.startPosition.row === 5 && node.startPosition.column === 33,
    )!;
    const unresolved = new UnresolvedRelativeReference(unresolvedDocument, unresolvedNode, [
      'Constants',
      'e',
    ]);
    const resolved = resolveReference(project, unresolved, 'declaration');

    const resolvedDocument = (await project.getDocument(CONSTANTS_PATH))!;
    // Get the node declaring `e`
    const resolvedNode = TreeSitterUtil.findFirst(
      resolvedDocument.tree.rootNode,
      (node) =>
        node.type === 'component_clause' && TreeSitterUtil.getDeclaredIdentifiers(node)[0] === 'e',
    )!;

    assert(
      resolved?.equals(
        new ResolvedReference(
          resolvedDocument,
          resolvedNode,
          ['TestLibrary', 'Constants', 'e'],
          'variable',
        ),
      ),
    );
  });
});
