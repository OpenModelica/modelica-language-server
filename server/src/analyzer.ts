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

/* -----------------------------------------------------------------------------
 * Taken from bash-language-server and adapted to Modelica language server
 * https://github.com/bash-lsp/bash-language-server/blob/main/server/src/analyser.ts
 * -----------------------------------------------------------------------------
 */

import * as LSP from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import Parser = require('web-tree-sitter');
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as url from 'node:url';

import { ModelicaDocument, ModelicaLibrary, ModelicaProject } from './project';

import { getAllDeclarationsInTree } from './util/declarations';
import { logger } from './util/logger';

export default class Analyzer {
  #project: ModelicaProject;

  public constructor(parser: Parser) {
    this.#project = new ModelicaProject(parser);
  }

  /**
   * Adds a library (and all of its documents) to the analyzer.
   *
   * @param uri uri to the library root
   * @param isWorkspace `true` if this is a user workspace/project, `false` if
   *     this is a library.
   */
  public async loadLibrary(uri: LSP.URI, isWorkspace: boolean): Promise<void> {
    const isLibrary = (folderPath: string) =>
      fsSync.existsSync(path.join(folderPath, 'package.mo'));

    const libraryPath = url.fileURLToPath(uri);
    if (!isWorkspace || isLibrary(libraryPath)) {
      const lib = await ModelicaLibrary.load(this.#project, libraryPath, isWorkspace);
      this.#project.addLibrary(lib);
      return;
    }

    // TODO: go deeper... something like `TreeSitterUtil.forEach` but for files
    //       would be good here
    for (const nestedRelative of await fs.readdir(libraryPath)) {
      const nested = path.resolve(nestedRelative);
      if (!isLibrary(nested)) {
        continue;
      }

      const library = await ModelicaLibrary.load(this.#project, nested, isWorkspace);
      this.#project.addLibrary(library);
    }
  }

  /**
   * Adds a document to the analyzer.
   *
   * Note: {@link loadLibrary} already adds all discovered documents to the
   * analyzer. It is only necessary to call this method on file creation.
   *
   * @param uri uri to document to add
   * @throws if the document does not belong to a library
   */
  public addDocument(uri: LSP.DocumentUri): void {
    this.#project.addDocument(url.fileURLToPath(uri));
  }

  /**
   * Submits a modification to a document. Ignores documents that have not been
   * added with {@link addDocument} or {@link loadLibrary}.
   *
   * @param uri uri to document to update
   * @param text the modification
   * @param range range to update, or `undefined` to replace the whole file
   */
  public updateDocument(uri: LSP.DocumentUri, text: string): void {
    this.#project.updateDocument(url.fileURLToPath(uri), text);
  }

  /**
   * Removes a document from the analyzer. Ignores documents that have not been
   * added or have already been removed.
   *
   * @param uri uri to document to remove
   */
  public removeDocument(uri: LSP.DocumentUri): void {
    this.#project.removeDocument(url.fileURLToPath(uri));
  }

  /**
   * Get all symbol declarations in the given file. This is used for generating an outline.
   *
   * TODO: convert to DocumentSymbol[] which is a hierarchy of symbols found in a given text document.
   */
  public getDeclarationsForUri(uri: string): LSP.SymbolInformation[] {
    // TODO: convert to DocumentSymbol[] which is a hierarchy of symbols found
    // in a given text document.
    const path = url.fileURLToPath(uri);
    const tree = this.#project.getDocument(path)?.tree;

    if (!tree?.rootNode) {
      return [];
    }

    return getAllDeclarationsInTree(tree, uri);
  }
}
