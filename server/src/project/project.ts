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

import { ModelicaLibrary } from "./library";
import { ModelicaDocument } from './document';
import { logger } from "../util/logger";

export class ModelicaProject {
  readonly #parser: Parser;
  readonly #libraries: ModelicaLibrary[];

  public constructor(parser: Parser) {
    this.#parser = parser;
    this.#libraries = [];
  }

  public get libraries(): readonly ModelicaLibrary[] {
    return this.#libraries;
  }

  public addLibrary(library: ModelicaLibrary) {
    this.#libraries.push(library);
  }

  /**
   * Finds the document identified by the given path.
   *
   * @param documentPath file path pointing to the document
   * @returns the document, or `undefined` if no such document exists
   */
  public getDocument(documentPath: string): ModelicaDocument | undefined {
    for (const library of this.#libraries) {
      const doc = library.documents.get(documentPath);
      if (doc) {
        logger.debug(`Found document: ${doc.path}`);
        return doc;
      }
    }

    logger.debug(`Couldn't find document: ${documentPath}`);

    return undefined;
  }

  /**
   * Adds a new document to the LSP. Calling this method multiple times for the
   * same document has no effect.
   *
   * @param documentPath path to the document
   * @throws if the document does not belong to a library
   */
  public async addDocument(documentPath: string): Promise<void> {
    logger.info(`Adding document at '${documentPath}'...`);

    for (const library of this.#libraries) {
      const relative = path.relative(library.path, documentPath);
      const isSubdirectory = relative && !relative.startsWith("..") && !path.isAbsolute(relative);

      // Assume that files can't be inside multiple libraries at the same time
      if (!isSubdirectory) {
        continue;
      }

      if (library.documents.get(documentPath) !== undefined) {
        logger.warn(`Document '${documentPath}' already in library '${library.name}'; ignoring...`);
        return;
      }

      const document = await ModelicaDocument.load(library, documentPath);
      library.documents.set(documentPath, document);
      logger.debug(`Added document: ${documentPath}`);
      return;
    }

    throw new Error(`Failed to add document '${documentPath}': not a part of any libraries.`);
  }

  /**
   * Updates the content and tree of the given document.
   *
   * @param text the modification
   * @param range range to update, or undefined to replace the whole file
   */
  public updateDocument(documentPath: string, text: string): void {
    logger.debug(`Updating document at '${documentPath}'...`);

    const doc = this.getDocument(documentPath);
    if (doc) {
      doc.update(text);
      logger.debug(`Updated document '${documentPath}'`);
    } else {
      logger.warn(`Failed to update document '${documentPath}': not loaded`);
    }
  }

  /**
   * Removes a document from the cache.
   */
  public removeDocument(documentPath: string): void {
    logger.info(`Removing document at '${documentPath}'...`);

    const doc = this.getDocument(documentPath);
    if (doc) {
      doc.library.documents.delete(documentPath);
    } else {
      logger.warn(`Failed to remove document '${documentPath}': not loaded`);
    }
  }

  public get parser(): Parser {
    return this.#parser;
  }

}
