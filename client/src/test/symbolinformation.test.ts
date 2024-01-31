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

import * as vscode from 'vscode';
import * as assert from 'assert';
import { getDocUri, activate } from './helper';

suite('Symbol Information', () => {
  const docUri = getDocUri('MyLibrary.mo');

  test('onDocumentSymbol()', async () => {
    const documentSymbols: vscode.DocumentSymbol[] = [
      new vscode.DocumentSymbol(
          'MyLibrary',
          '',
          vscode.SymbolKind.Package,
          new vscode.Range(new vscode.Position(0, 0), new vscode.Position(6, 13)),
          new vscode.Range(new vscode.Position(0, 0), new vscode.Position(6, 13)),
      )
    ];
    documentSymbols[0].children.push(
      new vscode.DocumentSymbol(
          'M',
          '',
          vscode.SymbolKind.Class,
          new vscode.Range(new vscode.Position(1, 2), new vscode.Position(5, 7)),
          new vscode.Range(new vscode.Position(1, 2), new vscode.Position(5, 7))
      ));

    await testSymbolInformation(docUri, documentSymbols);
  });
});

async function testSymbolInformation(
  docUri: vscode.Uri,
  expectedDocumentSymbols: vscode.DocumentSymbol[]
) {
  await activate(docUri);

  // Execute `vscode.executeDocumentSymbolProvider` to get file outline
  const actualSymbolInformation = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>("vscode.executeDocumentSymbolProvider", docUri);

  //printDocumentSymbols(actualSymbolInformation);
  assertDocumentSymbolsEqual(expectedDocumentSymbols, actualSymbolInformation);
}

function printDocumentSymbols(documentSymbols: vscode.DocumentSymbol[]) {
  documentSymbols.forEach((symbol, index) => {
      console.log(`Document Symbol ${index + 1}:`);
      console.log(`Name: ${symbol.name}`);
      console.log(`Kind: ${vscode.SymbolKind[symbol.kind]}`);
      console.log(`Range: ${symbol.range.start.line}:${symbol.range.start.character}, ${symbol.range.end.line}:${symbol.range.end.character}`);
      console.log(`SelectionRange: ${symbol.selectionRange.start.line}:${symbol.selectionRange.start.character}, ${symbol.selectionRange.end.line}:${symbol.selectionRange.end.character}`);
      console.log('Children:');
      
      if (symbol.children && symbol.children.length > 0) {
          printDocumentSymbols(symbol.children);
      }

      console.log('---');
  });
}

function assertDocumentSymbolsEqual(expected: vscode.DocumentSymbol[], actual: vscode.DocumentSymbol[]) {
  assert.strictEqual(expected.length, actual.length, 'Array lengths do not match.');

  for (let i = 0; i < expected.length; i++) {
    const expectedSymbol = expected[i];
    const actualSymbol = actual[i];

    assert.strictEqual(expectedSymbol.name, actualSymbol.name, `Symbol names do not match at index ${i}.`);
    assert.strictEqual(expectedSymbol.kind, actualSymbol.kind, `Symbol kinds do not match at index ${i}.`);

    assert.strictEqual(
      expectedSymbol.range.start.line,
      actualSymbol.range.start.line,
      `Symbol start line does not match at index ${i}.`
    );
    assert.strictEqual(
      expectedSymbol.range.start.character,
      actualSymbol.range.start.character,
      `Symbol start character does not match at index ${i}.`
    );

    assert.strictEqual(
      expectedSymbol.range.end.line,
      actualSymbol.range.end.line,
      `Symbol end line does not match at index ${i}.`
    );
    assert.strictEqual(
      expectedSymbol.range.end.character,
      actualSymbol.range.end.character,
      `Symbol end character does not match at index ${i}.`
    );

    // Recursive check for children symbols
    assertDocumentSymbolsEqual(expectedSymbol.children || [], actualSymbol.children || []);
  }
}
