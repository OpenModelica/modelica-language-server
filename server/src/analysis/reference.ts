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

import { ModelicaDocument } from '../project/document';
import Parser from 'web-tree-sitter';

export type ReferenceKind = 'class' | 'variable';

export abstract class BaseUnresolvedReference {
  /**
   * The path to the symbol reference.
   */
  public readonly symbols: string[];

  public readonly kind: ReferenceKind | undefined;

  public constructor(symbols: string[], kind?: ReferenceKind) {
    if (symbols.length === 0) {
      throw new Error('Symbols length must be greater tham 0');
    }

    this.symbols = symbols;
    this.kind = kind;
  }

  public abstract isAbsolute(): this is UnresolvedAbsoluteReference;

  public abstract equals(other: unknown): boolean;
}

export class UnresolvedRelativeReference extends BaseUnresolvedReference {
  /**
   * The document that contains the `node`.
   */
  public readonly document: ModelicaDocument;

  /**
   * A `SyntaxNode` in which the symbol is in scope.
   */
  public readonly node: Parser.SyntaxNode;

  public constructor(
    document: ModelicaDocument,
    node: Parser.SyntaxNode,
    symbols: string[],
    kind?: ReferenceKind,
  ) {
    super(symbols, kind);
    this.document = document;
    this.node = node;
  }

  public isAbsolute(): this is UnresolvedAbsoluteReference {
    return false;
  }

  public equals(other: unknown): boolean {
    if (!(other instanceof UnresolvedRelativeReference)) {
      return false;
    }

    return (
      this.document.uri === other.document.uri &&
      this.node.equals(other.node) &&
      this.symbols.length === other.symbols.length &&
      this.symbols.every((s, i) => s === other.symbols[i]) &&
      this.kind === other.kind
    );
  }

  public toString(): string {
    const start = this.node.startPosition;
    return (
      `UnresolvedReference { ` +
      `symbols: ${this.symbols.join('.')}, ` +
      `kind: ${this.kind}, ` +
      `position: ${start.row + 1}:${start.column + 1}, ` +
      `document: "${this.document.path}" ` +
      `}`
    );
  }
}

export class UnresolvedAbsoluteReference extends BaseUnresolvedReference {
  public constructor(symbols: string[], kind?: ReferenceKind) {
    super(symbols, kind);
  }

  public isAbsolute(): this is UnresolvedAbsoluteReference {
    return true;
  }

  public equals(other: unknown): boolean {
    if (!(other instanceof UnresolvedAbsoluteReference)) {
      return false;
    }

    return (
      this.symbols.length === other.symbols.length &&
      this.symbols.every((s, i) => s === other.symbols[i]) &&
      this.kind === other.kind
    );
  }

  public toString(): string {
    return (
      `UnresolvedReference { ` +
      `symbols: <global>.${this.symbols.join('.')}, ` +
      `kind: ${this.kind} ` +
      `}`
    );
  }
}

/**
 * A possibly-valid reference to a symbol that must be resolved before use.
 */
export type UnresolvedReference = UnresolvedRelativeReference | UnresolvedAbsoluteReference;

/**
 * A valid, absolute reference to a symbol.
 */
export class ResolvedReference {
  /**
   * The document that contains the `node`.
   */
  readonly document: ModelicaDocument;

  /**
   * The node that declares/defines this symbol.
   */
  readonly node: Parser.SyntaxNode;

  /**
   * The full, absolute path to the symbol.
   */
  readonly symbols: string[];

  readonly kind: ReferenceKind;

  public constructor(
    document: ModelicaDocument,
    node: Parser.SyntaxNode,
    symbols: string[],
    kind: ReferenceKind,
  ) {
    if (symbols.length === 0) {
      throw new Error('Symbols length must be greater than 0.');
    }

    this.document = document;
    this.node = node;
    this.symbols = symbols;
    this.kind = kind;
  }

  public equals(other: unknown): boolean {
    if (!(other instanceof ResolvedReference)) {
      return false;
    }

    return (
      this.document.uri === other.document.uri &&
      this.node.equals(other.node) &&
      this.symbols.length === other.symbols.length &&
      this.symbols.every((s, i) => s === other.symbols[i]) &&
      this.kind === other.kind
    );
  }

  public toString(): string {
    return `Reference { symbols: <global>.${this.symbols.join('.')}, kind: ${this.kind} }`;
  }
}
