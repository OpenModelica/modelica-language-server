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

import { Node } from 'web-tree-sitter';
import { FormattingOptions } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { getLanguageService } from 'vscode-html-languageservice';
import formatXml from 'xml-formatter';

const html = getLanguageService();
const escapes: Record<string, string> = {
  "'": "'", '"': '"', '?': '?', '\\': '\\',
  a: '\x07', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v',
};

/** Only a complete, literal Documentation(info=.../revisions=...) value is eligible. */
function isDocumentationLiteral(node: Node): boolean {
  let current = node.parent;
  while (current && current.type !== 'modification') {
    if (current.type === 'binary_expression') return false;
    current = current.parent;
  }
  const expression = current?.childForFieldName('expression');
  const field = current?.parent;
  if (expression?.text !== node.text || field?.type !== 'element_modification' ||
      !['info', 'revisions'].includes(field.childForFieldName('name')?.text ?? '')) return false;
  current = field.parent;
  while (current && current.type !== 'element_modification') current = current.parent;
  if (current?.childForFieldName('name')?.text !== 'Documentation') return false;
  while (current && current.type !== 'annotation_clause') current = current.parent;
  return current !== null;
}

function encodeString(value: string): string {
  return '"' + value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')
    .replaceAll('\x07', '\\a').replaceAll('\b', '\\b').replaceAll('\f', '\\f')
    .replaceAll('\t', '\\t').replaceAll('\v', '\\v') + '"';
}

/** Delegate embedded markup only after the caller has explicitly opted in. */
export function formatDocumentation(node: Node, options: FormattingOptions, eol: string): string {
  if (node.type !== 'STRING' || !isDocumentationLiteral(node)) return node.text;
  const value = node.text.slice(1, -1).replace(/\\(['"?\\abfnrtv])/g, (_, escape: string) => escapes[escape]);
  const markup = value.trim();
  if (!markup.startsWith('<')) return node.text;
  const tabSize = Number.isInteger(options.tabSize) && options.tabSize > 0 ? options.tabSize : 2;
  try {
    let formatted: string;
    if (/^(?:<!doctype\s+html[^>]*>\s*)?<html(?:\s|>)/i.test(markup)) {
      formatted = markup;
      // The HTML formatter can put a closing tag on a new line only after its
      // text was wrapped on the first pass. Return a stable result, or leave
      // the original alone if a bounded number of passes cannot settle it.
      let stable = false;
      for (let pass = 0; pass < 4; pass++) {
        const document = TextDocument.create('embedded:documentation.html', 'html', 0, formatted);
        const next = TextDocument.applyEdits(document, html.format(document, undefined, {
          tabSize,
          insertSpaces: options.insertSpaces !== false,
          wrapLineLength: typeof options.printWidth === 'number' ? options.printWidth : 100,
          indentInnerHtml: true,
          contentUnformatted: 'pre,code,textarea,script,style',
          preserveNewLines: true,
          endWithNewline: false,
        }));
        if (next === formatted) {
          stable = true;
          break;
        }
        formatted = next;
      }
      if (!stable) return node.text;
    } else {
      formatted = formatXml(markup, {
        indentation: options.insertSpaces === false ? '\t' : ' '.repeat(tabSize),
        lineSeparator: eol,
        collapseContent: true,
        strictMode: true,
        throwOnFailure: true,
      });
    }
    if (formatted === markup) return node.text;
    // Keep the document's line-ending convention and re-escape for Modelica,
    // rather than inserting raw attribute quotes or backslashes into a string.
    return encodeString(formatted.replace(/\r\n|\r|\n/g, eol));
  } catch {
    // Unsupported/malformed markup must not prevent formatting the Modelica.
    return node.text;
  }
}
