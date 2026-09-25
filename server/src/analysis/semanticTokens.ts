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


import { Parser } from 'web-tree-sitter';
import { SemanticTokens, SemanticTokensBuilder, SemanticTokensLegend } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { localSymbolOccurrences } from './localSymbols';

export const semanticTokensLegend: SemanticTokensLegend = {
  tokenTypes: ['namespace', 'class', 'struct', 'function', 'type', 'enum'],
  tokenModifiers: ['declaration'],
};

/** Full responses only: no retained trees, library IO or token caches. */
export function semanticTokens(parser: Parser, document: TextDocument): SemanticTokens {
  const occurrences = localSymbolOccurrences(parser, document);
  const unique = new Map(occurrences.filter(item => item.tokenType).map(item => [item.start, item]));
  const builder = new SemanticTokensBuilder();
  for (const item of [...unique.values()].sort((a, b) => a.start - b.start)) {
    if (!item.tokenType) continue;
    const type = semanticTokensLegend.tokenTypes.indexOf(item.tokenType);
    const start = document.positionAt(item.start);
    const end = document.positionAt(item.end);
    // Split quoted identifiers across lines for clients without multiline support.
    for (let line = start.line; line <= end.line; line++) {
      const character = line === start.line ? start.character : 0;
      const lineEnd = line === end.line ? end.character : document.getText({
        start: { line, character: 0 }, end: { line: line + 1, character: 0 },
      }).replace(/[\r\n]+$/, '').length;
      if (lineEnd > character) builder.push(line, character, lineEnd - character, type, item.declaration ? 1 : 0);
    }
  }
  return { data: builder.build().data };
}
