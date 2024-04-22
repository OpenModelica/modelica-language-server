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

import { TextDocument } from "vscode-languageserver-textdocument";
import * as LSP from "vscode-languageserver/node";
import Parser from "web-tree-sitter";
import * as fs from "node:fs/promises";
import * as url from "node:url";

import { logger } from "../util/logger";
import * as TreeSitterUtil from "../util/tree-sitter";
import { positionToPoint } from "../util/tree-sitter";
import { ModelicaLibrary } from "./library";
import { ModelicaProject } from "./project";
import { ModelicaScope } from "./scope";

export class ModelicaDocument implements ModelicaScope, TextDocument {
  readonly #library: ModelicaLibrary;
  readonly #path: string;
  readonly #document: TextDocument;
  #tree: Parser.Tree;

  private constructor(
    library: ModelicaLibrary,
    path: string,
    document: TextDocument,
    tree: Parser.Tree,
  ) {
    this.#library = library;
    this.#path = path;
    this.#document = document;
    this.#tree = tree;
  }

  public static async load(library: ModelicaLibrary, filePath: string): Promise<ModelicaDocument> {
    const content = await fs.readFile(filePath, "utf-8");
    // On caching: see issue https://github.com/tree-sitter/tree-sitter/issues/824
    // TL;DR: it's faster to re-parse the content than it is to deserialize the cached tree.
    const tree = library.project.parser.parse(content);

    const uri = url.pathToFileURL(filePath).href;
    return new ModelicaDocument(
      library,
      filePath,
      TextDocument.create(uri, "modelica", 0, content),
      tree,
    );
  }

