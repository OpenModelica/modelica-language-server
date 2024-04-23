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
import url from "node:url";
import path from "node:path";

import { ModelicaScope } from "./scope";
import { ModelicaLibrary } from "./library";
import { ModelicaDocument } from './document';
import * as util from '../util';
import logger from "../util/logger";

export class ModelicaProject implements ModelicaScope {
  readonly #parser: Parser;
  readonly #libraries: ModelicaLibrary[];

  public constructor(parser: Parser) {
    this.#parser = parser;
    this.#libraries = [];
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
   * @returns the document, or `undefined` if no such document exists
   */
  public getDocument(uri: LSP.DocumentUri): ModelicaDocument | undefined {
    for (const library of this.#libraries) {
      const doc = library.documents.get(uri);
      if (doc) {
        logger.debug(`Found document: ${doc.path}`);
        return doc;
      }
    }

    logger.debug(`Couldn't find document: ${uri}`);

    return undefined;
  }

  /**
   * Adds a new document to the LSP.
   */
  public async addDocument(uri: LSP.DocumentUri): Promise<void> {
    logger.info(`Adding document at '${uri}'...`);

    const documentPath = url.fileURLToPath(uri);
    for (const library of this.#libraries) {
      const relative = path.relative(library.path, documentPath);
      const isSubdirectory = relative && !relative.startsWith("..") && !path.isAbsolute(relative);

      // Assume that files can't be inside multiple libraries at the same time
      if (isSubdirectory) {
        const document = await ModelicaDocument.load(library, documentPath);
        library.documents.set(uri, document);
        logger.debug(`Added document: ${uri}`);
        return;
      }
    }

    throw Error(`Failed to add document '${uri}': not a part of any libraries.`);
  }

  /**
   * Updates the content and tree of the given document.
   *
   * @param text the modification
   * @param range range to update, or undefined to replace the whole file
   */
  public updateDocument(uri: LSP.DocumentUri, text: string, range?: LSP.Range): void {
    logger.debug(`Updating document at '${uri}'...`);

    const doc = this.getDocument(uri);
    doc?.update(text, range);
    logger.debug(`Updated document: ${uri}`);
  }

  /**
   * Removes a document from the cache.
   */
  public removeDocument(uri: LSP.DocumentUri): void {
    logger.info(`Removing document at '${uri}'...`);

    const doc = this.getDocument(uri);
    doc?.library.documents.delete(uri);
  }

  public async resolve(reference: string[]): Promise<LSP.SymbolInformation | null> {
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
