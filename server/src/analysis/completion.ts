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


import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Node, Tree } from 'web-tree-sitter';
import { CompletionItem, CompletionItemKind, CompletionList, Position, TextEdit } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ModelicaProject, ModelicaLibrary } from '../project';
import { getClassPrefixes } from '../util/tree-sitter';

interface Word { text: string; start: number; end: number; identifier: boolean }
interface Context { prefix: string; qualifier: string[]; absolute: boolean; start: number; end: number; chainStart: number }

/** Small lexer: never suggest code in comments, strings or unfinished quoted identifiers. */
function completionContext(text: string, offset: number): Context | undefined {
  const tokens: Word[] = [];
  let i = 0;
  const push = (start: number, identifier: boolean) => {
    tokens.push({ text: text.slice(start, i), start, end: i, identifier });
  };
  while (i < offset) {
    const start = i;
    if (/\s/.test(text[i])) { i++; continue; }
    if (text.startsWith('//', i)) {
      const end = text.indexOf('\n', i + 2);
      if (end < 0 || end >= offset) return undefined;
      i = end + 1;
      tokens.length = 0;
    } else if (text.startsWith('/*', i)) {
      const end = text.indexOf('*/', i + 2);
      if (end < 0 || end + 2 > offset) return undefined;
      i = end + 2;
      tokens.length = 0;
    } else if (text[i] === '"' || text[i] === "'") {
      const quote = text[i++];
      let closed = false;
      while (i < offset) {
        if (text[i] === '\\') { i += 2; continue; }
        if (text[i++] === quote) { closed = true; break; }
      }
      if (!closed) return undefined;
      push(start, quote === "'");
    } else if (/[A-Za-z_]/.test(text[i])) {
      while (i < offset && /[A-Za-z_0-9]/.test(text[i])) i++;
      push(start, true);
    } else if (/[0-9]/.test(text[i])) {
      while (i < offset && /[0-9.eE+-]/.test(text[i])) i++;
      push(start, false);
    } else {
      i++;
      push(start, false);
    }
    // Only the immediate qualified name matters, not every preceding token.
    if (tokens.length > 128) tokens.splice(0, 64);
  }
  const last = tokens.at(-1);
  let prefix = '';
  let start = offset;
  if (last?.end === offset && last.identifier && !last.text.startsWith("'")) {
    prefix = last.text;
    start = last.start;
    tokens.pop();
  } else if (last?.end === offset && (last.identifier || /[0-9]/.test(last.text[0]))) {
    return undefined;
  }
  const qualifier: string[] = [];
  let absolute = false;
  let chainStart = start;
  while (tokens.at(-1)?.text === '.') {
    const dot = tokens.pop();
    if (!dot) break;
    chainStart = dot.start;
    const word = tokens.at(-1);
    if (!word?.identifier) {
      if (word && /^[0-9]/.test(word.text)) return undefined;
      absolute = true;
      break;
    }
    tokens.pop();
    qualifier.unshift(word.text);
    chainStart = word.start;
  }
  const suffix = /^[A-Za-z_0-9]*/.exec(text.slice(offset))?.[0] ?? '';
  return { prefix, qualifier, absolute, start, end: offset + suffix.length, chainStart };
}

interface Scope { node: Node; uri: string; library?: ModelicaLibrary }
interface Candidate {
  label: string;
  kind: CompletionItemKind;
  detail?: string;
  scope?: Scope;
  imported?: string[];
  constant?: boolean;
}

function className(node: Node): string | undefined {
  return node.childForFieldName('classSpecifier')?.childForFieldName('identifier')?.text;
}

function classCandidate(scope: Scope): Candidate | undefined {
  const label = className(scope.node);
  if (!label) return undefined;
  const detail = getClassPrefixes(scope.node) ?? 'class';
  const kind = /\bpackage\b/.test(detail) ? CompletionItemKind.Module :
    /\bfunction\b/.test(detail) ? CompletionItemKind.Function :
    /\btype\b/.test(detail) ? CompletionItemKind.TypeParameter : CompletionItemKind.Class;
  return { label, kind, detail, scope };
}

