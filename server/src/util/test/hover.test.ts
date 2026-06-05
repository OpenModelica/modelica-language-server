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

import assert from 'node:assert/strict';
import path from 'node:path';
import * as LSP from 'vscode-languageserver/node';
import { initializeParser } from '../../parser';
import Analyzer from '../../analyzer';
import { ModelicaLibrary, ModelicaProject } from '../../project';
import { extractHoverInformation } from '../hoverUtil';
import * as TreeSitterUtil from '../tree-sitter';
import { pathToUri } from '../index';

const TEST_LIBRARY_PATH = path.join(
  __dirname,
  '../../analysis/test/TestLibrary',
);
const TEST_CLASS_PATH = path.join(
  TEST_LIBRARY_PATH,
  'TestPackage',
  'TestClass.mo',
);

describe('extractHoverInformation', () => {
  it('returns null for non-class_definition nodes', async () => {
    const parser = await initializeParser();
    const tree = parser.parse('function Foo input Real x; end Foo;');
    assert.ok(tree);
    // Pass the root node (stored_definitions), not a class_definition
    const result = extractHoverInformation(tree.rootNode);
    assert.equal(result, null);
  });

  it('returns hover content for a function with inputs', async () => {
    const parser = await initializeParser();
    const project = new ModelicaProject(parser);
    project.addLibrary(await ModelicaLibrary.load(project, TEST_LIBRARY_PATH, true));

    const document = await project.getDocument(TEST_CLASS_PATH);
    assert.ok(document);

    const classDefNode = TreeSitterUtil.findFirst(
      document.tree.rootNode,
      (n) => n.type === 'class_definition' && TreeSitterUtil.hasIdentifier(n, 'TestClass'),
    );
    assert.ok(classDefNode, 'TestClass class_definition not found');

    const result = extractHoverInformation(classDefNode);
    assert.ok(result, 'Expected non-null hover content');
    assert.ok(result.includes('TestClass'), 'Expected class name in hover');
    assert.ok(result.includes('**Inputs**'), 'Expected inputs section in hover');
    assert.ok(result.includes('twoE'), 'Expected input twoE in hover');
  });
});

describe('Analyzer.findHoverInfo', () => {
  let analyzer: Analyzer;

  beforeEach(async () => {
    const parser = await initializeParser();
    analyzer = new Analyzer(parser);
    await analyzer.loadLibrary(pathToUri(TEST_LIBRARY_PATH), true);
  });

  it('returns hover info when hovering on a class name in its definition', async () => {
    // `function TestClass` — position (4, 9) is on 'T' of TestClass
    const uri = pathToUri(TEST_CLASS_PATH);
    const position: LSP.Position = { line: 4, character: 9 };

    const hover = await analyzer.findHoverInfo(uri, position);
    assert.ok(hover, 'Expected non-null hover for class definition');

    const content = (hover.contents as LSP.MarkupContent).value;
    assert.ok(content.includes('TestClass'), 'Expected class name in hover content');
    assert.ok(content.includes('**Inputs**'), 'Expected inputs section');
  });

  it('returns hover info for a fully qualified class name reference', async () => {
    // In Constants.mo: `package Constants` on line 2 (0-indexed)
    // hover on 'C' at (2, 8)
    const constantsPath = path.join(TEST_LIBRARY_PATH, 'Constants.mo');
    const uri = pathToUri(constantsPath);
    const position: LSP.Position = { line: 2, character: 8 };

    const hover = await analyzer.findHoverInfo(uri, position);
    assert.ok(hover, 'Expected non-null hover for package class');
    const content = (hover.contents as LSP.MarkupContent).value;
    assert.ok(content.includes('Constants'), 'Expected class name in hover');
  });

  it('resolves a qualified within-clause reference to the top-level library', async () => {
    // In TestClass.mo line 0: `within TestLibrary.TestPackage;`
    // Hovering on 'T' (col 7) resolves 'TestLibrary' via the qualified name.
    const uri = pathToUri(TEST_CLASS_PATH);
    // col 7 = start of 'TestLibrary' in the within clause
    const position: LSP.Position = { line: 0, character: 7 };

    const hover = await analyzer.findHoverInfo(uri, position);
    assert.ok(hover, 'Expected hover for qualified name in within clause');
    const content = (hover.contents as LSP.MarkupContent).value;
    assert.ok(content.includes('TestLibrary'), 'Expected library name in hover content');
  });
});
