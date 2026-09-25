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
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import os from 'node:os';
import { Parser } from 'web-tree-sitter';
import { TextDocument } from 'vscode-languageserver-textdocument';
import Analyzer from '../analyzer';
import { initializeParser } from '../parser';

describe('Go to Type Definition', () => {
  let parser: Parser;
  let analyzer: Analyzer;
  let directory: string;
  let library: string;
  beforeEach(async () => {
    parser = await initializeParser();
    analyzer = new Analyzer(parser);
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'modelica-types-'));
    library = path.join(directory, 'Nav');
    await fs.mkdir(library);
  });
  afterEach(async () => {
    analyzer.unloadLibrary(pathToFileURL(library).toString());
    parser.delete();
    await fs.rm(directory, { recursive: true, force: true });
  });
  async function check(marked: string, target: string | null) {
    const offset = marked.indexOf('|');
    assert.ok(offset >= 0);
    const text = marked.replace('|', '');
    const filename = path.join(library, 'package.mo');
    await fs.writeFile(filename, text);
    const uri = pathToFileURL(filename).toString();
    await analyzer.loadLibrary(pathToFileURL(library).toString(), false);
    const doc = TextDocument.create(uri, 'modelica', 1, text);
    const result = await analyzer.findTypeDefinition(uri, doc.positionAt(offset));
    if (target === null) {
      assert.equal(result, null);
    } else {
      assert.ok(result);
      assert.equal(result.targetUri, uri);
      const range = result.targetSelectionRange;
      assert.equal(doc.getText(range), target);
      assert.ok(doc.offsetAt(range.start) < offset, 'must select the type declaration');
    }
    return { result, doc };
  }
  it('goes from a component declaration to its class, unlike Go to Definition', async () => {
    const { doc } = await check('package Nav model T end T; model M T |a; end M; end Nav;', 'T');
    const declaration = await analyzer.findDeclaration(doc.uri, doc.positionAt(doc.getText().indexOf('a;')));
    assert.ok(declaration);
    assert.equal(doc.getText(declaration.targetRange), 'T a');
  });
  it('handles component uses, arrays and qualified types', async () => {
    await check('package Nav model T Real x; end T; model M Nav.T a[2]; equation |a[1].x=1; end M; end Nav;', 'T');
  });
  it('handles a cursor on a type name', async () => {
    await check('package Nav model T end T; model M |T a; end M; end Nav;', 'T');
  });
  it('retains named type aliases instead of following them to builtins', async () => {
    await check('package Nav type Temperature=Real; model M Temperature |t; end M; end Nav;', 'Temperature');
  });
  it('resolves explicit import aliases', async () => {
    await check('package Nav model T end T; model M import Alias=Nav.T; Alias |a; end M; end Nav;', 'T');
  });
  it('resolves types in the component declaration scope', async () => {
    const { result, doc } = await check('package Nav model T end T; model M record T end T; T |a; end M; end Nav;', 'T');
    assert.ok(result);
    assert.equal(doc.offsetAt(result.targetSelectionRange.start), doc.getText().indexOf('record T') + 7);
  });
  for (const [name, code] of [
    ['builtins', 'Real |x;'], ['unknown types', 'Unknown |x;'],
    ['comments', '// |T\n'], ['strings', 'String s="|T";'],
  ]) {
    it(`returns no location for ${name}`, async () => {
      await check(`package Nav model T end T; model M ${code} end M; end Nav;`, null);
    });
  }
  it('uses the latest unsaved source even when analysis still contains disk text', async () => {
    const marked = 'package Nav model T end T; model Other end Other; model M T |a; end M; end Nav;';
    const { doc } = await check(marked, 'T');
    const text = doc.getText().replace('T a;', 'Other a;');
    const opened = TextDocument.create(doc.uri, 'modelica', 2, text);
    const result = await analyzer.findTypeDefinition(doc.uri, opened.positionAt(text.indexOf('a;')), () => opened);
    assert.ok(result);
    assert.equal(opened.getText(result.targetSelectionRange), 'Other');
  });
  it('loads a requested external type lazily and selects its identifier with UTF-16/CRLF positions', async () => {
    const text = 'package Nav model M Nav.Target a; end M; end Nav;';
    const target = 'within Nav;\r\n/* 🤖 */ model Target\r\nend Target;\r\n';
    await fs.writeFile(path.join(library, 'package.mo'), text);
    await fs.writeFile(path.join(library, 'Target.mo'), target);
    await fs.writeFile(path.join(library, 'Unused.mo'), 'model Unused end Unused;');
    const original = parser.parse.bind(parser);
    parser.parse = ((...args: Parameters<Parser['parse']>) => {
      assert.notEqual(args[0], 'model Unused end Unused;', 'unrelated library file was parsed');
      return original(...args);
    }) as Parser['parse'];
    await analyzer.loadLibrary(pathToFileURL(library).toString(), false);
    const doc = TextDocument.create(pathToFileURL(path.join(library, 'package.mo')).toString(), 'modelica', 1, text);
    const result = await analyzer.findTypeDefinition(doc.uri, doc.positionAt(text.indexOf('a;')));
    assert.ok(result);
    const targetDoc = TextDocument.create(pathToFileURL(path.join(library, 'Target.mo')).toString(), 'modelica', 1, target);
    assert.equal(result.targetUri, targetDoc.uri);
    assert.deepEqual(result.targetSelectionRange.start, targetDoc.positionAt(target.indexOf('Target')));
    assert.equal(targetDoc.getText(result.targetSelectionRange), 'Target');
  });
});
