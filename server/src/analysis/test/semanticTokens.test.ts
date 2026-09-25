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
import { initializeParser } from '../../parser';
import { semanticTokens, semanticTokensLegend } from '../semanticTokens';

describe('semantic tokens', () => {
  let parser: Parser;
  before(async () => { parser = await initializeParser(); });
  after(() => parser.delete());

  function check(marked: string) {
    let text = '';
    let previous = 0;
    const expected: { start: number; end: number; type: string; declaration: number }[] = [];
    for (const match of marked.matchAll(/«([^|]+)\|([^»]+)»/g)) {
      text += marked.slice(previous, match.index);
      const [type, modifier] = match[2].split('.');
      expected.push({ start: text.length, end: text.length + match[1].length, type, declaration: modifier === 'declaration' ? 1 : 0 });
      text += match[1];
      previous = match.index + match[0].length;
    }
    text += marked.slice(previous);
    const document = TextDocument.create('untitled:Tokens.mo', 'modelica', 1, text);
    const data = semanticTokens(parser, document).data;
    let line = 0, character = 0;
    const actual = [];
    for (let i = 0; i < data.length; i += 5) {
      line += data[i];
      character = data[i] === 0 ? character + data[i + 1] : data[i + 1];
      const start = document.offsetAt({ line, character });
      actual.push({ start, end: start + data[i + 2], type: semanticTokensLegend.tokenTypes[data[i + 3]], declaration: data[i + 4] });
    }
    assert.deepEqual(actual, expected);
  }

  it('classifies declarations, qualified type references, and matching end names', () => {
    check('package «P|namespace.declaration» model «T|class.declaration» end «T|class»; model «M|class.declaration» «T|class» a; «P|namespace».«T|class» b; end «M|class»; end «P|namespace»;');
  });
  it('classifies the Modelica class restrictions and short aliases', () => {
    for (const [keyword, type] of [['model', 'class'], ['class', 'class'], ['block', 'class'], ['connector', 'class'], ['expandable connector', 'class'], ['operator', 'class'], ['record', 'struct'], ['operator record', 'struct'], ['function', 'function'], ['pure function', 'function'], ['operator function', 'function'], ['package', 'namespace']]) {
      check(`${keyword} «T|${type}.declaration» end «T|${type}»;`);
    }
    check('model «M|class.declaration» type «Temperature|type.declaration» = Real; «Temperature|type» t; type «E|enum.declaration» = enumeration(on, off); «E|enum» e = «E|enum».on; end «M|class»;');
    check('model «A|class.declaration» end «A|class»; model «B|class.declaration» = «A|class»;');
  });
  it('resolves function calls and extends references', () => {
    check('package «P|namespace.declaration» function «f|function.declaration» input Real x; output Real y=x; end «f|function»; model «A|class.declaration» end «A|class»; model «B|class.declaration» extends «A|class»; end «B|class»; model «C|class.declaration» Real y=«f|function»(1); end «C|class»; end «P|namespace»;');
  });
  it('honors shadowing and skips unresolved imports, inherited names, strings and comments', () => {
    check('package «P|namespace.declaration» type «T|type.declaration»=Real; model «A|class.declaration» Real T; equation T=1; end «A|class»; model «B|class.declaration» extends External; T x; end «B|class»; encapsulated model «C|class.declaration» T y; end «C|class»; end «P|namespace»;');
    check('model «M|class.declaration» import T=External.T; T x; Unknown y; String s="M T Unknown"; // M T Unknown\nend «M|class»;');
  });
  it('preserves UTF-16 and CRLF positions, including quoted identifiers', () => {
    check("model «M|class.declaration»\r\n String s=\"🤖é\"; type «'T name'|type.declaration»=Real; «'T name'|type» t;\r\nend «M|class»;");
  });
  it('handles incomplete expressions and ignores mismatched end names', () => {
    check('model «M|class.declaration» type «T|type.declaration»=Real; «T|type» x=; end «M|class»;');
    check('model «M|class.declaration» end Wrong;');
    check('');
  });
  it('releases temporary syntax trees on success and failure', () => {
    const original = parser.parse.bind(parser);
    let deleted = 0;
    let fail = false;
    parser.parse = ((...args: Parameters<Parser['parse']>) => {
      const tree = original(...args);
      assert.ok(tree);
      const dispose = tree.delete.bind(tree);
      tree.delete = () => { deleted++; dispose(); };
      if (fail) Object.defineProperty(tree, 'rootNode', { get: () => { throw new Error('injected failure'); } });
      return tree;
    }) as Parser['parse'];
    try {
      check('model «M|class.declaration» end «M|class»;');
      fail = true;
      assert.throws(() => check(''), /injected failure/);
      assert.equal(deleted, 2);
    } finally {
      parser.parse = original;
    }
  });
});
