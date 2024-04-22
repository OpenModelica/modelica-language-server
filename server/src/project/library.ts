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

import { ModelicaDocument } from "./document";
import { ModelicaProject } from "./project";
import { ModelicaScope } from "./scope";

export class ModelicaLibrary implements ModelicaScope {
  readonly #project: ModelicaProject;
  readonly #path: string;
  readonly #documents: ModelicaDocument[];

  private constructor(project: ModelicaProject, basePath: string, documents: ModelicaDocument[]) {
    this.#project = project;
    this.#path = basePath;
    this.#documents = documents;
  }

  public static async load(project: ModelicaProject, basePath: string): Promise<ModelicaLibrary> {
    const walk = util.promisify(fsWalk.walk);
    const entries = await walk(basePath, {
      entryFilter: (entry) => !!entry.name.match(/.*\.mo/) && !entry.dirent.isDirectory(),
    });

    const documents: ModelicaDocument[] = [];
    const library = new ModelicaLibrary(project, basePath, documents);
    for (const entry of entries) {
      documents.push(await ModelicaDocument.load(library, entry.path));
    }

    return library;
  }

  public get project(): ModelicaProject {
    return this.#project;
  }

  public async resolve(reference: string[]): Promise<LSP.SymbolInformation | null> {
    if (this.#documents.length === 0) {
      return null;
    }

    const getPathLength = <T>(parent: T[], child: T[]): number => {
      let matchedLength = 0;
      for (let i = 0; i < child.length; i++) {
        if (parent[i] !== child[i]) {
          break;
        }
        matchedLength++;
      }

      return matchedLength;
    };

    let bestDocument: ModelicaDocument;
    let bestPathLength = -1;
    for (const document of this.#documents) {
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

      const pathLength = getPathLength(packagePath, reference);
      if (pathLength > bestPathLength) {
        bestDocument = document;
        bestPathLength = pathLength;
      }
    }

    return await bestDocument!.resolve(reference);
  }

  public get name(): string {
    return path.basename(this.#path);
  }

  public get path(): string {
    return this.#path;
  }
}
