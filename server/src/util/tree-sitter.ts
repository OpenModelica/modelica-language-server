/* --------------------------------------------------------------------------------------------
 * Copyright (c) 2018 Mads Hartmann
 * Copyright (C) 2023 Andreas Heuermann, Osman Karabel
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * Taken from bash-language-server and adapted to Modelica language server
 * https://github.com/bash-lsp/bash-language-server/blob/main/server/src/util/tree-sitter.ts
 * ------------------------------------------------------------------------------------------ */

import * as LSP from 'vscode-languageserver/node';
import { SyntaxNode } from 'web-tree-sitter';

import { logger } from './logger';

/**
 * Recursively iterate over all nodes in a tree.
 *
 * @param node      The node to start iterating from
 * @param callback  The callback to call for each node. Return false to stop following children.
 */
export function forEach(node: SyntaxNode, callback: (n: SyntaxNode) => void | boolean) {
  const followChildren = callback(node) !== false;
  if (followChildren && node.children.length) {
    node.children.forEach((n) => forEach(n, callback));
  }
}

/**
 * Find first node where callback returns true.
 *
 * Traverse tree depth first, left to right.
 *
 * @param start     The node to start iterating from
 * @param callback  Callback returning true if node is searched node.
 */
export function findFirst(start: SyntaxNode, callback: (n: SyntaxNode) => boolean): SyntaxNode | null {

  const cursor = start.walk();
  let reachedRoot = false;
  let retracing = false;

  while (!reachedRoot) {
    const node = cursor.currentNode();
    if (callback(node) === true ) {
      return node;
    }

    if (cursor.gotoFirstChild()) {
      continue;
    }

    if (cursor.gotoNextSibling()) {
      continue;
    }

    retracing = true;
    while (retracing) {
        if (!cursor.gotoParent()) {
            retracing = false;
            reachedRoot = true;
        }

        if (cursor.gotoNextSibling()) {
        retracing = false;
        }
    }
  }

  return null;
}

export function range(n: SyntaxNode): LSP.Range {
  return LSP.Range.create(
    n.startPosition.row,
    n.startPosition.column,
    n.endPosition.row,
    n.endPosition.column,
  );
}

/**
 * Tell if a node is a definition.
 *
 * @param n Node of tree
 * @returns `true` if node is a definition, `false` otherwise.
 */
export function isDefinition(n: SyntaxNode): boolean {
  switch (n.type) {
    case 'class_definition':
      return true;
    default:
      return false;
  }
}

export function findParent(
  start: SyntaxNode,
  predicate: (n: SyntaxNode) => boolean,
): SyntaxNode | null {
  let node = start.parent;
  while (node !== null) {
    if (predicate(node)) {
      return node;
    }
    node = node.parent;
  }
  return null;
}

/**
 * Get identifier from node.
 *
 * @param start   Syntax tree node.
 */
export function getIdentifier(start: SyntaxNode): string | undefined {

  const node = findFirst(start, (n: SyntaxNode) => n.type == 'IDENT');
  return node?.text;
}

/**
 * Get class prefixes from `class_definition` node.
 *
 * @param node  Class definition node.
 * @returns     String with class prefixes or `null` if no `class_prefixes` can be found.
 */
export function getClassPrefixes(node: SyntaxNode): string | null {

  if (node.type !== 'class_definition') {
    return null;
  }

  const classPrefixNode = node.childForFieldName('classPrefixes');
  if (classPrefixNode == null || classPrefixNode.type !== 'class_prefixes') {
    return null;
  }

  return classPrefixNode.text;
}
