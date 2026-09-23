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
import { DocumentHighlight, DocumentHighlightKind, Position } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

interface Scope {
  parent?: Scope;
  symbols: Map<string, Symbol>;
  encapsulated?: boolean;
  classScope?: boolean;
  inherited?: boolean;
}
interface Symbol {
  id: number;
  scope: Scope;
  body?: Scope;
  type?: Node;
  outerVisible: boolean;
}
interface Occurrence { node: Node; symbol: Symbol }

/**
 * Build a request-local binding index from the current buffer only. Unknown
 * bindings are omitted rather than guessed by spelling. No library IO or
 * retained trees: highlighting a cursor must not index a workspace.
 */
export function documentHighlights(parser: Parser, document: TextDocument, position: Position): DocumentHighlight[] {
  const tree = parser.parse(document.getText());
  if (!tree) return [];
  try {
    const root: Scope = { symbols: new Map() };
    const scopes = new Map<number, Scope>();
    const declarations = new Map<number, Symbol>();
    const occurrences: Occurrence[] = [];
    const declare = (identifier: Node | null | undefined, scope: Scope, body?: Scope, type?: Node, outerVisible = !!body): Symbol | undefined => {
      if (!identifier) return undefined;
      const symbol = { id: identifier.id, scope, body, type, outerVisible };
      scope.symbols.set(identifier.text, symbol);
      declarations.set(identifier.id, symbol);
      occurrences.push({ node: identifier, symbol });
      return symbol;
    };
    const bind = (node: Node, outer: Scope): void => {
      if (node.type === 'ERROR') return;
      const indices = node.childForFieldName('indices');
      if (indices?.type === 'for_indices') {
        // Each index becomes visible only after its range, including in
        // subsequent ranges. This also covers comprehensions and reductions.
        let scope = outer;
        for (const index of indices.namedChildren) {
          const identifier = index.childForFieldName('identifier');
          for (const child of index.namedChildren) {
            if (child.id !== identifier?.id) bind(child, scope);
          }
          scope = { parent: scope, symbols: new Map() };
          declare(identifier, scope);
          scopes.set(index.id, scope);
        }
        scopes.set(node.id, scope);
        for (const child of node.namedChildren) if (child.id !== indices.id) bind(child, scope);
        return;
      }
      let scope = outer;
      if (node.type === 'class_definition') {
        scope = { parent: outer, symbols: new Map(), classScope: true, encapsulated: node.children.some(child => child.type === 'encapsulated') };
        const specifier = node.childForFieldName('classSpecifier');
        const symbol = declare(specifier?.childForFieldName('identifier'), outer, scope);
        const end = specifier?.childForFieldName('endIdentifier');
        if (symbol && end && end.text === specifier?.childForFieldName('identifier')?.text) {
          declarations.set(end.id, symbol);
          occurrences.push({ node: end, symbol });
        }
      }
      scopes.set(node.id, scope);
      if (node.type === 'component_clause') {
        const type = node.childForFieldName('typeSpecifier')?.childForFieldName('name') ?? undefined;
        const constant = type && /\bconstant\b/.test(node.text.slice(0, type.startIndex - node.startIndex));
        for (const component of node.childForFieldName('componentDeclarations')?.namedChildren ?? []) {
          declare(component.childForFieldName('declaration')?.childForFieldName('identifier'), scope, undefined, type, !!constant);
        }
      } else if (node.type === 'enumeration_literal') {
        declare(node.childForFieldName('identifier'), scope, undefined, undefined, true);
      } else if (node.type === 'extends_clause') {
        scope.inherited = true;
      } else if (node.type === 'import_clause') {
        const alias = node.childForFieldName('alias');
        const name = node.childForFieldName('name');
        // Bind explicit imports locally; group/wildcard imports need semantic lookup.
        if (name && !node.text.includes('*') && !node.text.includes('{')) {
          declare(alias ?? name.childForFieldName('identifier'), scope, undefined, undefined, true);
        }
      }
      for (const child of node.namedChildren) bind(child, scope);
    };
    bind(tree.rootNode, root);

    const lookup = (scope: Scope, name: string): Symbol | undefined => {
      let current: Scope | undefined = scope;
      let crossedClass = false;
      while (current) {
        const symbol = current.symbols.get(name);
        if (symbol) return !crossedClass || symbol.outerVisible ? symbol : undefined;
        // An unresolved inherited member may shadow an enclosing declaration.
        if (current.inherited) return undefined;
        if (current.encapsulated) return root.symbols.get(name);
        crossedClass ||= !!current.classScope;
        current = current.parent;
      }
      return undefined;
    };
    const chain = (node: Node): Node[] => {
      const qualifier = node.childForFieldName('qualifier');
      const identifier = node.childForFieldName('identifier');
      return [...(qualifier ? chain(qualifier) : []), ...(identifier ? [identifier] : [])];
    };
    const resolve = (node: Node, scope: Scope, seen = new Set<number>()): (Symbol | undefined)[] => {
      const identifiers = chain(node);
      let symbol = node.text.startsWith('.') ? root.symbols.get(identifiers[0]?.text) : lookup(scope, identifiers[0]?.text);
      const result = [symbol];
      for (const identifier of identifiers.slice(1)) {
        let body = symbol?.body;
        if (!body && symbol?.type && !seen.has(symbol.id)) {
          const visited = new Set(seen).add(symbol.id);
          body = resolve(symbol.type, symbol.scope, visited).at(-1)?.body;
        }
        symbol = body?.symbols.get(identifier.text);
        result.push(symbol);
      }
      return result;
    };
    const visit = (node: Node): void => {
      if (node.type === 'ERROR') return;
      const scope = scopes.get(node.id) ?? root;
      if ((node.type === 'component_reference' || node.type === 'name') && node.parent?.type !== node.type) {
        // Modification labels and import paths are not lexical variable uses.
        // Index/range expressions are visited independently below.
        const parent = node.parent?.type;
        const isNameUse = node.type === 'component_reference' ||
          ['type_specifier', 'extends_clause', 'der_class_specifier'].includes(parent ?? '');
        if (isNameUse) {
          const resolved = resolve(node, scope);
          for (const [index, identifier] of chain(node).entries()) {
            const symbol = resolved[index];
            if (symbol && !declarations.has(identifier.id)) occurrences.push({ node: identifier, symbol });
          }
        }
      }
      for (const child of node.namedChildren) visit(child);
    };
    visit(tree.rootNode);
    const offset = document.offsetAt(position);
    const selected = occurrences.find(item => item.node.startIndex <= offset && offset < item.node.endIndex) ??
      occurrences.find(item => item.node.endIndex === offset);
    if (!selected) return [];
    const unique = new Map<number, Node>();
    for (const occurrence of occurrences) {
      if (occurrence.symbol.id === selected.symbol.id) unique.set(occurrence.node.startIndex, occurrence.node);
    }
    return [...unique.values()].sort((a, b) => a.startIndex - b.startIndex).map(node => ({
      range: { start: document.positionAt(node.startIndex), end: document.positionAt(node.endIndex) },
      // Equations are not directional assignments; do not invent read/write semantics.
      kind: DocumentHighlightKind.Text,
    }));
  } finally {
    tree.delete();
  }
}
