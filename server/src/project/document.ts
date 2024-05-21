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
import { ModelicaLibrary } from "./library";
import { ModelicaProject } from "./project";

export class ModelicaDocument implements TextDocument {
  readonly #library: ModelicaLibrary;
  readonly #document: TextDocument;
  #tree: Parser.Tree;

  public constructor(library: ModelicaLibrary, document: TextDocument, tree: Parser.Tree) {
    this.#library = library;
    this.#document = document;
    this.#tree = tree;
  }

  /**
   * Loads a document.
   *
   * @param library the containing {@link ModelicaLibrary}
   * @param documentPath the path to the document
   * @returns the document
   */
  public static async load(
    library: ModelicaLibrary,
    documentPath: string,
  ): Promise<ModelicaDocument> {
    logger.debug(`Loading document at '${documentPath}'...`);

    const content = await fs.readFile(documentPath, "utf-8");
    // On caching: see issue https://github.com/tree-sitter/tree-sitter/issues/824
    // TL;DR: it's faster to re-parse the content than it is to deserialize the cached tree.
    const tree = library.project.parser.parse(content);

    return new ModelicaDocument(
      library,
      TextDocument.create(url.fileURLToPath(documentPath), "modelica", 0, content),
      tree
    );
  }

  /**
   * Updates a document.
   * @param text the modification
   */
  public async update(text: string): Promise<void> {
    TextDocument.update(this.#document, [{ text }], this.version + 1);
    this.#tree = this.project.parser.parse(text);
    return;
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

  public get uri(): LSP.DocumentUri {
    return this.#document.uri;
  }

  public get path(): string {
    return url.fileURLToPath(this.#document.uri);
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

  /**
   * The fully-qualified name of the class declared by this file. For instance,
   * for a file named `MyLibrary/MyPackage/MyClass.mo`, this would be
   * `["MyLibrary", "MyPackage", "MyClass"]`.
   */
  public get packagePath(): string[] {
    const directories = path.relative(this.#library.path, this.path).split(path.sep);
    const fileName = directories.pop()!;

    const packagePath: string[] = [this.#library.name, ...directories];
    if (fileName !== "package.mo") {
      packagePath.push(fileName.slice(0, fileName.length - ".mo".length));
    }

    return packagePath;
  }

  /**
   * The enclosing package of the class declared by this file. For instance, for
   * a file named `MyLibrary/MyPackage/MyClass.mo`, this would be `["MyLibrary",
   * "MyPackage"]`.
   *
   * Note: this property should be the same thing as the `within` clause
   * declared in the document. However, we don't actually check the clause at
   * all. The `within` clause is entirely redundant and completely ignored.
   */
  public get within(): string[] {
    return this.packagePath.slice(0, -1);
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
