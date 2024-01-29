/*
 * This file is part of modelica-language-server.
 *
 * modelica-language-server is free software: you can redistribute it and/or
 * modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version.
 *
 * modelica-language-server is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU Affero
 * General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with modelica-language-server. If not, see
 * <http://www.gnu.org/licenses/>.
 */

import * as assert from 'assert';
import * as LSP from 'vscode-languageserver/node';

import { initializeParser } from '../../parser';
import { getAllDeclarationsInTree, nodeToSymbolInformation } from '../declarations';

const modelicaTestString = `
model M "Description"
end M;

function foo
end foo;

type Temperature = Real(unit = "K");
`;

const expectedDefinitions = ["M", "foo", "Temperature"];
const expectedTypes = [LSP.SymbolKind.Class, LSP.SymbolKind.Function, LSP.SymbolKind.TypeParameter];

describe('nodeToSymbolInformation', () => {
  it('type to TypeParameter', async () => {
  const parser = await initializeParser();
  const tree = parser.parse("type Temperature = Real(unit = \"K \");");

  const classNode = tree.rootNode.childForFieldName('storedDefinitions')!.childForFieldName('classDefinition')!;
  const symbol = nodeToSymbolInformation(classNode, "file.mo");

  assert.equal(symbol?.name, 'Temperature');
  assert.equal(symbol?.kind, LSP.SymbolKind.TypeParameter);
  });
});

describe('getAllDeclarationsInTree', () => {
  it('Definitions and types', async () => {
    const parser = await initializeParser();
    const tree = parser.parse(modelicaTestString);
    const symbols = getAllDeclarationsInTree(tree, "file.mo");

    const definitions: string[] = [];
    const types: LSP.SymbolKind[] = [];
    for (let i = 0; i < symbols.length; i++) {
      definitions.push(symbols[i].name);
      types.push(symbols[i].kind);
    }

    assert.deepEqual(definitions, expectedDefinitions);
    assert.deepEqual(types, expectedTypes);
  });
});
