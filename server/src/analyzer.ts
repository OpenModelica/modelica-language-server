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

import * as LSP from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import findCacheDirectory from "find-cache-dir";

import Parser from "web-tree-sitter";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as url from "node:url";

import { getAllDeclarationsInTree } from "./util/declarations";
import { logger } from "./util/logger";
import * as TreeSitterUtil from "./util/tree-sitter";

type AnalyzedDocument = {
  uri: string;
  lastAnalyzed: Date,
  declarations: LSP.SymbolInformation[];
  tree: Parser.Tree;
};

const cacheBaseDir = findCacheDirectory({
  name: "modelica-language-server",
  create: true
});

export default class Analyzer {
  private parser: Parser;
  private workspaceFolders: LSP.WorkspaceFolder[] | null | undefined;
  private uriToAnalyzedDocument: Record<string, AnalyzedDocument | undefined> =
    {};

  public constructor(parser: Parser, workspaceFolders?: LSP.WorkspaceFolder[] | null) {
    this.parser = parser;
    this.workspaceFolders = workspaceFolders;
  }

  /**
   * Analyzes a file.
   *
   * @param uri uri to file to analyze
   * @param fileContent the updated content of the file
   * @param lastModified the last time the file was changed. undefined == now.
   * @returns diagnostics for the file
   */
  public analyze(uri: string, fileContent: string, lastModified?: Date): LSP.Diagnostic[] {
    // TODO: determine if the file needs to be reanalyzed or not
    // (it might have been cached)
    // We will need the lastModified time for the file.
    const oldDocument = this.uriToAnalyzedDocument[uri];
    if (oldDocument && lastModified && oldDocument.lastAnalyzed >= lastModified) {
      logger.debug(`skipping: ${uri}`);

      // TODO: return same diagnostics
      return [];
    }

    logger.debug(`analyze '${uri}':`);

    const diagnostics: LSP.Diagnostic[] = [];
    const tree = this.parser.parse(fileContent);
    //logger.debug(tree.rootNode.toString());

    // Get declarations
    const declarations = getAllDeclarationsInTree(tree, uri);

    // Update saved analysis for document uri
    // TODO: do we even need fileContent?
    this.uriToAnalyzedDocument[uri] = {
      uri,
      lastAnalyzed: new Date(),
      declarations,
      tree,
    };

    return diagnostics;
  }

  public removeDocument(uri: string): void {
    delete this.uriToAnalyzedDocument[uri];
  }

  /**
   * Get all symbol declarations in the given file. This is used for generating an outline.
   *
   * TODO: convert to DocumentSymbol[] which is a hierarchy of symbols found in a given text document.
   */
  public getDeclarationsForUri(uri: string): LSP.SymbolInformation[] {
    const tree = this.uriToAnalyzedDocument[uri]?.tree;

    if (!tree?.rootNode) {
      return [];
    }

    return getAllDeclarationsInTree(tree, uri);
  }

  public async loadCache(cacheDir: string): Promise<void> {
    for (const absolutePath in fs.readdir(cacheDir)) {
      const originalFilePath = decodeURIComponent(path.basename(absolutePath));
      logger.debug(`loading from cache: ${originalFilePath}`);

      const documentContent = await fs.readFile(originalFilePath);
      const originalFileUri = url.pathToFileURL(originalFilePath).href;
      this.uriToAnalyzedDocument[originalFileUri] = JSON.parse(documentContent.toString());
    }
  }

  public async saveCache(): Promise<void> {
    for (const [uri, document] of Object.entries(this.uriToAnalyzedDocument)) {
      const cacheDir = this.getWorkspaceCacheDir(uri);
      if (!document || !cacheDir) {
        continue;
      }

      const fileStats = await fs.stat(uri);
      if (document.lastAnalyzed > fileStats.mtime) {
        logger.debug(`writing to cache: ${uri}`);
        const cacheFile = path.join(cacheDir, encodeURIComponent(uri));
        // TODO: is there a faster serialization method?
        fs.writeFile(cacheFile, JSON.stringify(document));
      }
    }
  }

  private getWorkspaceCacheDir(fileUri: string): string | undefined {
    if (!this.workspaceFolders) {
      return undefined;
    }

    const workspaceFolder = this.workspaceFolders
      .map(folder => folder.uri)
      .filter(fileUri.startsWith)
      .sort((a, b) => b.length - a.length)
      .at(0);

    if (!cacheBaseDir || !workspaceFolder) {
      return undefined;
    }

    return path.join(cacheBaseDir, encodeURIComponent(workspaceFolder));
  }
}