  public async update(text: string, range?: LSP.Range): Promise<void> {
    if (range === undefined) {
      TextDocument.update(this.#document, [{ text }], this.version + 1);
      this.#tree = this.project.parser.parse(text);
      return;
    }

    const startIndex = this.offsetAt(range.start);
    const startPosition = positionToPoint(range.start);
    const oldEndIndex = this.offsetAt(range.end);
    const oldEndPosition = positionToPoint(range.end);
    const newEndIndex = startIndex + text.length;

    TextDocument.update(this.#document, [{ text, range }], this.version + 1);
    const newEndPosition = positionToPoint(this.positionAt(newEndIndex));

    this.#tree.edit({
      startIndex,
      startPosition,
      oldEndIndex,
      oldEndPosition,
      newEndIndex,
      newEndPosition,
    });

    this.#tree = this.project.parser.parse((index: number, position?: Parser.Point) => {
      if (position !== undefined) {
        return this.getText({
          start: {
            character: position.column,
            line: position.row,
          },
          end: {
            character: position.column + 1,
            line: position.row,
          },
        });
      } else {
        return this.getText({
          start: this.positionAt(index),
          end: this.positionAt(index + 1),
        });
      }
    }, this.#tree);
  }

  public async resolve(reference: string[]): Promise<LSP.SymbolInformation | null> {
    let foundSymbol: Parser.SyntaxNode | null = null;
    TreeSitterUtil.forEach(this.#tree.rootNode, (node: Parser.SyntaxNode) => {
      if (foundSymbol) {
        return false;
      }

      const className = TreeSitterUtil.getIdentifier(node);
      if (node.type == "class_definition" && className == reference[0]) {
        reference = reference.slice(1);
        if (reference.length == 0) {
          foundSymbol = node;
        }

        return true;
      }

      return false;
    });

    if (!foundSymbol) {
      return null;
    }

    return TreeSitterUtil.getSymbolInformation(this.#path, LSP.SymbolKind.Class, foundSymbol);
  }

  public async resolveLocally(
    reference: string[],
    node: Parser.SyntaxNode,
  ): Promise<LSP.SymbolInformation | null> {
    // Bottom up traversal:
    // if there is an import statement in the current scope:
    //     call `resolve` on the current ModelicaProject (or library?),
    //     `resolve([..importSymbols, ..reference])`
    // else if there is a variable declaration with the name reference[0]:
    //     if reference.length is just 1:
    //         return the position of the variable declaration
    //     else:
    //         find the type of the local.
    //         return the position of the field declaration in that type
    // else if there is a local class with the name reference[0]:
    //     if reference.length is just 1:
    //         return the position of the class declaration
    //     else:
    //         return the position of the declaration in that class
    // else:
    //     if node.parentNode == null:
    //         call `resolve` on the current ModelicaProject (or library?)
    //     else:
    //         node = node.parentNode
    const importClauses = node.parent?.children.filter(
      (sibling) => sibling.type == "import_clause",
    );
    if (importClauses && importClauses.length > 0) {
      for (const importClause of importClauses) {
        const importedSymbol = await this.resolveImportClause(reference, importClause);
        if (importedSymbol !== undefined) {
          logger.debug(
            `resolved ${reference} to import: ${JSON.stringify(importedSymbol, undefined, 4)}`,
          );
          return importedSymbol;
        }
      }
    }

    const local = node.parent?.children
      .filter((sibling) => sibling.type == "component_clause")
      .find((decl) => TreeSitterUtil.getIdentifier(decl) === reference[0]);
    if (local) {
      logger.debug(`found local: ${JSON.stringify(local, undefined, 4)}`);

      return TreeSitterUtil.getSymbolInformation(this.#path, LSP.SymbolKind.Variable, local);
    }

    const classDefinition = node.parent?.children
      .filter((sibling) => sibling.type == "class_definition")
      .find((def) => TreeSitterUtil.getIdentifier(def) === reference[0]);
    if (classDefinition) {
      logger.debug(`found class: ${JSON.stringify(classDefinition, undefined, 4)}`);

      return TreeSitterUtil.getSymbolInformation(this.#path, LSP.SymbolKind.Class, classDefinition);
    }

    if (!node.parent) {
      // call `resolve` on the current ModelicaProject (or library?)
      return await this.project.resolve(reference);
    }

    return await this.resolveLocally(reference, node.parent!);
  }

  private async resolveImportClause(
    reference: string[],
    importClause: Parser.SyntaxNode,
  ): Promise<LSP.SymbolInformation | null | undefined> {
    const importedSymbol = TreeSitterUtil.getName(importClause.childForFieldName("name")!);

    // wildcard import: import a.b.*;
    const isWildcard = importClause.childForFieldName("wildcard") != null;
    if (isWildcard) {
      const result = await this.project.resolve([...importedSymbol, ...reference]);
      return result ?? undefined;
    }

    // import alias: import z = a.b.c;
    const alias = importClause.childForFieldName("alias")?.text;
    if (alias && alias === reference[0]) {
      return this.project.resolve([...importedSymbol, ...reference.slice(1)]);
    }

    // multi-import: import a.b.{c, d, e};
    const childImports = importClause.childForFieldName("imports");
    if (childImports) {
      const symbolWasImported = childImports.namedChildren
        .filter((node) => node.type === "IDENT")
        .map((node) => node.text)
        .some((name) => name === reference[0]);

      if (symbolWasImported) {
        return this.project.resolve([...importedSymbol, ...reference]);
      }
    }

    // normal import: import a.b.c;
    if (importedSymbol.at(-1) === reference[0]) {
      return this.project.resolve([...importedSymbol, ...reference.slice(1)]);
    }

    return undefined;
  }

  public getText(range?: LSP.Range | undefined): string {
    return this.#document.getText(range);
  }

  public positionAt(offset: number): LSP.Position {
    return this.#document.positionAt(offset);
  }

  public offsetAt(position: LSP.Position): number {
    return this.#document.offsetAt(position);
  }

  public get uri(): string {
    return this.#document.uri;
  }

  public get path(): string {
    return this.#path;
  }

  public get languageId(): string {
    return this.#document.languageId;
  }

  public get version(): number {
    return this.#document.version;
  }

  public get lineCount(): number {
    return this.#document.lineCount;
  }

  public get project(): ModelicaProject {
    return this.#library.project;
  }

  public get library(): ModelicaLibrary {
    return this.#library;
  }

  public get tree(): Parser.Tree {
    return this.#tree;
  }
}
