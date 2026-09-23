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
import { FormattingOptions, Range, TextEdit } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { formatDocumentation } from './documentationFormatting';

interface Token {
  node: Node;
  level: number;
  breakBefore: boolean;
}

const lists = new Set(['stored_definitions', 'element_list', 'equation_list', 'statement_list']);
const sections = new Set([
  'public_element_list', 'protected_element_list', 'equation_section', 'algorithm_section',
]);
const classes = new Set(['long_class_specifier', 'extends_class_specifier']);
const controls = /^(if|for|when|while)_(equation|statement)$|^else_(if|when)_(equation|statement)_clause$/;
const operators = new Set(['=', ':=', '+', '-', '*', '/', '^', '.+', '.-', '.*', './', '.^',
  '<', '>', '<=', '>=', '==', '<>']);
const isComment = (node: Node): boolean => node.type === 'comment' || node.type === 'BLOCK_COMMENT';

/** Collect lexical tokens, deriving block indentation from syntax rather than keywords in text. */
function collect(node: Node, level: number, tokens: Token[], breakBefore = false): void {
  const first = tokens.length;
  // Strings, quoted identifiers and comments are indivisible: never edit their contents.
  if (node.childCount === 0 || ['STRING', 'IDENT', 'comment'].includes(node.type)) {
    tokens.push({ node, level, breakBefore });
    return;
  }
  let insideDelimiter = false;
  for (const child of node.children) {
    let childLevel = level;
    let childBreak = false;
    if (classes.has(node.type)) {
      if (child.type === 'element_list' || child.type === 'external_clause' ||
          child.type === 'annotation_clause' || isComment(child)) {
        childLevel++;
        childBreak = true;
      } else if (sections.has(child.type) || child.type === 'end') {
        childBreak = true;
      }
    } else if (sections.has(node.type)) {
      if (child.isNamed) {
        childLevel++;
        childBreak = true;
      }
    } else if (lists.has(node.type)) {
      childBreak = child.isNamed;
    } else if (controls.test(node.type)) {
      if (child.type === 'equation_list' || child.type === 'statement_list') {
        childLevel++;
        childBreak = true;
      } else if (child.type === 'end' || child.type === 'else' ||
          child.type.startsWith('else_if_') || child.type.startsWith('else_when_')) {
        childBreak = true;
      }
    }
    if ([')', ']', '}'].includes(child.type)) insideDelimiter = false;
    if (insideDelimiter) childLevel++;
    if (child.type === 'description_string') childLevel++;
    collect(child, childLevel, tokens, childBreak);
    if (['(', '[', '{'].includes(child.type)) insideDelimiter = true;
  }
  if (tokens[first]) tokens[first].breakBefore ||= breakBefore;
}

function spaceBetween(previous: Node, current: Node): string {
  const left = previous.text;
  const right = current.text;
  if (isComment(previous) || isComment(current)) return ' ';
  if ([',', ';', ')', ']', '}', '.'].includes(right) || left === '.') return '';
  if (['(', '[', '{'].includes(left)) return '';
  if (right === ':' || left === ':') return '';
  if (left === ',' || left === ';') return ' ';
  if (operators.has(right) || operators.has(left)) {
    if (previous.parent?.type === 'unary_expression' && left !== 'not') return '';
    return ' ';
  }
  if (right === '(') {
    return ['annotation', 'if', 'elseif', 'when', 'elsewhen', 'while', 'not', 'and', 'or'].includes(left)
      ? ' ' : '';
  }
  if (right === '[') return '';
  return ' ';
}

/**
 * Format only whitespace gaps between syntax tokens. Range formatting expands to
 * complete selected lines, but uses the entire tree for indentation context.
 * Invalid/incomplete Modelica is left untouched. Strings and comments are
 * preserved unless documentation formatting is explicitly enabled.
 */
