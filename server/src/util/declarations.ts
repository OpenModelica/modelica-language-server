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

/* --------------------------------------------------------------------------------------------
 * Taken from bash-language-server and adapted to Modelica language server
 * https://github.com/bash-lsp/bash-language-server/blob/main/server/src/util/declarations.ts
 * ------------------------------------------------------------------------------------------ */

import * as LSP from 'vscode-languageserver/node';
import * as Parser from 'web-tree-sitter';

import * as TreeSitterUtil from './tree-sitter';
import { logger } from './logger';

const isEmpty = (data: string): boolean => typeof data === "string" && data.trim().length == 0;

export type GlobalDeclarations = { [word: string]: LSP.SymbolInformation }
export type Declarations = { [word: string]: LSP.SymbolInformation[] }

const GLOBAL_DECLARATION_LEAF_NODE_TYPES = new Set([
  'if_statement',
  'function_definition',
]);

/**
 * Returns all declarations (functions or variables) from a given tree.
 *
 * @param tree  Tree-sitter tree.
 * @param uri   The document's uri.
 * @returns     Symbol information for all declarations.
 */
export function getAllDeclarationsInTree(tree: Parser.Tree, uri: string): LSP.SymbolInformation[] {
  const symbols: LSP.SymbolInformation[] = [];

  TreeSitterUtil.forEach(tree.rootNode, (node) => {
    const symbol = getDeclarationSymbolFromNode(node, uri);
    if (symbol) {
      symbols.push(symbol);
    }
  });

  return symbols;
}

/**
 * Converts node to symbol information.
 *
 * @param tree  Tree-sitter tree.
 * @param uri   The document's uri.
 * @returns     Symbol information from node.
 */
export function nodeToSymbolInformation(node: Parser.SyntaxNode, uri: string): LSP.SymbolInformation | null {
  const named = node.firstNamedChild;

  if (named === null) {
    return null;
  }

  const name = TreeSitterUtil.getIdentifier(node);
  if (name === undefined || isEmpty(name)) {
    return null;
  }

  const kind = getKind(node);

  const containerName =
    TreeSitterUtil.findParent(node, (p) => p.type === 'function_definition')
      ?.firstNamedChild?.text || '';

  return LSP.SymbolInformation.create(
    name,
    kind || LSP.SymbolKind.Variable,
    TreeSitterUtil.range(node),
    uri,
    containerName,
  );
}

/**
 * Get declaration from node and convert to symbol information.
 *
 * @param node  Root node of tree.
 * @param uri   The associated URI for this document.
 * @returns     LSP symbol information for definition.
 */
function getDeclarationSymbolFromNode(node: Parser.SyntaxNode, uri: string): LSP.SymbolInformation | null {
  if (TreeSitterUtil.isDefinition(node)) {
    return nodeToSymbolInformation(node, uri);
  }

  return null;
}

/**
 * Returns symbol kind from class definition node.
 *
 * @param node Node containing class_definition
 * @returns Symbol kind or `undefined`.
 */
function getKind(node: Parser.SyntaxNode): LSP.SymbolKind | undefined {

  const classPrefixes = TreeSitterUtil.getClassPrefixes(node)?.split(/\s+/);
  if (classPrefixes === undefined) {
    return undefined;
  }

  switch (classPrefixes[classPrefixes.length - 1]) {
    case 'block':
    case 'class':
    case 'connector':
    case 'model':
      return LSP.SymbolKind.Class;
    case 'function':
    case 'operator':
      return LSP.SymbolKind.Function;
    case 'package':
    case 'record':
      return LSP.SymbolKind.Package;
    case 'type':
      return LSP.SymbolKind.TypeParameter;
    default:
      return undefined;
  }
}
