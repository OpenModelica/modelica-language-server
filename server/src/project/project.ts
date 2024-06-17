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

import Parser from 'web-tree-sitter';
import * as LSP from 'vscode-languageserver';
import url from 'node:url';
import path from 'node:path';

import { ModelicaLibrary } from './library';
import { ModelicaDocument } from './document';
import { logger } from '../util/logger';

/** Options for {@link ModelicaProject.getDocument} */
export interface GetDocumentOptions {
  /**
   * `true` to try loading the document from disk if it is not already loaded.
   *
   * Default value: `true`.
   */
  load?: boolean;
}

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
   * Will load the document from disk if unloaded and `options.load` is `true` or `undefined`.
   *
   * @param documentPath file path pointing to the document
   * @param options
   * @returns the document, or `undefined` if no such document exists
   */
  public async getDocument(
    documentPath: string,
    options?: GetDocumentOptions,
  ): Promise<ModelicaDocument | undefined> {
    let loadedDocument: ModelicaDocument | undefined = undefined;
    for (const library of this.#libraries) {
      loadedDocument = library.documents.get(documentPath);
      if (loadedDocument) {
        logger.debug(`Found document: ${documentPath}`);
        break;
      }
    }

    if (loadedDocument) {
      return loadedDocument;
    }

    if (options?.load !== false) {
      const newDocument = await this.addDocument(documentPath);
      if (newDocument) {
        return newDocument;
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
   * @returns the document, or undefined if it wasn't added
   * @throws if the document does not belong to a library
   */
  public async addDocument(documentPath: string): Promise<ModelicaDocument | undefined> {
    logger.info(`Adding document at '${documentPath}'...`);

    for (const library of this.#libraries) {
      const relative = path.relative(library.path, documentPath);
      const isSubdirectory = relative && !relative.startsWith('..') && !path.isAbsolute(relative);

      // Assume that files can't be inside multiple libraries at the same time
      if (!isSubdirectory) {
        continue;
      }

      if (library.documents.get(documentPath) !== undefined) {
        logger.warn(`Document '${documentPath}' already in library '${library.name}'; ignoring...`);
        return undefined;
      }

      const document = await ModelicaDocument.load(this, library, documentPath);
      library.documents.set(documentPath, document);
      logger.debug(`Added document: ${documentPath}`);
      return document;
    }

    // If the document doesn't belong to a library, it could still be loaded
    // as a standalone document if it has an empty or non-existent within clause
    const standaloneName = path.basename(documentPath).split('.')[0];
    const standaloneLibrary = new ModelicaLibrary(
      this,
      path.dirname(documentPath),
      false,
      standaloneName,
    );
    const document = await ModelicaDocument.load(this, standaloneLibrary, documentPath);
    if (document.within.length === 0) {
      this.addLibrary(standaloneLibrary);
      logger.debug(`Added document: ${documentPath}`);
      return document;
    }

    logger.debug(`Failed to add document '${documentPath}': not a part of any libraries.`);
    return undefined;
  }

  /**
   * Updates the content and tree of the given document. Does nothing and
   * returns `false` if the document was not found.
   *
   * @param documentPath path to the document
   * @param text the modification
   * @returns if the document was updated
   */
  public async updateDocument(
    documentPath: string,
    text: string,
    range?: LSP.Range,
  ): Promise<boolean> {
    logger.debug(`Updating document at '${documentPath}'...`);

    const doc = await this.getDocument(documentPath, { load: true });
    if (doc) {
      doc.update(text, range);
      logger.debug(`Updated document '${documentPath}'`);
      return true;
    } else {
      logger.warn(`Failed to update document '${documentPath}': not found`);
      return false;
    }
  }

  /**
   * Removes a document from the cache.
   *
   * @param documentPath path to the document
   * @returns if the document was removed
   */
  public async removeDocument(documentPath: string): Promise<boolean> {
    logger.info(`Removing document at '${documentPath}'...`);

    const doc = await this.getDocument(documentPath, { load: false });
    if (doc) {
      doc.library?.documents.delete(documentPath);
      return true;
    } else {
      logger.warn(`Failed to remove document '${documentPath}': not found`);
      return false;
    }
  }

  public get parser(): Parser {
    return this.#parser;
  }
}
