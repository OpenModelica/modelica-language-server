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

/* -----------------------------------------------------------------------------
 * Taken from bash-language-server and adapted to Modelica language server
 * https://github.com/bash-lsp/bash-language-server/blob/main/server/src/util/tree-sitter.ts
 * -----------------------------------------------------------------------------
 */

import { Node as SyntaxNode, Point } from 'web-tree-sitter';
import * as LSP from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

/**
 * Recursively iterate over all nodes in a tree.
 *
 * @param node      The node to start iterating from
 * @param callback  The callback to call for each node. Return false to stop following children.
 */
export function forEach(node: SyntaxNode, callback: (n: SyntaxNode) => void | boolean): void {
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
export function findFirst(
  start: SyntaxNode,
  callback: (n: SyntaxNode) => boolean,
): SyntaxNode | null {
  const cursor = start.walk();
  let reachedRoot = false;

  while (!reachedRoot) {
    const node = cursor.currentNode;
    if (callback(node) === true) {
      return node;
    }

    if (cursor.gotoFirstChild()) {
      continue;
    }

    if (cursor.gotoNextSibling()) {
      continue;
    }

    while (true) {
      if (!cursor.gotoParent()) {
        reachedRoot = true;
        break;
      }
      if (cursor.gotoNextSibling()) {
        break;
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

/**
 * Get input/output prefix from node.
 *
 * @param n Node of tree
 * @returns Base prefix or undefined.
 */
export function getPrefix(n: SyntaxNode): string | undefined {
  switch (n.type) {
    case 'short_class_specifier':
      return n.childForFieldName('basePrefix')?.text;
    case 'component_clause':
      return n.childForFieldName('input')?.text || n.childForFieldName('output')?.text;
    default:
      return undefined;
  }
}

/**
 * Check if node is parameter.
 *
 * @param n Node of tree
 * @returns True if node has parameter keyword.
 */
export function isParameter(n: SyntaxNode): boolean {
  switch (n.type) {
    case 'component_clause':
      return n.childForFieldName('parameter') !== null;
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
    case 'component_clause':
    case 'component_redeclaration':
      return true;
    case 'named_element':
      return n.childForFieldName('classDefinition') == null;
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
    case 'element_list':
    case 'public_element_list':
    case 'protected_element_list':
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
 * Returns the child of `node` for the given `fieldName`.
 *
 * Use this for fields that the grammar guarantees to be present: it throws a
 * descriptive error instead of returning `null`, so a grammar mismatch fails
 * loudly rather than as an opaque `undefined` access further down.
 *
 * @param node      The node to read the field from.
 * @param fieldName The name of the field.
 * @returns The child node for the field.
 */
export function requireFieldName(node: SyntaxNode, fieldName: string): SyntaxNode {
  const child = node.childForFieldName(fieldName);
  if (!child) {
    throw new Error(`Expected node '${node.type}' to have a '${fieldName}' field`);
  }
  return child;
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
    throw new Error('getDeclaredIdentifiers called with null/undefined node');
  }

  // TODO: does this support all desired node types? Are we considering too many nodes?
  switch (node.type) {
    case 'declaration':
    case 'derivative_class_specifier':
    case 'enumeration_class_specifier':
    case 'extends_class_specifier':
    case 'long_class_specifier':
    case 'short_class_specifier':
    case 'enumeration_literal':
    case 'for_index':
      return [requireFieldName(node, 'identifier').text];
    case 'stored_definitions':
    case 'component_list':
    case 'enum_list':
    case 'element_list':
    case 'public_element_list':
    case 'protected_element_list':
    case 'for_indices':
      return node.namedChildren.flatMap(getDeclaredIdentifiers);
    case 'component_clause':
      return getDeclaredIdentifiers(requireFieldName(node, 'componentDeclarations'));
    case 'component_declaration':
      return getDeclaredIdentifiers(requireFieldName(node, 'declaration'));
    case 'component_redeclaration':
      return getDeclaredIdentifiers(requireFieldName(node, 'componentClause'));
    case 'stored_definition':
      return getDeclaredIdentifiers(requireFieldName(node, 'classDefinition'));
    case 'class_definition':
      return getDeclaredIdentifiers(requireFieldName(node, 'classSpecifier'));
    case 'for_equation':
    case 'for_statement':
      return getDeclaredIdentifiers(requireFieldName(node, 'indices'));
    case 'named_element': {
      const definition =
        node.childForFieldName('classDefinition') ?? requireFieldName(node, 'componentClause');
      return getDeclaredIdentifiers(definition);
    }
    default:
      return [];
  }
}

export function hasIdentifier(node: SyntaxNode | null, identifier: string): boolean {
  if (!node) {
    return false;
  }

  return getDeclaredIdentifiers(node).includes(identifier);
}

export interface TypeSpecifier {
  isGlobal: boolean;
  symbols: string[];
  symbolNodes: SyntaxNode[];
}

export function getTypeSpecifier(node: SyntaxNode): TypeSpecifier {
  switch (node.type) {
    case 'type_specifier': {
      const isGlobal = node.childForFieldName('global') !== null;
      const name = requireFieldName(node, 'name');
      const symbolNodes = getNameIdentifiers(name);
      return {
        isGlobal,
        symbols: symbolNodes.map((id) => id.text),
        symbolNodes,
      };
    }
    case 'name': {
      const symbolNodes = getNameIdentifiers(node);
      return {
        isGlobal: false,
        symbols: symbolNodes.map((id) => id.text),
        symbolNodes,
      };
    }
    case 'IDENT':
      return {
        isGlobal: false,
        symbols: [node.text],
        symbolNodes: [node],
      };
    default: {
      const typeSpecifier = findFirst(node, (child) => child.type === 'type_specifier');
      if (typeSpecifier) {
        return getTypeSpecifier(typeSpecifier);
      }

      const name = findFirst(node, (child) => child.type === 'name');
      if (name) {
        return getTypeSpecifier(name);
      }

      throw new Error('Syntax node does not contain a type_specifier or name');
    }
  }
}

// TODO: this does not handle indexing arrays
export interface ComponentReference {
  isGlobal: boolean;
  components: string[];
  componentNodes: SyntaxNode[];
}

export function getComponentReference(node: SyntaxNode): ComponentReference {
  switch (node.type) {
    case 'component_reference': {
      const isGlobal = node.childForFieldName('global') !== null;
      const componentNodes = getNameIdentifiers(node);

      return {
        isGlobal,
        components: componentNodes.map((id) => id.text),
        componentNodes,
      };
    }
    case 'IDENT':
      return {
        isGlobal: false,
        components: [node.text],
        componentNodes: [node],
      };
    default: {
      const componentRef = findFirst(node, (child) => child.type === 'component_reference');
      if (componentRef) {
        return getComponentReference(componentRef);
      }

      throw new Error('Syntax node does not contain a component_reference');
    }
  }
}

/**
 * Converts a name `SyntaxNode` into an array of the `IDENT`s in that node.
 */
function getNameIdentifiers(nameNode: SyntaxNode): SyntaxNode[] {
  if (nameNode.type !== 'name' && nameNode.type !== 'component_reference') {
    throw new Error(
      `Expected a 'name' or 'component_reference' node; got '${nameNode.type}' (${nameNode.text})`,
    );
  }

  const identNode = requireFieldName(nameNode, 'identifier');
  const qualifierNode = nameNode.childForFieldName('qualifier');
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
  if (node.type !== 'class_definition') {
    return null;
  }

  const classPrefixNode = node.childForFieldName('classPrefixes');
  if (classPrefixNode == null || classPrefixNode.type !== 'class_prefixes') {
    return null;
  }

  return classPrefixNode.text;
}

/**
 * Get description string.
 *
 * @param node  Syntax node
 * @returns     Description string of node.
 */
export function getDescriptionString(node: SyntaxNode): string | undefined {
  let classNode: SyntaxNode | null;

  switch (node.type) {
    case 'class_definition':
      classNode = node.childForFieldName('classSpecifier');
      if (classNode !== null) {
        return getDescriptionString(classNode);
      }
      return undefined;
    default:
      return node.childForFieldName('descriptionString')?.text;
  }
}

export function positionToPoint(position: LSP.Position): Point {
  return { row: position.line, column: position.character };
}

export function pointToPosition(point: Point): LSP.Position {
  return { line: point.row, character: point.column };
}

export function createLocationLink(
  document: TextDocument,
  node: SyntaxNode,
): LSP.LocationLink;
export function createLocationLink(
  documentUri: LSP.DocumentUri,
  node: SyntaxNode,
): LSP.LocationLink;
export function createLocationLink(
  document: TextDocument | LSP.DocumentUri,
  node: SyntaxNode,
): LSP.LocationLink {
  // TODO: properly set targetSelectionRange (e.g. the name of a function or variable).
  return {
    targetUri: typeof document === 'string' ? document : document.uri,
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
