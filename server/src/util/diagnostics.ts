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


import { Node, Parser } from 'web-tree-sitter';
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

/** Syntax only: no name resolution, type checking or embedded markup validation. */
export function syntaxDiagnostics(parser: Parser, document: TextDocument): Diagnostic[] {
  const tree = parser.parse(document.getText());
  if (!tree) throw new Error('Modelica parser did not return a syntax tree');
  try {
    const diagnostics: Diagnostic[] = [];
    const pending: Node[] = [tree.rootNode];
    while (pending.length && diagnostics.length < 100) {
      const node = pending.pop();
      if (!node) break;
      if (node.isError || node.isMissing) {
        diagnostics.push({
          range: {
            // web-tree-sitter's JS indices and TextDocument offsets are UTF-16.
            start: document.positionAt(node.startIndex),
            end: document.positionAt(node.endIndex),
          },
          severity: DiagnosticSeverity.Error,
          source: 'modelica',
          code: node.isMissing ? 'missing-token' : 'syntax-error',
          message: node.isMissing ? `Missing ${JSON.stringify(node.type)}.` : 'Syntax error.',
        });
        // An ERROR may contain more recovery errors. Report it once rather
        // than flooding the editor with overlapping parser recovery reports.
        continue;
      }
      if (!node.hasError) continue;
      const children = node.children;
      for (let i = children.length - 1; i >= 0; i--) {
        if (children[i].hasError || children[i].isMissing) pending.push(children[i]);
      }
    }
    return diagnostics;
  } finally {
    tree.delete();
  }
}
