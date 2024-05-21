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

import * as LSP from "vscode-languageserver";
import * as fsWalk from "@nodelib/fs.walk";
import * as path from "node:path";
import * as util from "node:util";

import { logger } from '../util/logger';
import { ModelicaDocument } from "./document";
import { ModelicaProject } from "./project";

export class ModelicaLibrary {
  readonly #project: ModelicaProject;
  readonly #documents: Map<string, ModelicaDocument>;
  readonly #isWorkspace: boolean;
  #path: string;

  public constructor(project: ModelicaProject, libraryPath: string, isWorkspace: boolean) {
    this.#project = project;
    this.#path = libraryPath,
    this.#documents = new Map();
    this.#isWorkspace = isWorkspace;
  }

  /**
   * Loads a library and all of its {@link ModelicaDocument}s.
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
    const workspaceRootDocument = await ModelicaDocument.load(library, path.join(libraryPath, "package.mo"));

    // Find the root path of the library and update library.#path.
    // It might have been set incorrectly if we opened a child folder.
    for (let i = 0; i < workspaceRootDocument.packagePath.length - 1; i++) {
      library.#path = path.dirname(library.#path);
    }

    logger.debug(`Set library path to ${library.path}`);

    const walk = util.promisify(fsWalk.walk);
    const entries = await walk(library.#path, {
      entryFilter: (entry) => !!entry.name.match(/.*\.mo/) && !entry.dirent.isDirectory(),
    });

    for (const entry of entries) {
      const document = await ModelicaDocument.load(library, entry.path);
      library.#documents.set(entry.path, document);
    }

    logger.debug(`Loaded ${library.#documents.size} documents`);
    return library;
  }

  public get name(): string {
    return path.basename(this.path);
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
