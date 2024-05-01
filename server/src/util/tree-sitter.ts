/*
 * This file is part of OpenModelica.
 *
 * Copyright (c) 1998-2024, Open Source Modelica Consortium (OSMC),
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

/* -----------------------------------------------------------------------------
 * Taken from bash-language-server and adapted to Modelica language server
 * https://github.com/bash-lsp/bash-language-server/blob/main/server/src/util/tree-sitter.ts
 * -----------------------------------------------------------------------------
 */

import * as LSP from "vscode-languageserver/node";
import Parser from "web-tree-sitter";
import { SyntaxNode } from "web-tree-sitter";

import { logger } from "./logger";
import { TextDocument } from "vscode-languageserver-textdocument";

type MaybePromise<T> = T | Promise<T>;

/**
 * Recursively iterate over all nodes in a tree.
 *
 * @param node      The node to start iterating from
 * @param callback  The callback to call for each node. Return false to stop following children.
 */
export function forEach(start: SyntaxNode, callback: (n: SyntaxNode) => void | boolean): void;
export function forEach(
  start: SyntaxNode,
  callback: (n: SyntaxNode) => Promise<void | boolean>,
): Promise<void>;
export function forEach(
  start: SyntaxNode,
  callback: (n: SyntaxNode) => MaybePromise<void | boolean>,
): MaybePromise<void>;
export function forEach(
  start: SyntaxNode,
  callback: (n: SyntaxNode) => MaybePromise<void | boolean>,
): MaybePromise<void> {
  const callbackResult = callback(start);
  if (typeof callbackResult === "object") {
    return callbackResult.then(async (callbackResult) => {
      const followChildren = callbackResult !== false;
      if (followChildren && start.children.length) {
        await Promise.all(start.children.map((n) => forEach(n, callback)));
      }
    });
  }

  const followChildren = callbackResult !== false;
  if (followChildren && start.children.length) {
    start.children.forEach((n) => forEach(n, callback));
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
export function findFirst(
  start: SyntaxNode,
  callback: (n: SyntaxNode) => boolean,
): SyntaxNode | null {
  const cursor = start.walk();
  let reachedRoot = false;
  let retracing = false;

  while (!reachedRoot) {
    const node = cursor.currentNode();
    if (callback(node) === true) {
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
    case "class_definition":
      return true;
    default:
      return false;
  }
}

/**
 * Tell if a node is a variable declaration.
 *
 * @param n Node of tree
 * @returns `true` if node is a variable declaration, `false` otherwise.
 */
export function isVariableDeclaration(n: SyntaxNode): boolean {
  switch (n.type) {
    case "component_clause":
    case "component_redeclaration":
      return true;
    case "named_element":
      return n.childForFieldName("classDefinition") == null;
    default:
      return false;
  }
}

/**
 * Tell if a node is an element list.
 *
 * @param n Node of tree
 * @returns `true` if node is an element list, `false` otherwise.
 */
export function isElementList(n: SyntaxNode): boolean {
  switch (n.type) {
    case "element_list":
    case "public_element_list":
    case "protected_element_list":
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
  const node = findFirst(start, (n: SyntaxNode) => n.type == "IDENT");
  return node?.text;
}

/**
 * Returns the identifier(s) declared by the given node, or `[]` if no
 * identifiers are declared.
 *
 * Note: this does not return any identifiers that are declared "inside" of the
 * node. For instance, calling `getDeclaredIdentifiers` on a class_definition
 * will only return the name of the class.
 *
 * @param node The node to check. Must be a declaration.
 * @returns The identifiers.
 */
export function getDeclaredIdentifiers(node: SyntaxNode): string[] {
  if (node == null) {
    throw new Error("getDeclaredIdentifiers called with null/undefined node");
  }

  // TODO: does this support all desired node types? Are we considering too many nodes?
  switch (node.type) {
    case "declaration":
    case "derivative_class_specifier":
    case "enumeration_class_specifier":
    case "extends_class_specifier":
    case "long_class_specifier":
    case "short_class_specifier":
    case "enumeration_literal":
    case "for_index":
      return [node.childForFieldName("identifier")!.text];
    case "stored_definitions":
    case "component_list":
    case "enum_list":
    case "element_list":
    case "public_element_list":
    case "protected_element_list":
    case "for_indices":
      return node.namedChildren.flatMap(getDeclaredIdentifiers);
    case "component_clause":
      return getDeclaredIdentifiers(node.childForFieldName("componentDeclarations")!);
    case "component_declaration":
      return getDeclaredIdentifiers(node.childForFieldName("declaration")!);
    case "component_redeclaration":
      return getDeclaredIdentifiers(node.childForFieldName("componentClause")!);
    case "stored_definition":
      return getDeclaredIdentifiers(node.childForFieldName("classDefinition")!);
    case "class_definition":
      return getDeclaredIdentifiers(node.childForFieldName("classSpecifier")!);
    case "for_equation":
    case "for_statement":
      return getDeclaredIdentifiers(node.childForFieldName("indices")!);
    case "named_element": {
      const definition =
        node.childForFieldName("classDefinition") ?? node.childForFieldName("componentClause")!;
      return getDeclaredIdentifiers(definition);
    }
    default:
      logger.warn(`getDeclaredIdentifiers: unknown node type ${node.type}`);
      return [];
  }
}

export function getDeclarationType(node: SyntaxNode): { symbols: string[]; global: boolean } {
  const typeSpecifier = findFirst(node, (child) => child.type === "type_specifier");
  if (!typeSpecifier) {
    throw new Error("Node does not contain a type_specifier");
  }

  return {
    symbols: getName(typeSpecifier.childForFieldName("name")!),
    global: typeSpecifier.childForFieldName("global") !== null,
  };
}

export function hasIdentifier(node: SyntaxNode | null, identifier: string): boolean {
  if (!node) {
    return false;
  }

  return getDeclaredIdentifiers(node).includes(identifier);
}

/**
 * Converts a name `SyntaxNode` into an array of the `IDENT`s in that node.
 */
export function getName(nameNode: SyntaxNode): string[] {
  return getNameIdentifiers(nameNode).map((identNode) => identNode.text);
}

/**
 * Converts a name `SyntaxNode` into an array of the `IDENT`s in that node.
 */
export function getNameIdentifiers(nameNode: SyntaxNode): Parser.SyntaxNode[] {
  if (nameNode.type !== "name") {
    throw new Error(`Expected a 'name' node; got '${nameNode.type}' (${nameNode.text})`);
  }

  const identNode = nameNode.childForFieldName("identifier")!;
  const qualifierNode = nameNode.childForFieldName("qualifier");
  if (qualifierNode) {
    const qualifier = getNameIdentifiers(qualifierNode);
    return [...qualifier, identNode];
  } else {
    return [identNode];
  }
}

/**
 * Get class prefixes from `class_definition` node.
 *
 * @param node  Class definition node.
 * @returns     String with class prefixes or `null` if no `class_prefixes` can be found.
 */
export function getClassPrefixes(node: SyntaxNode): string | null {
  if (node.type !== "class_definition") {
    return null;
  }

  const classPrefixNode = node.childForFieldName("classPrefixes");
  if (classPrefixNode == null || classPrefixNode.type !== "class_prefixes") {
    return null;
  }

  return classPrefixNode.text;
}

export function positionToPoint(position: LSP.Position): Parser.Point {
  return { row: position.line, column: position.character };
}

export function pointToPosition(point: Parser.Point): LSP.Position {
  return { line: point.row, character: point.column };
}

export function createLocationLink(
  document: TextDocument,
  node: Parser.SyntaxNode,
): LSP.LocationLink;
export function createLocationLink(
  documentUri: LSP.DocumentUri,
  node: Parser.SyntaxNode,
): LSP.LocationLink;
export function createLocationLink(
  document: TextDocument | LSP.DocumentUri,
  node: Parser.SyntaxNode,
): LSP.LocationLink {
  // TODO: properly set targetSelectionRange (e.g. the name of a function or variable).
  return {
    targetUri: typeof document === "string" ? document : document.uri,
    targetRange: {
      start: pointToPosition(node.startPosition),
      end: pointToPosition(node.endPosition),
    },
    targetSelectionRange: {
      start: pointToPosition(node.startPosition),
      end: pointToPosition(node.endPosition),
    },
  };
}
