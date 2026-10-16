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
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Parser } from 'web-tree-sitter';
import { TextDocument } from 'vscode-languageserver-textdocument';
import Analyzer from '../analyzer';
import { initializeParser } from '../parser';

describe('Go to Definition on modifier names (#104)', () => {
  let parser: Parser;
  let analyzer: Analyzer;
  let directory: string;
  let library: string;

  beforeEach(async () => {
    parser = await initializeParser();
    analyzer = new Analyzer(parser);
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'modelica-modifiers-'));
    library = path.join(directory, 'Modifiers');
    await fs.mkdir(library);
  });

  afterEach(async () => {
    analyzer.unloadLibrary(pathToFileURL(library).toString());
    parser.delete();
    await fs.rm(directory, { recursive: true, force: true });
  });

  async function check(body: string, target: string | null) {
    const marked = `package Modifiers\n${body}\nend Modifiers;`;
    const offset = marked.indexOf('|');
    assert.ok(offset >= 0);
    const text = marked.replace('|', '');
    const filename = path.join(library, 'package.mo');
    await fs.writeFile(filename, text);
    const tree = parser.parse(text);
    assert.ok(tree);
    assert.equal(tree.rootNode.hasError, false, 'fixture must parse');
    tree.delete();
    await analyzer.loadLibrary(pathToFileURL(library).toString(), false);
    const document = TextDocument.create(pathToFileURL(filename).toString(), 'modelica', 1, text);
    const result = await analyzer.findDeclaration(document.uri, document.positionAt(offset));
    if (target === null) {
      assert.equal(result, null);
    } else {
      assert.ok(result, `no definition for ${body}`);
      assert.equal(result.targetUri, document.uri);
      assert.equal(document.getText(result.targetRange), target);
      assert.equal(document.offsetAt(result.targetRange.start), text.indexOf(target));
    }
    return { document, result };
  }

  const direct = 'model Controller parameter Real Ti; end Controller;';
  it('resolves a component modifier in its declared type, despite a same-name local', async () => {
    await check(`${direct} model M parameter Real Ti; Controller PI(T|i=0.1); end M;`, 'parameter Real Ti');
  });
  it('follows inheritance across multiple base classes', async () => {
    await check(`model Base parameter Real Ti; end Base;
      model Middle extends Base; end Middle; model Controller extends Middle; end Controller;
      model M Controller PI(T|i=0.1); end M;`, 'parameter Real Ti');
  });
  it('resolves nested modifiers', async () => {
    await check(`${direct} model Wrapper Controller PI; end Wrapper;
      model M Wrapper w(PI(T|i=0.1)); end M;`, 'parameter Real Ti');
  });
  it('resolves each segment of a qualified modifier', async () => {
    await check(`${direct} model Wrapper Controller PI; end Wrapper;
      model M Wrapper w(P|I.Ti=0.1); end M;`, 'Controller PI');
  });
  it('resolves the last segment of a qualified modifier', async () => {
    await check(`${direct} model Wrapper Controller PI; end Wrapper;
      model M Wrapper w(PI.T|i=0.1); end M;`, 'parameter Real Ti');
  });
  it('resolves extends modifiers', async () => {
    await check(`${direct} model M extends Controller(T|i=0.1); end M;`, 'parameter Real Ti');
  });
  it('resolves short class modifiers and follows aliases', async () => {
    await check(`${direct} model Alias=Controller;
      model M Alias PI(T|i=0.1); end M;`, 'parameter Real Ti');
  });
  it('resolves modifiers on a short class definition', async () => {
    await check(`${direct} model Alias=Controller(T|i=0.1);`, 'parameter Real Ti');
  });
  it('resolves imported component types', async () => {
    await check(`${direct} model M import C=Modifiers.Controller; C PI(T|i=0.1); end M;`, 'parameter Real Ti');
  });
  it('keeps expressions on the right hand side in their lexical scope', async () => {
    await check(`${direct} model M parameter Real localTi; Controller PI(Ti=localT|i); end M;`, 'parameter Real localTi');
  });
  it('does not fall back to a same-name local for an unknown modifier', async () => {
    await check('model Controller end Controller; model M Real Ti; Controller PI(T|i=0.1); end M;', null);
  });
  it('does not treat builtin attributes as lexical references', async () => {
    await check('model M Real start; Real x(st|art=1); end M;', null);
  });
  it('terminates for cyclic inheritance', async () => {
    await check('model A extends B; end A; model B extends A; end B; model M A a(miss|ing=1); end M;', null);
  });
  it('terminates for cyclic aliases', async () => {
    await check('model A=B; model B=A; model M A a(miss|ing=1); end M;', null);
  });
  it('resolves globally qualified types and each/final array modifiers', async () => {
    await check(`${direct} model M .Modifiers.Controller PI[2](each final T|i=0.1); end M;`, 'parameter Real Ti');
  });
  it('resolves an inherited nested component type', async () => {
    await check(`${direct} model Base Controller PI; end Base;
      model Wrapper extends Base; end Wrapper; model M Wrapper w(PI(T|i=0.1)); end M;`, 'parameter Real Ti');
  });
  it('resolves a modifier in a constraining clause', async () => {
    await check(`${direct} model M replaceable model C=Controller constrainedby Controller(T|i=0.1); end M;`, 'parameter Real Ti');
  });
  it('leaves unknown nested members unresolved', async () => {
    await check(`${direct} model M Real missing; Controller PI(unknown(miss|ing=1)); end M;`, null);
  });
  it('does not resolve names inside annotations against the surrounding class', async () => {
    await check('model M Real Ti; annotation(T|i=1); end M;', null);
  });
  it('does not resolve names in comments or strings', async () => {
    await check('model M Real Ti; String s="T|i"; end M;', null);
    const filename = path.join(library, 'package.mo');
    const text = 'package Modifiers model M Real Ti; // Ti\n end M; end Modifiers;';
    const uri = pathToFileURL(filename).toString();
    await analyzer.updateDocument(uri, text);
    const doc = TextDocument.create(uri, 'modelica', 2, text);
    assert.equal(await analyzer.findDeclaration(uri, doc.positionAt(text.indexOf('// Ti') + 4)), null);
  });
  it('loads a member lazily across files and follows unsaved component type changes', async () => {
    await fs.writeFile(path.join(library, 'Controller.mo'), 'within Modifiers; model Controller parameter Real Ti; end Controller;');
    await fs.writeFile(path.join(library, 'Other.mo'), 'within Modifiers; model Other parameter Real Ti; end Other;');
    const unused = 'within Modifiers; model Unused end Unused;';
    await fs.writeFile(path.join(library, 'Unused.mo'), unused);
    const original = parser.parse.bind(parser);
    parser.parse = ((...args: Parameters<Parser['parse']>) => {
      assert.notEqual(args[0], unused, 'unrelated library file must not be parsed');
      return original(...args);
    }) as Parser['parse'];
    const text = 'package Modifiers model M Controller PI(Ti=0.1); end M; end Modifiers;';
    const filename = path.join(library, 'package.mo');
    await fs.writeFile(filename, text);
    await analyzer.loadLibrary(pathToFileURL(library).toString(), false);
    const uri = pathToFileURL(filename).toString();
    let document = TextDocument.create(uri, 'modelica', 1, text);
    let result = await analyzer.findDeclaration(uri, document.positionAt(text.indexOf('Ti=') + 1));
    assert.ok(result);
    assert.equal(result.targetUri, pathToFileURL(path.join(library, 'Controller.mo')).toString());
    const changed = text.replace('Controller PI', 'Other PI');
    await analyzer.updateDocument(uri, changed);
    document = TextDocument.create(uri, 'modelica', 2, changed);
    result = await analyzer.findDeclaration(uri, document.positionAt(changed.indexOf('Ti=') + 1));
    assert.ok(result);
    assert.equal(result.targetUri, pathToFileURL(path.join(library, 'Other.mo')).toString());
    assert.equal(await fs.readFile(filename, 'utf8'), text);
  });

  const redeclared = `model Base parameter Real Ti = 1; end Base;
    model Other parameter Real Ti = 2; end Other;
    model Wrapper replaceable model C = Base; C item; end Wrapper;`;
  for (const argumentsText of [
    'redeclare model C = Other, item(T|i=0.1)',
    'item(T|i=0.1), redeclare model C = Other',
    'redeclare model C = Other, item.T|i=0.1',
  ]) {
    it(`uses the instance redeclaration for ${argumentsText}`, async () => {
      await check(`${redeclared} model M Wrapper w(${argumentsText}); end M;`, 'parameter Real Ti = 2');
    });
  }
  it('keeps the default type of another instance', async () => {
    await check(`${redeclared} model M
      Wrapper changed(redeclare model C = Other, item(Ti=0.1));
      Wrapper original(item(T|i=0.1)); end M;`, 'parameter Real Ti = 1');
  });
  it('resolves the replacement type in the modifying model scope', async () => {
    await check(`${redeclared} model M model Replacement = Other;
      Wrapper w(redeclare model C = Replacement, item(T|i=0.1)); end M;`, 'parameter Real Ti = 2');
  });
  it('does not fall back to the default when the replacement type is unavailable', async () => {
    await check(`${redeclared} model M Wrapper w(redeclare model C = Unknown, item(T|i=0.1)); end M;`, null);
  });
  it('follows redeclarations through a second class alias', async () => {
    await check(`${redeclared} model Wrapped replaceable model C = Base; model Alias = C; Alias item; end Wrapped;
      model M Wrapped w(redeclare model C = Other, item(T|i=0.1)); end M;`, 'parameter Real Ti = 2');
  });
  it('uses a redeclaration on an extends clause', async () => {
    await check(`${redeclared} model Derived extends Wrapper(redeclare model C = Other); end Derived;
      model M Derived w(item(T|i=0.1)); end M;`, 'parameter Real Ti = 2');
  });
  it('lets the instance override the inherited default redeclaration', async () => {
    await check(`${redeclared} model Derived extends Wrapper(redeclare model C = Base); end Derived;
      model M Derived w(redeclare model C = Other, item(T|i=0.1)); end M;`, 'parameter Real Ti = 2');
  });
  it('uses a redeclaration on a short class alias', async () => {
    await check(`${redeclared} model Derived = Wrapper(redeclare model C = Other);
      model M Derived w(item(T|i=0.1)); end M;`, 'parameter Real Ti = 2');
  });
  it('uses a direct component redeclaration', async () => {
    await check(`${redeclared} model Wrapped replaceable Base item; end Wrapped;
      model M Wrapped w(redeclare Other item, item(T|i=0.1)); end M;`, 'parameter Real Ti = 2');
  });
  it('does not leak an outer redeclaration into an independent nested instance', async () => {
    await check(`${redeclared} model Outer replaceable model C = Base; Wrapper nested; end Outer;
      model M Outer w(redeclare model C = Other, nested(item(T|i=0.1))); end M;`, 'parameter Real Ti = 1');
  });

  it('applies an inherited class redeclaration to a locally declared component', async () => {
    await check(`${redeclared} model Derived extends Wrapper(redeclare model C = Other); C localItem; end Derived;
      model M Derived w(localItem(T|i=0.1)); end M;`, 'parameter Real Ti = 2');
  });
  it('applies a redeclaration to the qualifier of a component type', async () => {
    await check(`model Base model T parameter Real Ti = 1; end T; end Base;
      model Other model T parameter Real Ti = 2; end T; end Other;
      model Wrapper replaceable model C = Base; C.T item; end Wrapper;
      model M Wrapper w(redeclare model C = Other, item(T|i=0.1)); end M;`, 'parameter Real Ti = 2');
  });

});
