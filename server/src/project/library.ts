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

      const document = await ModelicaDocument.load(library, documentUri);
      library.#documents.set(documentUri, document);
    }

    logger.debug(`Loaded ${library.#documents.size} documents`);
    return library;
  }

  public async resolve(reference: string[]): Promise<LSP.LocationLink | null> {
    logger.debug(`searching for reference '${reference.join('.')}' in library '${this.name}'.`);
    logger.debug(`Base dir: ${this.path}`);

    if (this.#documents.size === 0) {
      logger.debug(`No documents in library; giving up`);
      return null;
    }

    let bestDocuments: ModelicaDocument[] = [];
    let bestPathLength = -1;
    for (const entry of this.#documents) {
      const [_uri, document] = entry;
      const packagePath = document.packagePath;

      // TODO: the package path should be relative to the root package.mo file
      // but in the case of workspaces, it doesn't have to be. This ruins the
      // algorithm we use here.
      //
      // Since a workspace can technically store many libraries, we need to treat
      // them differently. A workspace should be considered to be a "library root"
      // that can contain multiple libraries. We should scan the workspace for
      // libraries upon creating it, and when adding files to the workspace,
      // we should figure out which library it belongs to.
      // TODO: how do we handle the case in which a file belongs to no libraries?

      logger.debug(`package: ${packagePath}\t\treference: ${reference}`);
      const pathLength = miscUtil.getOverlappingLength(packagePath, reference);
      if (pathLength > bestPathLength) {
        bestDocuments = [document];
        bestPathLength = pathLength;
      } else if (pathLength === bestPathLength) {
        bestDocuments.push(document);
      }
    }

    // logger.debug(`Chose these documents as the best matches:`);
    // for (const document of bestDocuments) {
    //   logger.debug(`  - ${document.uri}`);
    // }

    for (const document of bestDocuments) {
      const result = await document.resolve(reference);
      if (result) {
        return result;
      }
    }

    return null;
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
