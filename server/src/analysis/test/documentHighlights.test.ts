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
import { Parser } from 'web-tree-sitter';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { DocumentHighlightKind } from 'vscode-languageserver/node';
import { initializeParser } from '../../parser';
import { documentHighlights } from '../documentHighlights';

describe('document highlights', () => {
  let parser: Parser;
  before(async () => { parser = await initializeParser(); });
  after(() => parser.delete());
  function check(marked: string) {
    let text = '';
    const ranges: [number, number][] = [];
    let previous = 0;
    for (const match of marked.matchAll(/«(.*?)»/gs)) {
      text += marked.slice(previous, match.index);
      const start = text.length;
      text += match[1];
      ranges.push([start, text.length]);
      previous = match.index + match[0].length;
    }
    text += marked.slice(previous);
    const document = TextDocument.create('untitled:Highlights.mo', 'modelica', 1, text);
    const expected = ranges.map(([start, end]) => ({
      range: { start: document.positionAt(start), end: document.positionAt(end) },
      kind: DocumentHighlightKind.Text,
    }));
    for (const [start, end] of ranges) {
      for (const offset of [start, end]) {
        assert.deepEqual(documentHighlights(parser, document, document.positionAt(offset)), expected);
      }
    }
  }
  it('matches declarations and uses, not strings or comments', () => {
    check('model M Real «x», y; String s = "x"; equation «x» = y + «x»; // x\nend M;');
  });
  it('distinguishes the PI component from the SimpleController.PI enum', () => {
    check('model PID_Controller\n Modelica.Blocks.Continuous.LimPID «PI»(controllerType=Modelica.Blocks.Types.SimpleController.PI);\n Modelica.Blocks.Sources.Step source;\nequation\n connect(«PI».y, source.y);\n connect(source.y, «PI».u_s);\n connect(source.y, «PI».u_m);\nend PID_Controller;');
  });
  it('matches local classes, their end identifiers, and type references', () => {
    check('package P model «T» end «T»; model M «T» a; P.«T» b; end M; end P;');
  });
  it('keeps same-named declarations in sibling and nested scopes separate', () => {
    check('package P model A Real x; equation x=1; end A; model B Real «x»; model C Real x; equation x=2; end C; equation «x»=3; end B; end P;');
  });
  it('resolves local instance member identities rather than matching final names', () => {
    check('package P model T Real «x»; end T; model U Real x; end U; model M T a,b; U c; equation a.«x» = b.«x» + c.x; end M; end P;');
  });
  it('handles enumeration literals and quoted names', () => {
    check("model M type E = enumeration(«'on'», 'off'); E e = E.«'on'»; end M;");
    check("model M Real «'a b'»; equation «'a b'»=1; end M;");
  });
  it('does not confuse modification labels with lexical variables', () => {
    check('model M Real «k»; External e(k=«k»); equation «k»=1; end M;');
  });
  it('honors encapsulated lookup boundaries', () => {
    check('package P constant Real «x» = 1; model A Real y=«x»; end A; encapsulated model B Real y=x; end B; end P;');
  });
  it('does not borrow enclosing nonconstant variables or guess inherited bindings', () => {
    check('model M Real «x»; model Nested Real y=x; end Nested; equation «x»=1; end M;');
    check('package P constant Real «x»=1; model Nested extends External; Real y=x; end Nested; model Other Real y=«x»; end Other; end P;');
  });
  it('binds explicit imports without treating imported path segments as aliases', () => {
    check('model M import «T» = External.T; «T» a; «T» b; end M;');
    check('model M import External.«T»; «T» a; end M;');
  });
  it('distinguishes loop indices from outer variables', () => {
    check('model M Integer i; Real x; equation for «i» in 1:3 loop x=«i»; end for; x=i; end M;');
    check('model M Integer «i»; Real x; equation for i in 1:«i» loop x=i; end for; x=«i»; end M;');
  });
  it('preserves UTF-16 positions and CRLF', () => {
    check('model M\r\n String s="🃏🔑🤖🌳é"; Real «x»;\r\nequation\r\n «x»=1;\r\nend M;');
  });
  it('scopes algorithm loops, multiple indices, comprehensions and reductions', () => {
    check('model M Real x[3]; algorithm for «i» in 1:3 loop x[«i»]:=«i»; end for; end M;');
    check('model M Real x; equation for «i» in 1:3, j in 1:«i» loop x=«i»+j; end for; end M;');
    check('model M Integer «i» = 3; Real x[3] = {i for i in 1:«i»}; Real y = sum(i for i in 1:«i»); end M;');
    check('model M Integer i = 3; Real x[3] = {«i» for «i» in 1:i}; end M;');
  });
  it('handles incomplete input conservatively', () => {
    check('model M Real «x»; equation «x»=; end M;');
  });
  it('returns nothing for comments, strings, keywords and unresolved symbols', () => {
    for (const source of ['mo|del M end M;', 'model M // x|\nend M;', 'model M String s="x|"; end M;', 'model M equation unknown|=1; end M;']) {
      const offset = source.indexOf('|');
      const doc = TextDocument.create('untitled:test.mo', 'modelica', 1, source.replace('|', ''));
      assert.deepEqual(documentHighlights(parser, doc, doc.positionAt(offset)), []);
    }
  });
  it('releases the temporary tree even if traversal fails', () => {
    const original = parser.parse.bind(parser);
    let deleted = 0;
    parser.parse = ((...args: Parameters<Parser['parse']>) => {
      const tree = original(...args);
      assert.ok(tree);
      const dispose = tree.delete.bind(tree);
      tree.delete = () => { deleted++; dispose(); };
      Object.defineProperty(tree, 'rootNode', { get: () => { throw new Error('injected failure'); } });
      return tree;
    }) as Parser['parse'];
    try {
      const doc = TextDocument.create('untitled:test.mo', 'modelica', 1, 'model M end M;');
      assert.throws(() => documentHighlights(parser, doc, { line: 0, character: 6 }), /injected failure/);
      assert.equal(deleted, 1);
    } finally {
      parser.parse = original;
    }
  });
});
