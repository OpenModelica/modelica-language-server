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
import * as url from "node:url";

import * as miscUtil from "../util";
import logger from '../util/logger';
import { ModelicaDocument } from "./document";
import { ModelicaProject } from "./project";
import { ModelicaScope } from "./scope";

export class ModelicaLibrary implements ModelicaScope {
  readonly #project: ModelicaProject;
  readonly #uri: string;
  readonly #documents: Map<LSP.DocumentUri, ModelicaDocument>;
  readonly #isWorkspace: boolean;

  private constructor(project: ModelicaProject, uri: LSP.URI, isWorkspace: boolean) {
    this.#project = project;
    this.#uri = uri;
    this.#documents = new Map();
    this.#isWorkspace = isWorkspace;
  }

  public static async load(
    project: ModelicaProject,
    uri: LSP.URI,
    isWorkspace: boolean,
  ): Promise<ModelicaLibrary> {
    logger.info(`Loading ${isWorkspace ? 'workspace' : 'library'} at '${uri}'...`);

    const walk = util.promisify(fsWalk.walk);
    const entries = await walk(url.fileURLToPath(uri), {
      entryFilter: (entry) => !!entry.name.match(/.*\.mo/) && !entry.dirent.isDirectory(),
    });

    const library = new ModelicaLibrary(project, uri, isWorkspace);
    for (const entry of entries) {
      let documentUri = url.pathToFileURL(entry.path).href;
      // Note: LSP sends us file uris containing '%3A' instead of ':', but
      // the node pathToFileURL uses ':' anyways. Manually fix this here.
      // This is a bit hacky but we should ideally only be working with the URIs from LSP anyways.
      documentUri = documentUri.slice(0, 5) + documentUri.slice(5).replace(":", "%3A");
      logger.info(`uri`, documentUri);

      const document = await ModelicaDocument.load(library, documentUri);
      library.#documents.set(documentUri, document);
    }

    logger.debug(`Loaded ${library.#documents.size} documents`);
    return library;
  }

  public async resolve(reference: string[]): Promise<LSP.SymbolInformation | null> {
    if (this.#documents.size === 0) {
      return null;
    }

    let bestDocument: ModelicaDocument;
    let bestPathLength = -1;
    for (const entry of this.#documents) {
      const [_uri, document] = entry;
      const directories = path.relative(this.path, document.path).split(path.sep);
      const fileName = directories.pop()!;

      let packagePath: string[];
      if (fileName === "package.mo") {
        packagePath = directories;
      } else if (fileName.endsWith(".mo")) {
        packagePath = [...directories, fileName.slice(0, fileName.length - ".mo".length)];
      } else {
        continue;
      }

      // TODO: this won't work because in the case of workspaces, the actual package might be in a subdirectory
      // Perhaps we should just add the concept of a "library root" that is searched for libraries.
      // That might be unnecessary though.
      const pathLength = miscUtil.getOverlappingLength(packagePath, reference);
      if (pathLength > bestPathLength) {
        bestDocument = document;
        bestPathLength = pathLength;
      }
    }

    return await bestDocument!.resolve(reference);
  }

  public get name(): string {
    return path.basename(this.path);
  }
  
  public get path(): string {
    return url.fileURLToPath(this.#uri);
  }

  public get uri(): string {
    return this.#uri;
  }

  public get project(): ModelicaProject {
    return this.#project;
  }

  public get documents(): Map<LSP.DocumentUri, ModelicaDocument> {
    return this.#documents;
  }

  public get isWorkspace(): boolean {
    return this.#isWorkspace;
  }
}