/** Immediate declarations only: never leak declarations from sibling/nested class bodies. */
function members(scope: Scope, external: boolean): Candidate[] {
  const result: Candidate[] = [];
  const visit = (node: Node): void => {
    if (external && node.type === 'protected_element_list') return;
    if (['equation_section', 'algorithm_section', 'modification', 'annotation_clause', 'extends_clause'].includes(node.type)) return;
    if (node.type === 'class_definition' && node.id !== scope.node.id) {
      const candidate = classCandidate({ ...scope, node });
      if (candidate) result.push(candidate);
      return;
    }
    if (node.type === 'import_clause') {
      const name = node.childForFieldName('name');
      // Explicit imports and aliases only; wildcard/group imports are a follow-up.
      if (name && !node.text.includes('*') && !node.text.includes('{')) {
        const identifiers = name.text.match(/'(?:\\.|[^'\\])*'|[A-Za-z_][A-Za-z_0-9]*/g) ?? [];
        const label = node.childForFieldName('alias')?.text ?? identifiers.at(-1);
        if (label) result.push({ label, kind: CompletionItemKind.Module, imported: identifiers, detail: 'import ' + name.text });
      }
      return;
    }
    if (node.type === 'component_clause') {
      const detail = node.childForFieldName('typeSpecifier')?.text;
      const constant = /\bconstant\b/.test(node.childForFieldName('typePrefix')?.text ?? node.text.split(detail ?? '\0')[0]);
      const declarations = node.childForFieldName('componentDeclarations');
      for (const component of declarations?.namedChildren ?? []) {
        const label = component.childForFieldName('declaration')?.childForFieldName('identifier')?.text;
        if (label) result.push({ label, kind: constant ? CompletionItemKind.Constant : CompletionItemKind.Variable, detail, constant });
      }
      return;
    }
    if (node.type === 'enumeration_literal') {
      const label = node.childForFieldName('identifier')?.text;
      if (label) result.push({ label, kind: CompletionItemKind.EnumMember });
      return;
    }
    for (const child of node.namedChildren) visit(child);
  };
  visit(scope.node);
  return result;
}

/**
 * Basic lexical/class completion. Only requested package paths are parsed;
 * immediate sibling filenames can be suggested without opening every file.
 */
