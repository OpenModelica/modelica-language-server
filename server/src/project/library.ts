/*
 * This file is part of OpenModelica.
 *
 * Copyright (c) 1998-2026, Open Source Modelica Consortium (OSMC),
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

import * as fsSync from 'node:fs';
import * as path from 'node:path';

import { logger } from '../util/logger';
import { ModelicaDocument } from './document';
import { ModelicaProject } from './project';

export class ModelicaLibrary {
  readonly #project: ModelicaProject;
  readonly #documents: Map<string, ModelicaDocument>;
  readonly #isWorkspace: boolean;
  #name: string;
  #path: string;

  public constructor(
    project: ModelicaProject,
    libraryPath: string,
    isWorkspace: boolean,
    name?: string,
  ) {
    this.#project = project;
    this.#path = libraryPath;
    this.#documents = new Map();
    this.#isWorkspace = isWorkspace;
    // Path basename could contain version seperated by whitespace
    this.#name = name ?? path.basename(this.path).split(/\s/)[0];
  }

  /**
   * Loads a library, registering its root but not eagerly parsing every
   * {@link ModelicaDocument} in it.
   *
   * Library documents are loaded lazily, on demand, as they're actually
   * referenced (see {@link getOrLoadDocument}) rather than all at once here.
   * A dependency library such as Buildings has thousands of `.mo` files;
   * parsing and permanently retaining a wasm syntax tree for every one of
   * them, for every configured MODELICAPATH library, at every startup,
   * exhausts the parser's wasm linear memory well before the scan finishes
   * (see OpenModelica/OpenModelica#16802). Files are parsed only when
   * `textDocument/didOpen` opens them or symbol resolution walks into them.
   *
   * @param project the containing project
   * @param libraryPath the path to the library
   * @param isWorkspace `true` if this is a user workspace
   * @returns the loaded library
   */
  public static async load(
    project: ModelicaProject,
    libraryPath: string,
    isWorkspace: boolean,
  ): Promise<ModelicaLibrary> {
    logger.info(`Loading ${isWorkspace ? 'workspace' : 'library'} at '${libraryPath}'...`);

    const library = new ModelicaLibrary(project, libraryPath, isWorkspace);
    const rootDocumentPath = path.join(libraryPath, 'package.mo');
    const rootDocument = await ModelicaDocument.load(project, library, rootDocumentPath);

    // Find the root path of the library and update library.#path.
    // It might have been set incorrectly if we opened a child folder.
    for (let i = 0; i < rootDocument.within.length; i++) {
      library.#path = path.dirname(library.#path);
    }

    if (rootDocument.within.length > 0) {
      // The name came from the child folder we were pointed at, so it named the
      // subpackage rather than the library: loading 'Modelica 4.1.0/Blocks'
      // produced a library called 'Blocks' rooted at 'Modelica 4.1.0', and
      // nothing could then resolve 'Modelica.*' against it. Derive the name
      // from the corrected root, the same way the constructor does.
      library.#name = path.basename(library.#path).split(/\s/)[0];
    }

    logger.debug(`Set library path to ${library.path}`);

    // Cache the document we already parsed under its real path, whether or
    // not it turned out to be the library's true root: it's a real,
    // already-loaded document either way, and re-parsing it later (or
    // discarding this parse without freeing it) would waste the work.
    library.#documents.set(rootDocumentPath, rootDocument);

    return library;
  }

  /**
   * Returns the document at `filePath`, loading and parsing it from disk
   * (and caching the result) if it isn't already loaded.
   *
   * @param filePath absolute path to a document that belongs to this library
   * @returns the document, or `undefined` if `filePath` does not exist
   */
  public getOrLoadDocument(filePath: string): ModelicaDocument | undefined {
    const cached = this.#documents.get(filePath);
    if (cached) {
      return cached;
    }

    if (!fsSync.existsSync(filePath)) {
      return undefined;
    }

    const document = ModelicaDocument.loadSync(this.#project, this, filePath);
    this.#documents.set(filePath, document);
    return document;
  }

  public get name(): string {
    return this.#name;
  }

  public rename(newName: string): void {
    this.#name = newName;
  }

  public get path(): string {
    return this.#path;
  }

  public get project(): ModelicaProject {
    return this.#project;
  }

  public get documents(): Map<string, ModelicaDocument> {
    return this.#documents;
  }

  public get isWorkspace(): boolean {
    return this.#isWorkspace;
  }
}
