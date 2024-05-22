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
import * as TreeSitterUtil from "../util/tree-sitter";

import { logger } from "../util/logger";
import { ModelicaLibrary } from "./library";
import { ModelicaProject } from "./project";
import { positionToPoint } from '../util/tree-sitter';
import { pathToUri, uriToPath } from '../util';

export class ModelicaDocument implements TextDocument {
  readonly #project: ModelicaProject;
  readonly #library: ModelicaLibrary | null;
  readonly #document: TextDocument;
  #tree: Parser.Tree;

  public constructor(project: ModelicaProject, library: ModelicaLibrary | null, document: TextDocument, tree: Parser.Tree) {
    this.#project = project;
    this.#library = library;
    this.#document = document;
    this.#tree = tree;
  }

  /**
   * Loads a document.
   *
   * @param project the {@link ModelicaProject}
   * @param library the containing {@link ModelicaLibrary} (or `null` if not a part of one)
   * @param documentPath the path to the document
   * @returns the document
   */
  public static async load(
    project: ModelicaProject,
    library: ModelicaLibrary | null,
    documentPath: string,
  ): Promise<ModelicaDocument> {
    logger.debug(`Loading document at '${documentPath}'...`);

    try {
      const content = await fs.readFile(documentPath, 'utf-8');

      const uri = pathToUri(documentPath);
      const document = TextDocument.create(uri, 'modelica', 0, content);

      const tree = project.parser.parse(content);

      return new ModelicaDocument(project, library, document, tree);
    } catch (err) {
      throw new Error(
        `Failed to load document at '${documentPath}': ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  /**
   * Updates a document.
   *
   * @param text the modification
   * @param range the range to update, or `undefined` to replace the whole file
   */
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
      if (position) {
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
    return uriToPath(this.#document.uri);
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
   * The enclosing package of the class declared by this file. For instance, for
   * a file named `MyLibrary/MyPackage/MyClass.mo`, this should be `["MyLibrary",
   * "MyPackage"]`.
   */
  public get within(): string[] {
    const withinClause = this.#tree.rootNode.children
      .find((node) => node.type === 'within_clause')
      ?.childForFieldName("name");
    if (!withinClause) {
      return [];
    }

    // TODO: Use a helper function from TreeSitterUtil
    const identifiers: string[] = [];
    TreeSitterUtil.forEach(withinClause, (node) => {
      if (node.type === "name") {
        return true;
      }

      if (node.type === "IDENT") {
        identifiers.push(node.text);
      }

      return false;
    });

    return identifiers;
  }

  public get project(): ModelicaProject {
    return this.#project;
  }

  public get library(): ModelicaLibrary | null {
    return this.#library;
  }

  public get tree(): Parser.Tree {
    return this.#tree;
  }
}
