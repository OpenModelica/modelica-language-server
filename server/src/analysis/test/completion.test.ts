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
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TextEdit } from 'vscode-languageserver/node';
import { Parser } from 'web-tree-sitter';
import { initializeParser } from '../../parser';
import { ModelicaProject, ModelicaLibrary } from '../../project';
import { completeDocument } from '../completion';

describe('completion', () => {
  let project: ModelicaProject;
  let temporary: string;
  beforeEach(async () => {
    project = new ModelicaProject(await initializeParser());
    temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'modelica-completion-'));
  });
  afterEach(() => {
    for (const library of project.libraries) for (const doc of library.documents.values()) doc.dispose();
    project.parser.delete();
    fs.rmSync(temporary, { recursive: true, force: true });
  });
  function complete(source: string, uri = 'untitled:Completion.mo', opened?: (uri: string) => TextDocument | undefined) {
    const offset = source.indexOf('|');
    assert.ok(offset >= 0);
    const document = TextDocument.create(uri, 'modelica', 1, source.replace('|', ''));
    return { document, result: completeDocument(project, document, document.positionAt(offset), opened) };
  }
  function labels(source: string) { return complete(source).result.items.map(item => item.label); }
  async function library() {
    const root = path.join(temporary, 'Example');
    fs.mkdirSync(path.join(root, 'Parts'), { recursive: true });
    fs.writeFileSync(path.join(root, 'package.mo'), 'package Example constant Real gain = 1; protected constant Real hidden = 2; end Example;');
    fs.writeFileSync(path.join(root, 'Parts', 'package.mo'), 'within Example; package Parts end Parts;');
    fs.writeFileSync(path.join(root, 'Parts', 'Sensor.mo'), 'within Example.Parts; model Sensor Real signal; end Sensor;');
    fs.writeFileSync(path.join(root, 'Unused.mo'), 'within Example; model Unused end Unused;');
    const lib = await ModelicaLibrary.load(project, root, false);
    project.addLibrary(lib);
    return lib;
  }
  it('completes local declarations and replaces the entire word', () => {
    const { document, result } = complete('model M Real velocity; equation vel|ocity = 0; end M;');
    assert.deepEqual(result.items.map(item => item.label), ['velocity']);
    const edit = result.items[0].textEdit as TextEdit;
    assert.equal(document.getText(edit.range), 'velocity');
    assert.equal(edit.newText, 'velocity');
  });
  it('recovers an unfinished declaration and includes built-in types', () => {
    assert.deepEqual(labels('model M Re| end M;'), ['Real']);
    assert.ok(labels('model M model Nested end Nested; Ne| end M;').includes('Nested'));
  });
  it('does not leak sibling or nested component declarations', () => {
    const result = labels('package P model S Real secret; end S; model M Real local; equation | end M; end P;');
    assert.ok(result.includes('local'));
    assert.ok(result.includes('S'));
    assert.ok(!result.includes('secret'));
  });
  it('respects nearest declarations and encapsulated class boundaries', () => {
    const result = labels('package P constant Real outerValue = 1; model Inner end Inner; encapsulated model M equation | end M; end P;');
    assert.ok(!result.includes('outerValue'));
    assert.ok(!result.includes('Inner'));
  });
  for (const source of [
    'model M // Re| \nend M;', 'model M /* Re| */ end M;',
    'model M String s = "Re|"; end M;', "model M Real 'Re|'; end M;",
    'model M Real x = 12.|; end M;',
  ]) {
    it('suppresses completion inside comments, literals and numbers: ' + source, () => {
      assert.deepEqual(labels(source), []);
    });
  }
  it('returns public qualified members, not protected or nested members', () => {
    assert.deepEqual(labels('package P package Q constant Real publicValue = 1; model N Real secret; end N; protected Real hidden; end Q; model M equation Q.| end M; end P;'), ['N', 'publicValue']);
  });
  it('lists library roots and immediate files without parsing siblings', async () => {
    const lib = await library();
    assert.deepEqual(labels('model M Ex| end M;'), ['Example']);
    assert.deepEqual(labels('model M Example.| end M;'), ['gain', 'Parts', 'Unused']);
    assert.equal(lib.documents.size, 1);
    assert.deepEqual(labels('model M Example.Parts.| end M;'), ['Sensor']);
    assert.equal(lib.documents.size, 2);
    assert.deepEqual(labels('model M Example.Parts.Sensor.si| end M;'), ['signal']);
    assert.equal(lib.documents.size, 3);
  });
  it('resolves explicit import aliases', async () => {
    await library();
    assert.deepEqual(labels('model M import P = Example.Parts; P.Se| end M;'), ['Sensor']);
  });
  it('resolves external children of the package currently being edited', async () => {
    const lib = await library();
    const uri = pathToFileURL(path.join(lib.path, 'package.mo')).toString();
    const { result } = complete('package Example model M Example.Parts.Se| end M; end Example;', uri);
    assert.deepEqual(result.items.map(item => item.label), ['Sensor']);
  });
  it('does not borrow filesystem siblings for inline packages', async () => {
    const lib = await library();
    const uri = pathToFileURL(path.join(lib.path, 'package.mo')).toString();
    const { result } = complete('package Example package Inline end Inline; model M Inline.| end M; end Example;', uri);
    assert.deepEqual(result.items, []);
  });
  it('completes enumeration literals including quoted identifiers', () => {
    assert.deepEqual(labels("model M type E = enumeration('0', second); equation E.| end M;"), ["'0'", 'second']);
    assert.deepEqual(labels("model M package 'P Q' constant Real value = 1; end 'P Q'; equation 'P Q'.va| end M;"), ['value']);
  });
  it('does not resolve a shadowed library as an instance; allows absolute names', async () => {
    await library();
    assert.deepEqual(labels('model M Real Example; equation Example.| end M;'), []);
    assert.deepEqual(labels('model M Real Example; .Example.Parts.Se| end M;'), ['Sensor']);
  });
  it('reads unsaved library documents instead of their disk contents', async () => {
    const lib = await library();
    const uri = pathToFileURL(path.join(lib.path, 'Parts', 'Sensor.mo')).toString();
    const opened = TextDocument.create(uri, 'modelica', 2, 'within Example.Parts; model Sensor Real updated; end Sensor;');
    const { result } = complete('model M Example.Parts.Sensor.up| end M;', undefined, requested => requested === uri ? opened : undefined);
    assert.deepEqual(result.items.map(item => item.label), ['updated']);
    assert.equal(lib.documents.size, 2, 'an unsaved snapshot must not replace cached disk state');
  });
  it('preserves UTF-16 ranges after Unicode and CRLF', () => {
    const { document, result } = complete('model M\r\n  String s = "🃏🔑🤖🌳é"; Real velocity; equation vel| = 0;\r\nend M;');
    assert.equal(result.items[0].label, 'velocity');
    assert.equal(document.getText((result.items[0].textEdit as TextEdit).range), 'vel');
  });
  it('caps large result sets and tells the client to request again', () => {
    const declarations = Array.from({ length: 250 }, (_, i) => 'Real variable' + i + ';').join('\n');
    const { result } = complete('model M ' + declarations + ' equation var| end M;');
    assert.equal(result.items.length, 200);
    assert.equal(result.isIncomplete, true);
    assert.equal(labels('model M ' + declarations + ' equation variable249| end M;').length, 1);
  });
  for (const fail of [false, true]) {
    it('releases temporary parse trees (traversal failure: ' + fail + ')', () => {
      const original = project.parser.parse.bind(project.parser);
      let deleted = 0;
      project.parser.parse = ((...args: Parameters<Parser['parse']>) => {
        const tree = original(...args);
        assert.ok(tree);
        const dispose = tree.delete.bind(tree);
        tree.delete = () => { deleted++; dispose(); };
        if (fail) Object.defineProperty(tree, 'rootNode', { get: () => { throw new Error('injected failure'); } });
        return tree;
      }) as Parser['parse'];
      try {
        if (fail) assert.throws(() => labels('model M Re| end M;'), /injected failure/);
        else assert.deepEqual(labels('model M Re| end M;'), ['Real']);
        assert.equal(deleted, 1);
      } finally {
        project.parser.parse = original;
      }
    });
  }
});
