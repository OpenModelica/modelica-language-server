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
import * as path from "node:path";

import { logger } from "../util/logger";
import * as TreeSitterUtil from "../util/tree-sitter";
import { positionToPoint } from "../util/tree-sitter";
import { ModelicaLibrary } from "./library";
import { ModelicaProject } from "./project";
import { ModelicaScope } from "./scope";

export class ModelicaDocument implements ModelicaScope, TextDocument {
  readonly #library: ModelicaLibrary;
  readonly #document: TextDocument;
  #tree: Parser.Tree;

  private constructor(library: ModelicaLibrary, document: TextDocument, tree: Parser.Tree) {
    this.#library = library;
    this.#document = document;
    this.#tree = tree;
  }

  public static async load(
    library: ModelicaLibrary,
    uri: LSP.DocumentUri,
  ): Promise<ModelicaDocument> {
    logger.debug(`Loading document at '${uri}'...`);

    const content = await fs.readFile(url.fileURLToPath(uri), "utf-8");
    // On caching: see issue https://github.com/tree-sitter/tree-sitter/issues/824
    // TL;DR: it's faster to re-parse the content than it is to deserialize the cached tree.
    const tree = library.project.parser.parse(content);

    return new ModelicaDocument(library, TextDocument.create(uri, "modelica", 0, content), tree);
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

  public async resolve(reference: string[]): Promise<LSP.LocationLink | null> {
    logger.debug(`Searching for reference '${reference.join(".")}' in document '${this.uri}'`);

    // make the reference relative to the root of this file.
    reference = reference.slice(this.packagePath.length - 1);
    let foundSymbol: Parser.SyntaxNode | null = null;
    TreeSitterUtil.forEach(this.#tree.rootNode, (node: Parser.SyntaxNode) => {
      if (foundSymbol) {
        return false;
      }

      if (node.type !== "class_definition") {
        return false;
      }

      if (TreeSitterUtil.getDeclaredIdentifiers(node).includes(reference[0])) {
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

    const info = TreeSitterUtil.createLocationLink(this.uri, foundSymbol);
    logger.debug("Resolved reference:", info);
    return info;
  }

  public async resolveLocally(
    reference: string[],
    node: Parser.SyntaxNode,
    classDepth: number = 0,
  ): Promise<LSP.LocationLink | null> {
    const symbol = reference.length > 1 ? reference[reference.length - classDepth] : reference[0];
    const variableTypes = ["component_clause", "component_redeclaration", "named_element"];
    const local = node.children
      .filter((child) => variableTypes.includes(child.type))
      .map((decl) => [decl, TreeSitterUtil.getDeclaredIdentifiers(decl)] as const)
      .find(([_decl, idents]) => idents.includes(symbol));
    if (local) {
      logger.debug(`Resolved ${reference.join(".")} to local: ${local[1]}`);

      return TreeSitterUtil.createLocationLink(this.uri, local[0]);
    }

    const classDefinition = node.children
      .filter((child) => child.type === "class_definition")
      .map((classDef) => [classDef, TreeSitterUtil.getDeclaredIdentifiers(classDef)] as const)
      .find(([_def, idents]) => idents.includes(symbol));
    if (classDefinition) {
      logger.debug(`Resolved ${reference.join(".")} to class: ${classDefinition[1]}`);

      return TreeSitterUtil.createLocationLink(this.uri, classDefinition[0]);
    }

    // Check for any elements declared by a class.
    if (node.type === "class_definition") {
      const elementListTypes = ["element_list", "public_element_list", "protected_element_list"];
      const element = node
        .childForFieldName("classSpecifier")
        ?.children?.filter((child) => elementListTypes.includes(child.type))
        ?.flatMap((element_list) => element_list.namedChildren)
        ?.map((element) => [element, TreeSitterUtil.getDeclaredIdentifiers(element)] as const)
        ?.find(([_element, idents]) => idents.includes(symbol));

      if (element) {
        logger.debug(`Resolved ${reference.join(".")} to element: ${element[1]}`);

        return TreeSitterUtil.createLocationLink(this.uri, element[0]);
      }
    }

    const importClauses = node.parent?.children.filter(
      (sibling) => sibling.type === "import_clause",
    );
    if (importClauses && importClauses.length > 0) {
      for (const importClause of importClauses) {
        const importedSymbol = await this.resolveImportClause(reference, importClause);
        if (importedSymbol !== undefined) {
          logger.debug(`Resolved ${reference.join(".")} to import: ${importClause}`);
          return importedSymbol;
        }
      }
    }

    if (node.parent) {
      if (node.type === "class_definition") {
        classDepth++;
      }

      //logger.debug(`Reference ${reference.join(".")} not at current node; checking parent node`);
      return await this.resolveLocally(reference, node.parent, classDepth);
    }

    // TODO: check for relative symbols. Example:
    //
    // within Foo;
    // 
    // package Bar
    //   class Baz
    //   end Baz;
    // end Bar;
    //
    // class Test 
    //   Foo.Bar.Baz baz1; // absolute symbol
    //   Bar.Baz baz2;     // relative symbol -- still valid!
    // end Test;
    //
    // TODO: also make sure to handle encapsulated packages correctly. 

    // call `resolve` on the current ModelicaProject (or library?)
    logger.debug(`Reference '${reference.join(".")}' not in document; is this a global?`);
    return await this.project.resolve(reference);
  }

  private async resolveImportClause(
    reference: string[],
    importClause: Parser.SyntaxNode,
  ): Promise<LSP.LocationLink | null | undefined> {
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
    return url.fileURLToPath(this.uri);
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

  public get packagePath(): string[] {
    const directories = path.relative(this.#library.path, this.path).split(path.sep);
    const fileName = directories.pop()!;

    const packagePath: string[] = [this.#library.name, ...directories];
    if (fileName !== "package.mo") {
      packagePath.push(fileName.slice(0, fileName.length - ".mo".length));
    }

    return packagePath;
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
