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
import fs from 'node:fs';
import path from 'node:path';
import { Parser } from 'web-tree-sitter';
import { DiagnosticSeverity } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { initializeParser } from '../../parser';
import { syntaxDiagnosticReport, syntaxDiagnostics } from '../diagnostics';

describe('Modelica syntax diagnostics', () => {
  let parser: Parser;
  before(async () => { parser = await initializeParser(); });
  after(() => parser.delete());

  function check(text: string) {
    return syntaxDiagnostics(parser, TextDocument.create('untitled:test.mo', 'modelica', 1, text));
  }

  const fixtures = [
    { file: 'missing-semicolon.mo', code: 'missing-token', message: 'Missing ";".', line: 3, start: 0, end: 0 },
    { file: 'unexpected-unicode.mo', code: 'syntax-error', message: 'Syntax error.', line: 1, start: 33, end: 34 },
    { file: 'incomplete.mo', code: 'syntax-error', message: 'Syntax error.', line: 0, start: 0, end: 7 },
  ];
  for (const fixture of fixtures) {
    for (const eol of ['\n', '\r\n']) {
      it(`reports the exact diagnostic for ${fixture.file} with ${JSON.stringify(eol)}`, () => {
        const source = fs.readFileSync(path.join(__dirname, 'fixtures', 'diagnostics', fixture.file), 'utf8')
          .replace(/\r\n|\n/g, eol);
        assert.deepEqual(check(source), [{
          range: {
            start: { line: fixture.line, character: fixture.start },
            end: { line: fixture.line, character: fixture.end },
          },
          severity: DiagnosticSeverity.Error, source: 'modelica',
          code: fixture.code, message: fixture.message,
        }]);
      });
    }
  }

  for (const source of [
    '', '// a comment\n', 'model M Real x; equation x = 1; end M;',
    'model M UnknownType x; equation x = unresolvedName; end M;',
    'model M annotation(Documentation(info="<html><broken></html>")); end M;',
    'model M String s = "🃏🔑🤖🌳é"; /* å */ end M;',
    'model M equation end M;',
    "model M type Logic = enumeration('0', '1'); Logic x = Logic.'1'; end M;",
  ]) {
    it('does not report syntax errors for ' + JSON.stringify(source), () => {
      assert.deepEqual(check(source), []);
    });
  }

  it('reports a missing semicolon at its insertion point, including EOF', () => {
    for (const source of ['model M Real x end M;', 'model M Real x; end M']) {
      const diagnostics = check(source);
      assert.equal(diagnostics.length, 1);
      const diagnostic = diagnostics[0];
      const offset = source.includes('x end') ? source.indexOf('end') : source.length;
      assert.deepEqual(diagnostic, {
        range: { start: { line: 0, character: offset }, end: { line: 0, character: offset } },
        severity: DiagnosticSeverity.Error, source: 'modelica',
        code: 'missing-token', message: 'Missing ";".',
      });
    }
  });

  it('reports unexpected syntax at the erroneous token', () => {
    const source = 'model M Real x = ; end M;';
    const diagnostics = check(source);
    assert.equal(diagnostics.length, 1);
    assert.equal(diagnostics[0].code, 'syntax-error');
    assert.equal(diagnostics[0].message, 'Syntax error.');
    assert.deepEqual(diagnostics[0].range, {
      start: { line: 0, character: source.indexOf('=') },
      end: { line: 0, character: source.indexOf('=') + 1 },
    });
  });

  for (const eol of ['\n', '\r\n']) {
    it('uses UTF-16 positions after Unicode and ' + JSON.stringify(eol), () => {
      const line = 'String s = "🃏🔑🤖🌳é"; Real x = ;';
      const diagnostics = check(['model M', line, 'end M;'].join(eol));
      assert.equal(diagnostics.length, 1);
      assert.deepEqual(diagnostics[0].range, {
        start: { line: 1, character: line.lastIndexOf('=') },
        end: { line: 1, character: line.lastIndexOf('=') + 1 },
      });
    });
  }

  for (const source of ['model M', 'model M String s = "unfinished', 'model M equation if x then']) {
    it('handles incomplete typing without overlapping reports: ' + JSON.stringify(source), () => {
      const diagnostics = check(source);
      assert.ok(diagnostics.length > 0);
      const document = TextDocument.create('untitled:test.mo', 'modelica', 1, source);
      for (let i = 0; i < diagnostics.length; i++) {
        const { start, end } = diagnostics[i].range;
        assert.ok(document.offsetAt(start) <= document.offsetAt(end));
        assert.ok(document.offsetAt(end) <= source.length);
        if (i) assert.ok(document.offsetAt(diagnostics[i - 1].range.end) <= document.offsetAt(start));
      }
    });
  }

  it('reports independent errors in source order and caps noisy documents', () => {
    const diagnostics = check('model M\n' + 'Real x = ;\n'.repeat(120) + 'end M;');
    assert.equal(diagnostics.length, 100);
    assert.equal(diagnostics[0].range.start.line, 1);
    assert.equal(diagnostics[99].range.start.line, 100);
  });

  it('deletes temporary syntax trees after valid and invalid documents', () => {
    const originalParse = parser.parse.bind(parser);
    let deleted = 0;
    parser.parse = ((...args: Parameters<Parser['parse']>) => {
      const tree = originalParse(...args);
      if (tree) {
        const originalDelete = tree.delete.bind(tree);
        tree.delete = () => { deleted++; originalDelete(); };
      }
      return tree;
    }) as Parser['parse'];
    try {
      check('model M end M;');
      check('model M');
      assert.equal(deleted, 2);
    } finally {
      parser.parse = originalParse;
    }
  });

  for (const failure of ['throw', 'null', 'traversal']) {
    it(`clears old diagnostics at the current version after ${failure} failure and recovers`, () => {
      const uri = 'untitled:failure.mo';
      const failures: unknown[] = [];
      const report = (version: number, text: string) => syntaxDiagnosticReport(
        parser, TextDocument.create(uri, 'modelica', version, text), error => failures.push(error),
      );
      assert.ok(report(1, 'model M').diagnostics.length);
      const originalParse = parser.parse.bind(parser);
      let deleted = false;
      parser.parse = (() => {
        if (failure === 'throw') throw new Error('injected parse failure');
        if (failure === 'null') return null;
        const tree = originalParse('model M');
        assert.ok(tree);
        const originalDelete = tree.delete.bind(tree);
        tree.delete = () => { deleted = true; originalDelete(); };
        Object.defineProperty(tree, 'rootNode', { get: () => { throw new Error('injected traversal failure'); } });
        return tree;
      }) as Parser['parse'];
      try {
        assert.deepEqual(report(2, 'model M end M;'), { uri, version: 2, diagnostics: [] });
        assert.equal(failures.length, 1, 'failure must still be logged, not treated as a successful validation');
        if (failure === 'traversal') assert.ok(deleted, 'failed collection must release the temporary tree');
      } finally {
        parser.parse = originalParse;
      }
      assert.equal(report(3, 'model M').diagnostics[0].code, 'syntax-error');
      assert.deepEqual(report(4, 'model M end M;').diagnostics, []);
    });
  }
});