export function formatDocument(
  parser: Parser,
  document: TextDocument,
  options: FormattingOptions,
  range?: Range,
): TextEdit[] {
  const text = document.getText();
  const tree = parser.parse(text);
  if (!tree) return [];
  try {
    if (tree.rootNode.hasError) return [];
    const tokens: Token[] = [];
    collect(tree.rootNode, 0, tokens);
    if (tokens.length === 0) return [];
    const tabSize = Number.isInteger(options.tabSize) && options.tabSize > 0
      ? options.tabSize : 2;
    const indent = options.insertSpaces === false ? '\t' : ' '.repeat(tabSize);
    const width = typeof options.printWidth === 'number' && options.printWidth > 0
      ? options.printWidth : 100;
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    const start = range ? document.offsetAt({ line: range.start.line, character: 0 }) : 0;
    const end = range ? document.offsetAt({
      line: range.end.line + (range.end.character > 0 ? 1 : 0), character: 0,
    }) : text.length;
    const edits: TextEdit[] = [];
    const replaceGap = (from: number, to: number, value: string): void => {
      // Minimize each edit, so indentation on the first selected line does not
      // require replacing the preceding (unselected) newline.
      while (from < to && value.length && text[from] === value[0]) {
        from++;
        value = value.slice(1);
      }
      while (to > from && value.length && text[to - 1] === value[value.length - 1]) {
        to--;
        value = value.slice(0, -1);
      }
      if (from >= start && to <= end && (!range || from < end) &&
          text.slice(from, to) !== value) {
        edits.push(TextEdit.replace({ start: document.positionAt(from), end: document.positionAt(to) }, value));
      }
    };
    let column = 0;
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const previous = tokens[i - 1];
      const from = previous?.node.endIndex ?? 0;
      const gap = text.slice(from, token.node.startIndex);
      // A grammar may leave non-whitespace outside its leaf nodes. Never remove it.
      if (/\S/.test(gap)) return [];
      const existingBreak = /[\r\n]/.test(gap);
      const inlineComment = isComment(token.node) && previous && !existingBreak;
      const lineComment = previous && isComment(previous.node) && previous.node.text.startsWith('//');
      let newline = existingBreak || lineComment || (token.breakBefore && !inlineComment);
      const level = token.level;
      let whitespace = previous ? spaceBetween(previous.node, token.node) : '';
      if (previous?.node.text === ',' && !newline) {
        // Break at argument boundaries when the next argument exceeds the target width.
        let nextLength = 0;
        for (let j = i; j < tokens.length; j++) {
          if (j > i && (tokens[j].breakBefore || /[\r\n]/.test(text.slice(tokens[j - 1].node.endIndex, tokens[j].node.startIndex)))) break;
          nextLength += tokens[j].node.text.length + 1;
          if ([',', ';'].includes(tokens[j].node.text)) break;
        }
        if (column + nextLength > width) newline = true;
      }
      if (!previous) {
        whitespace = indent.repeat(level);
      } else if (newline) {
        const breaks = Math.min(2, (gap.match(/\n/g) ?? []).length || 1);
        whitespace = eol.repeat(breaks) + indent.repeat(level);
      }
      if (!range || token.node.startIndex >= start && token.node.startIndex < end) {
        replaceGap(from, token.node.startIndex, whitespace);
      }
      let tokenText = token.node.text;
      if (options.formatDocumentation === true && (!range ||
          token.node.startIndex >= document.offsetAt(range.start) &&
          token.node.endIndex <= document.offsetAt(range.end))) {
        tokenText = formatDocumentation(token.node, options, eol);
        if (tokenText !== token.node.text) {
          edits.push(TextEdit.replace({
            start: document.positionAt(token.node.startIndex),
            end: document.positionAt(token.node.endIndex),
          }, tokenText));
        }
      }
      const rendered = whitespace + tokenText;
      const lastNewline = rendered.lastIndexOf('\n');
      const tail = lastNewline >= 0 ? rendered.slice(lastNewline + 1) : rendered;
      column = (lastNewline >= 0 ? 0 : column) + tail.replace(/\t/g, ' '.repeat(tabSize)).length;
    }
    const last = tokens[tokens.length - 1].node;
    if (/\S/.test(text.slice(last.endIndex))) return [];
    // A final newline is conventional; preserve an explicit client's preference.
    let trailing = text.slice(last.endIndex);
    if (options.trimFinalNewlines) trailing = /[\r\n]/.test(trailing) ? eol : '';
    if (options.trimTrailingWhitespace !== false) trailing = trailing.replace(/[ \t]+(?=\r?$)/gm, '');
    if (options.insertFinalNewline !== false && !trailing.includes('\n')) trailing = eol;
    replaceGap(last.endIndex, text.length, trailing);
    return edits;
  } finally {
    tree.delete();
  }
}
