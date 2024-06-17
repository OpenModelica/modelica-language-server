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
