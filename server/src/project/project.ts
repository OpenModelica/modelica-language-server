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

import Parser from "web-tree-sitter";
import * as LSP from "vscode-languageserver";

import { ModelicaScope } from "./scope";
import { ModelicaLibrary } from "./library";
import { ModelicaDocument } from './document';

export class ModelicaProject implements ModelicaScope {
  readonly #parser: Parser;
  #workspaces: ModelicaLibrary[];
  #libraries: ModelicaLibrary[];

  public constructor(parser: Parser) {
    this.#parser = parser;
    this.#workspaces = [];
    this.#libraries = [];
  }

  public get workspaces(): ModelicaLibrary[] {
    return this.#workspaces;
  }

  public addWorkspace(workspace: ModelicaLibrary) {
    this.#workspaces.push(workspace);
  }

  public get libraries(): ModelicaLibrary[] {
    return this.libraries;
  }

  public addLibrary(library: ModelicaLibrary) {
    this.#libraries.push(library);
  }

  /**
   * Finds the document identified by the given uri.
   *
   * @param uri file:// uri pointing to the document
   * @returns the document, or `null` if no such document exists
   */
  public getDocumentForUri(uri: LSP.DocumentUri): ModelicaDocument | null {
    return null;
  }

  /**
   * Adds a new document to the LSP.
   */
  public addDocument(uri: LSP.DocumentUri): void {
    throw new Error("Not implemented!");
  }

  /**
   * Updates the content and tree of the given document.
   *
   * @param text the modification
   * @param range range to update, or undefined to replace the whole file
   */
  public updateDocument(uri: LSP.DocumentUri, text: string, range?: LSP.Range): void {
    throw new Error("Not implemented!");
  }

  /**
   * Removes a document from the cache.
   */
  public removeDocument(uri: LSP.DocumentUri): void {
    throw new Error("Not implemented!");
  }

  public async resolve(reference: string[]): Promise<LSP.SymbolInformation | null> {
    for (const workspace of this.workspaces) {
      if (reference[0] === workspace.name) {
        return await workspace.resolve(reference.slice(1));
      }
    }

    for (const library of this.libraries) {
      if (reference[0] === library.name) {
        return await library.resolve(reference.slice(1));
      }
    }

    // TODO: check annotations
    // We don't need to resolve builtins like Boolean because they aren't
    // declared anywhere.

    // TODO: check... array subscripts? can probably skip that

    return null;
  }

  public get parser(): Parser {
    return this.#parser;
  }

  public get project(): ModelicaProject {
    return this;
  }
}