export function completeDocument(
  project: ModelicaProject,
  document: TextDocument,
  position: Position,
  openDocument: (uri: string) => TextDocument | undefined = () => undefined,
): CompletionList {
  const empty = { isIncomplete: false, items: [] };
  const text = document.getText();
  const offset = document.offsetAt(position);
  const context = completionContext(text, offset);
  if (!context) return empty;
  const trees: Tree[] = [];
  const snapshots = new Map<string, Tree>();
  const parse = (source: string): Tree => {
    const tree = project.parser.parse(source);
    if (!tree) throw new Error('Completion parser did not return a tree');
    trees.push(tree);
    return tree;
  };
  try {
    // Blank the unfinished name without shifting any source positions. This
    // also recovers class scopes from an unfinished type on a declaration line.
    const masked = text.slice(0, context.chainStart) +
      text.slice(context.chainStart, context.end).replace(/[^\r\n]/g, ' ') + text.slice(context.end);
    const tree = parse(masked);
    snapshots.set(document.uri, tree);
    const filename = document.uri.startsWith('file:') ? fileURLToPath(document.uri) : undefined;
    const library = filename ? project.libraries.find(lib => {
      const relative = path.relative(lib.path, filename);
      return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
    }) : undefined;
    const scopes: Scope[] = [];
    const findScopes = (node: Node): void => {
      if (node.startIndex > offset || node.endIndex < offset) return;
      if (node.type === 'class_definition') scopes.unshift({ node, uri: document.uri, library });
      for (const child of node.namedChildren) findScopes(child);
    };
    findScopes(tree.rootNode);
    const rootScope: Scope = { node: tree.rootNode, uri: document.uri, library };
    const visible = new Map<string, Candidate>();
    const add = (candidate: Candidate) => { if (!visible.has(candidate.label)) visible.set(candidate.label, candidate); };
    for (const [i, scope] of scopes.entries()) {
      for (const candidate of members(scope, false)) {
        if (i === 0 || candidate.scope || candidate.imported || candidate.constant) add(candidate);
      }
      if (scope.node.children.some(child => child.type === 'encapsulated')) break;
    }
    for (const candidate of members(rootScope, false)) add(candidate);

    const loadScope = (library: ModelicaLibrary, filename: string, name: string): Scope | undefined => {
      const uri = pathToFileURL(filename).toString();
      let loadedTree = snapshots.get(uri);
      if (!loadedTree) {
        const opened = openDocument(uri);
        if (opened) {
          loadedTree = parse(opened.getText());
          snapshots.set(uri, loadedTree);
        } else {
          loadedTree = library.getOrLoadDocument(filename)?.tree;
        }
      }
      if (!loadedTree) return undefined;
      const candidate = members({ node: loadedTree.rootNode, uri, library }, true).find(item => item.label === name);
      return candidate?.scope;
    };
    const directory = (scope: Scope): string | undefined => {
      if (!scope.uri.startsWith('file:') || !/\bpackage\b/.test(getClassPrefixes(scope.node) ?? '')) return undefined;
      const filename = fileURLToPath(scope.uri);
      // Only a top-level package.mo owns a directory. An inline subpackage
      // must not inherit its enclosing package's sibling files.
      return path.basename(filename) === 'package.mo' && scope.node.parent?.type === 'stored_definition'
        ? path.dirname(filename) : undefined;
    };
    const childScope = (scope: Scope, name: string): Scope | undefined => {
      const direct = members(scope, true).find(item => item.label === name);
      if (direct) return direct.scope;
      const folder = directory(scope);
      if (!folder || !scope.library || !/^[A-Za-z_][A-Za-z_0-9]*$/.test(name)) return undefined;
      for (const filename of [path.join(folder, name + '.mo'), path.join(folder, name, 'package.mo')]) {
        if (fs.existsSync(filename) && fs.statSync(filename).isFile()) return loadScope(scope.library, filename, name);
      }
      return undefined;
    };
    const absoluteScope = (names: string[]): Scope | undefined => {
      const library = project.libraries.find(lib => lib.name === names[0]);
      if (!library) return undefined;
      let scope: Scope | undefined;
      for (const filename of [path.join(library.path, 'package.mo'), path.join(library.path, library.name + '.mo')]) {
        if (fs.existsSync(filename)) {
          scope = loadScope(library, filename, library.name);
          if (scope) break;
        }
      }
      for (const name of names.slice(1)) scope = scope && childScope(scope, name);
      return scope;
    };
    const withFiles = (scope: Scope): Candidate[] => {
      const result = members(scope, true);
      const folder = directory(scope);
      if (folder) {
        for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
          const label = entry.isFile() && entry.name.endsWith('.mo') ? entry.name.slice(0, -3) : entry.name;
          if (label === 'package' || !/^[A-Za-z_][A-Za-z_0-9]*$/.test(label)) continue;
          if (entry.isFile() && entry.name.endsWith('.mo') ||
              entry.isDirectory() && fs.existsSync(path.join(folder, entry.name, 'package.mo'))) {
            result.push({ label, kind: entry.isDirectory() ? CompletionItemKind.Module : CompletionItemKind.Class });
          }
        }
      }
      return result;
    };

    let candidates: Candidate[];
    if (context.qualifier.length) {
      const [first, ...rest] = context.qualifier;
      const local = context.absolute ? undefined : visible.get(first);
      let target = local?.scope;
      if (local?.imported) target = absoluteScope(local.imported);
      if (!local) target = absoluteScope([first]);
      for (const name of rest) target = target && childScope(target, name);
      candidates = target ? withFiles(target) : [];
    } else {
      if (!context.absolute) {
        for (const label of ['Real', 'Integer', 'Boolean', 'String', 'Clock']) {
          add({ label, kind: CompletionItemKind.TypeParameter, detail: 'built-in type' });
        }
      }
      candidates = context.absolute ? [] : [...visible.values()];
      for (const library of project.libraries) {
        if (context.absolute || !visible.has(library.name)) candidates.push({ label: library.name, kind: CompletionItemKind.Module });
      }
    }
    const distinct = new Map<string, Candidate>();
    for (const item of candidates) {
      if (item.label.startsWith(context.prefix) && !distinct.has(item.label)) distinct.set(item.label, item);
    }
    const items: CompletionItem[] = [...distinct.values()].sort((a, b) => a.label.localeCompare(b.label)).slice(0, 200).map(item => ({
      label: item.label,
      kind: item.kind,
      ...(item.detail ? { detail: item.detail } : {}),
      textEdit: TextEdit.replace({ start: document.positionAt(context.start), end: document.positionAt(context.end) }, item.label),
    }));
    return { isIncomplete: distinct.size > items.length, items };
  } finally {
    for (const tree of trees) tree.delete();
  }
}
