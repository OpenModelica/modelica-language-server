import { ModelicaDocument } from "../project/document";
import Parser from "web-tree-sitter";

export abstract class BaseUnresolvedReference {
  /**
   * The path to the symbol reference.
   */
  public readonly symbols: string[];

  public constructor(symbols: string[]) {
    if (symbols.length === 0) {
      throw new Error("Symbols length must be greater tham 0");
    }

    this.symbols = symbols;
  }

  public abstract isAbsolute(): this is UnresolvedAbsoluteReference;
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

  public constructor(document: ModelicaDocument, node: Parser.SyntaxNode, symbols: string[]) {
    super(symbols);
    this.document = document;
    this.node = node;
  }

  public isAbsolute(): this is UnresolvedAbsoluteReference {
    return false;
  }

  public toString(): string {
    const start = this.node.startPosition;
    const pos = `${start.row + 1}:${start.column + 1}`;

    return `?${this.symbols.join(".")} at ${pos} in "${this.document.path}"`;
  }
}

export class UnresolvedAbsoluteReference extends BaseUnresolvedReference {
  public constructor(symbols: string[]) {
    super(symbols);
  }

  public isAbsolute(): this is UnresolvedAbsoluteReference {
    return true;
  }

  public toString(): string {
    return `?<global>.${this.symbols.join(".")}`;
  }
}

export type UnresolvedReference = UnresolvedRelativeReference | UnresolvedAbsoluteReference;

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

  public constructor(document: ModelicaDocument, node: Parser.SyntaxNode, symbols: string[]) {
    if (symbols.length === 0) {
      throw new Error("Symbols length must be greater than 0.");
    }

    this.document = document;
    this.node = node;
    this.symbols = symbols;
  }

  public toString(): string {
    return `<global>.${this.symbols.join(".")}`;
  }
}
