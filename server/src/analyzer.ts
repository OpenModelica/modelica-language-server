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
import Parser from "web-tree-sitter";

import { UnresolvedRelativeReference } from "./analysis/reference";
import resolveReference from "./analysis/resolveReference";
import { ModelicaProject } from "./project/project";
import { ModelicaLibrary } from "./project/library";
import { getAllDeclarationsInTree } from "./util/declarations";
import logger from "./util/logger";
import * as TreeSitterUtil from "./util/tree-sitter";

export default class Analyzer {
  #project: ModelicaProject;

  public constructor(parser: Parser) {
    this.#project = new ModelicaProject(parser);
  }

  public async loadLibrary(uri: LSP.URI, isWorkspace: boolean): Promise<void> {
    const workspace = await ModelicaLibrary.load(this.#project, uri, isWorkspace);
    this.#project.addLibrary(workspace);
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
    const tree = this.#project.getDocument(uri)?.tree;

    if (!tree?.rootNode) {
      return [];
    }

    return getAllDeclarationsInTree(tree, uri);
  }

  public async findDeclarationFromPosition(
    uri: LSP.DocumentUri,
    line: number,
    character: number,
  ): Promise<LSP.LocationLink | null> {
    logger.debug(`Searching for declaration of symbol at ${line + 1}:${character + 1} in '${uri}'`);

    const document = this.#project.getDocument(uri);
    if (!document) {
      logger.warn(`Couldn't find declaration: document not loaded.`);
      return null;
    }

    if (!document.tree.rootNode) {
      logger.info(`Couldn't find declaration: document has no nodes.`);
      return null;
    }

    const documentOffset = document.offsetAt({ line, character });
    const hoveredName = this.findNodeAtPosition(
      document.tree.rootNode,
      documentOffset,
      (node) => node.type === "name",
    );

    let symbols: string[] | undefined;
    let startNode: Parser.SyntaxNode | undefined;
    if (hoveredName) {
      symbols = TreeSitterUtil.getNameIdentifiers(hoveredName)
        .filter(
          (node) =>
            node.startPosition.row < line ||
            (node.startPosition.row === line && node.startPosition.column <= character),
        )
        .map((node) => node.text);

      startNode = this.findNodeAtPosition(
        hoveredName,
        documentOffset,
        (node) => node.type === "IDENT",
      );
    } else {
      startNode = this.findNodeAtPosition(
        document.tree.rootNode,
        documentOffset,
        (node) => node.type === "IDENT",
      );
      symbols = startNode ? [startNode.text] : undefined;
    }

    if (!startNode || !symbols) {
      logger.info(`Tried to find declaration in '${uri}', but not hovering on any identifiers`);
      return null;
    }

    logger.debug(
      `Searching for declaration '${symbols.join(".")}' at ${line + 1}:${character + 1} in '${uri}'`,
    );

    try {
      const result = resolveReference(
        document.project,
        new UnresolvedRelativeReference(document, startNode, symbols),
        "declaration",
      );
      if (!result) {
        logger.debug(`Didn't find declaration of ${symbols.join(".")}`);
        return null;
      }

      const link = TreeSitterUtil.createLocationLink(result.document, result.node);
      logger.debug(`Found declaration of ${symbols.join(".")}: `, link);
      return link;
    } catch (ex) {
      logger.debug("Caught exception: " + JSON.stringify((ex as Error).stack));
      return null;
    }
  }

  /**
   * Locates the first node at the given text position that matches the given
   * `condition`, starting from the `rootNode`.
   *
   * Note: it is very important to have some kind of condition. If one tries to
   * just accept the first node at that position, this function will always
   * return the `rootNode` (or `undefined` if outside the node.)
   *
   * @param rootNode node to start searching from. parents/siblings of this node will be ignored
   * @param offset the offset of the symbol from the start of the document
   * @param condition the condition to check if a node is good
   * @returns the node at the position, or `undefined` if none was found
   */
  private findNodeAtPosition(
    rootNode: Parser.SyntaxNode,
    offset: number,
    condition: (node: Parser.SyntaxNode) => boolean,
  ): Parser.SyntaxNode | undefined {
    // TODO: find the deepest node. findFirst doesn't work (maybe?)
    const hoveredNode = TreeSitterUtil.findFirst(rootNode, (node) => {
      const isInNode = offset >= node.startIndex && offset <= node.endIndex;
      return isInNode && condition(node);
    });

    return hoveredNode ?? undefined;
  }
}
