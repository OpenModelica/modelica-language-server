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

import Parser from "web-tree-sitter";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as url from "node:url";

import { getAllDeclarationsInTree } from "./util/declarations";
import { logger } from "./util/logger";
import * as TreeSitterUtil from "./util/tree-sitter";
import { ModelicaProject } from "./project/project";
import { ModelicaLibrary } from "./project/library";

export default class Analyzer {
  #project: ModelicaProject;

  public constructor(parser: Parser) {
    this.#project = new ModelicaProject(parser);
  }

  public async loadWorkspace(workspaceFolder: LSP.WorkspaceFolder): Promise<void> {
    const workspace = await ModelicaLibrary.load(
      this.#project,
      url.fileURLToPath(workspaceFolder.uri),
    );
    this.#project.addWorkspace(workspace);
  }

  public addDocument(uri: LSP.DocumentUri): void {
    this.#project.addDocument(uri);
  }

  public updateDocument(uri: LSP.DocumentUri, text: string, range?: LSP.Range): void {
    this.#project.updateDocument(uri, text, range);
  }

  public removeDocument(uri: LSP.DocumentUri): void {
    this.#project.removeDocument(uri);
  }

  /**
   * Get all symbol declarations in the given file. This is used for generating an outline.
   *
   * TODO: convert to DocumentSymbol[] which is a hierarchy of symbols found in a given text document.
   */
  public getDeclarationsForUri(uri: LSP.DocumentUri): LSP.SymbolInformation[] {
    const tree = this.#project.getDocumentForUri(uri)?.tree;

    if (!tree?.rootNode) {
      return [];
    }

    return getAllDeclarationsInTree(tree, uri);
  }

  public async findDeclarationFromPosition(
    uri: LSP.DocumentUri,
    line: number,
    character: number,
  ): Promise<LSP.SymbolInformation | null> {
    const tree = this.#project.getDocumentForUri(uri)?.tree;
    if (!tree?.rootNode) {
      return null;
    }

    const hoveredName = this.findNodeAtPosition(
      tree.rootNode,
      line,
      character,
      node => node.type == "name"
    );
    if (!hoveredName) {
      return null;
    }

    const hoveredOffset = character - hoveredName.startPosition.column;
    let symbols = TreeSitterUtil.getName(hoveredName);

    // Find out which symbol in `symbols` is the hovered one
    // and remove the ones after it, since they are not relevant
    let currentOffset = 0;
    for (let i = 0; i < symbols.length; i++) {
      if (currentOffset > hoveredOffset) {
        symbols = symbols.slice(0, i + 1);
        break;
      }

      currentOffset += symbols[i].length;
    }

    const hoveredIdentifier = this.findNodeAtPosition(
      hoveredName,
      line,
      character,
      node => node.type == "IDENT"
    );

    return await this.#project.getDocumentForUri(uri)?.resolveLocally(symbols, hoveredName) ?? null;
  }

  private findNodeAtPosition(
    rootNode: Parser.SyntaxNode,
    line: number,
    character: number,
    condition: (node: Parser.SyntaxNode) => boolean,
  ): Parser.SyntaxNode | undefined {
    let hoveredNode: Parser.SyntaxNode | undefined = undefined;
    TreeSitterUtil.forEach(rootNode, (node) => {
      if (hoveredNode) {
        return false;
      }

      const isInNode =
        line >= node.startPosition.row &&
        line <= node.endPosition.row &&
        character >= node.startPosition.column &&
        character <= node.endPosition.column;

      if (condition(node)) {
        hoveredNode = node;
      }

      return isInNode;
    });

    return hoveredNode;
  }
}
