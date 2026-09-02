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

/* -----------------------------------------------------------------------------
 * Taken from bash-language-server and adapted to Modelica language server
 * https://github.com/bash-lsp/bash-language-server/blob/main/server/src/analyser.ts
 * -----------------------------------------------------------------------------
 */

import * as LSP from 'vscode-languageserver/node';
import { Parser, Node as SyntaxNode } from 'web-tree-sitter';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as url from 'node:url';

import {
  UnresolvedAbsoluteReference,
  UnresolvedReference,
  UnresolvedRelativeReference,
} from './analysis/reference';
import resolveReference from './analysis/resolveReference';
import { ModelicaDocument, ModelicaLibrary, ModelicaProject } from './project';
import { uriToPath } from './util';
import * as TreeSitterUtil from './util/tree-sitter';
import { getAllDeclarationsInTree } from './util/declarations';
import { logger } from './util/logger';
import { extractHoverInformation } from './util/hoverUtil';

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
   * @returns `true` if the library was loaded, `false` if it was skipped because
   *     the path does not exist or does not contain a `package.mo`.
   */
  public async loadLibrary(uri: LSP.URI, isWorkspace: boolean): Promise<boolean> {
    const isLibrary = (folderPath: string) =>
      fsSync.existsSync(path.join(folderPath, 'package.mo'));

    const libraryPath = url.fileURLToPath(uri);
    if (!fsSync.existsSync(libraryPath)) {
      logger.debug(
        `Skipping ${isWorkspace ? 'workspace' : 'library'} at '${libraryPath}': path does not exist.`,
      );
      return false;
    }

    if (!isWorkspace || isLibrary(libraryPath)) {
      if (!isLibrary(libraryPath)) {
        logger.debug(`Skipping library at '${libraryPath}': no 'package.mo' found.`);
        return false;
      }

      const lib = await ModelicaLibrary.load(this.#project, libraryPath, isWorkspace);
      this.#project.addLibrary(lib);
      return true;
    }

    // TODO: go deeper... something like `TreeSitterUtil.forEach` but for files
    //       would be good here
    for (const nestedRelative of await fs.readdir(libraryPath)) {
      const nested = path.resolve(libraryPath, nestedRelative);
      if (!isLibrary(nested)) {
        continue;
      }

      const library = await ModelicaLibrary.load(this.#project, nested, isWorkspace);
      this.#project.addLibrary(library);
    }

    return true;
  }

  /**
   * Unloads every library at or below the given workspace/library root, so a
   * client that removed a workspace folder can free the associated libraries
   * without restarting the server.
   *
   * @param uri uri to the library/workspace root
   * @param options optional ownership filters for configuration-driven unloads
   * @returns the file-system paths of the libraries that were unloaded
   */
  public unloadLibrary(
    uri: LSP.URI,
    options?: { preserveWorkspaces?: boolean; preservePaths?: ReadonlySet<string> },
  ): string[] {
    const rootPath = path.resolve(url.fileURLToPath(uri));
    const isAtOrBelow = (parent: string, child: string): boolean => {
      const relative = path.relative(parent, child);
      return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
    };

    return this.#project.removeLibrariesUnder(rootPath, (library) => {
      if (options?.preserveWorkspaces && library.isWorkspace) {
        return false;
      }

      // A library loaded through modelicaPath must remain available even if
      // the same path is later removed from modelica.libraries.
      for (const preservedPath of options?.preservePaths ?? []) {
        if (isAtOrBelow(path.resolve(preservedPath), path.resolve(library.path))) {
          return false;
        }
      }

      return true;
    });
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
  public async addDocument(uri: LSP.DocumentUri): Promise<void> {
    await this.#project.addDocument(uriToPath(uri));
  }

  /**
   * Submits a modification to a document. Ignores documents that have not been
   * added with {@link addDocument} or {@link loadLibrary}.
   *
   * @param uri uri to document to update
   * @param text the modification
   * @param range range to update, or `undefined` to replace the whole file
   */
  public async updateDocument(
    uri: LSP.DocumentUri,
    text: string,
    range?: LSP.Range,
  ): Promise<void> {
    await this.#project.updateDocument(uriToPath(uri), text, range);
  }

  /**
   * Removes a document from the analyzer. Ignores documents that have not been
   * added or have already been removed.
   *
   * @param uri uri to document to remove
   */
  public removeDocument(uri: LSP.DocumentUri): void {
    this.#project.removeDocument(uriToPath(uri));
  }

  /**
   * Get all symbol declarations in the given file. This is used for generating an outline.
   *
   * TODO: convert to DocumentSymbol[] which is a hierarchy of symbols found in a given text document.
   */
  public async getDeclarationsForUri(uri: string): Promise<LSP.SymbolInformation[]> {
    // TODO: convert to DocumentSymbol[] which is a hierarchy of symbols found
    // in a given text document.
    const path = uriToPath(uri);
    const document = await this.#project.getDocument(path);
    const tree = document?.tree;

    if (!tree?.rootNode) {
      return [];
    }

    return getAllDeclarationsInTree(tree, uri);
  }

  /**
   * Finds the position of the declaration of the symbol at the given position.
   *
   * @param uri the opened document
   * @param position the cursor position
   * @returns a {@link LSP.LocationLink} to the symbol's declaration, or `null`
   *     if not found.
   */
  public async findDeclaration(
    uri: LSP.DocumentUri,
    position: LSP.Position,
  ): Promise<LSP.LocationLink | null> {
    const path = uriToPath(uri);
    logger.debug(
      `Searching for declaration of symbol at ${position.line + 1}:${
        position.character + 1
      } in '${path}'`,
    );

    const document = await this.#project.getDocument(path);
    if (!document) {
      logger.warn(`Couldn't find declaration: document not loaded.`);
      return null;
    }

    if (!document.tree.rootNode) {
      logger.info(`Couldn't find declaration: document has no nodes.`);
      return null;
    }

    const reference = this.getReferenceAt(document, position);
    if (!reference) {
      logger.info(`Tried to find declaration in '${path}', but not hovering on any identifiers`);
      return null;
    }

    logger.debug(
      `Searching for '${reference}' at ${position.line + 1}:${position.character + 1} in '${path}'`,
    );

    try {
      const result = resolveReference(document.project, reference, 'declaration');
      if (!result) {
        logger.debug(`Didn't find declaration of ${reference.symbols.join('.')}`);
        return null;
      }

      const link = TreeSitterUtil.createLocationLink(result.document, result.node);
      logger.debug(`Found declaration of ${reference.symbols.join('.')}: `, link);
      return link;
    } catch (e: unknown) {
      if (e instanceof Error) {
        logger.debug('Caught exception: ', e.stack);
      } else {
        logger.debug(`Caught:`, e);
      }
      return null;
    }
  }

  /**
   * Returns hover information for the symbol at the given position.
   *
   * @param uri the opened document
   * @param position the cursor position
   * @returns Markdown hover content, or `null` if not found.
   */
  public async findHoverInfo(
    uri: LSP.DocumentUri,
    position: LSP.Position,
  ): Promise<LSP.Hover | null> {
    const path = uriToPath(uri);
    const document = await this.#project.getDocument(path);
    if (!document || !document.tree.rootNode) {
      return null;
    }

    const reference = this.getReferenceAt(document, position);
    if (!reference) {
      return null;
    }

    // Try to resolve via the full resolution system (handles external classes, qualified names).
    try {
      const result = resolveReference(document.project, reference, 'declaration');
      if (result?.node.type === 'class_definition') {
        return this.hoverFromClassDef(result.node);
      }
    } catch (e: unknown) {
      if (e instanceof Error) {
        logger.debug('Caught exception in findHoverInfo: ', e.stack);
      }
    }

    // Fallback: search the current document for a matching class definition.
    // This handles standalone files where the file name differs from the class name.
    const lastName = reference.symbols[reference.symbols.length - 1];
    const localClassDef = TreeSitterUtil.findFirst(
      document.tree.rootNode,
      (n) => n.type === 'class_definition' && TreeSitterUtil.hasIdentifier(n, lastName),
    );
    if (localClassDef) {
      return this.hoverFromClassDef(localClassDef);
    }

    return null;
  }

  /**
   * Builds a Markdown hover from a class definition node.
   *
   * @param classDefNode a `class_definition` syntax node
   * @returns a Markdown {@link LSP.Hover}, or `null` if no hover information
   *     could be extracted from the node.
   */
  private hoverFromClassDef(classDefNode: SyntaxNode): LSP.Hover | null {
    const hoverInfo = extractHoverInformation(classDefNode);
    if (!hoverInfo) {
      return null;
    }
    return {
      contents: {
        kind: LSP.MarkupKind.Markdown,
        value: hoverInfo,
      } as LSP.MarkupContent,
    };
  }

  /**
   * Returns the reference at the document position, or `null` if no reference
   * exists.
   */
  private getReferenceAt(
    document: ModelicaDocument,
    position: LSP.Position,
  ): UnresolvedReference | null {
    function checkBeforeCursor(node: SyntaxNode): boolean {
      if (node.startPosition.row < position.line) {
        return true;
      }
      return (
        node.startPosition.row === position.line && node.startPosition.column <= position.character
      );
    }

    const documentOffset = document.offsetAt(position);

    // First, check if this is a `type_specifier` or a `name`.
    let hoveredType = this.findNodeAtPosition(
      document.tree.rootNode,
      documentOffset,
      (node) => node.type === 'name',
    );

    if (hoveredType) {
      if (hoveredType.parent?.type === 'type_specifier') {
        hoveredType = hoveredType.parent;
      }

      const declaredType = TreeSitterUtil.getTypeSpecifier(hoveredType);
      const symbols = declaredType.symbolNodes.filter(checkBeforeCursor).map((node) => node.text);

      if (declaredType.isGlobal) {
        return new UnresolvedAbsoluteReference(symbols, 'class');
      } else {
        const startNode = this.findNodeAtPosition(
          hoveredType,
          documentOffset,
          (node) => node.type === 'IDENT',
        );
        if (!startNode) {
          return null;
        }

        return new UnresolvedRelativeReference(document, startNode, symbols, 'class');
      }
    }

    // Next, check if this is a `component_reference`.
    const hoveredComponentReference = this.findNodeAtPosition(
      document.tree.rootNode,
      documentOffset,
      (node) => node.type === 'component_reference',
    );
    if (hoveredComponentReference) {
      // TODO: handle array indices
      const componentReference = TreeSitterUtil.getComponentReference(hoveredComponentReference);
      const symbols = componentReference.componentNodes
        .filter(checkBeforeCursor)
        .map((node) => node.text);

      if (componentReference.isGlobal) {
        return new UnresolvedAbsoluteReference(symbols, 'variable');
      } else {
        const startNode = this.findNodeAtPosition(
          hoveredComponentReference,
          documentOffset,
          (node) => node.type === 'IDENT',
        );
        if (!startNode) {
          return null;
        }

        return new UnresolvedRelativeReference(document, startNode, symbols, 'variable');
      }
    }

    // Finally, give up and check if this is just an ident.
    const startNode = this.findNodeAtPosition(
      document.tree.rootNode,
      documentOffset,
      (node) => node.type === 'IDENT',
    );
    if (startNode) {
      return new UnresolvedRelativeReference(document, startNode, [startNode.text]);
    }

    // We're not hovering over an identifier.
    return null;
  }

  /**
   * Locates the first node at the given text position that matches the given
   * `condition`, starting from the `rootNode`.
   *
   * @param rootNode node to start searching from. parents/siblings of this node will be ignored
   * @param offset the offset of the symbol from the start of the document
   * @param condition the condition to check if a node is "good"
   * @returns the node at the position, or `undefined` if none was found
   */
  private findNodeAtPosition(
    rootNode: SyntaxNode,
    offset: number,
    condition: (node: SyntaxNode) => boolean,
  ): SyntaxNode | undefined {
    // TODO: find the deepest node. findFirst doesn't work (maybe?)
    const hoveredNode = TreeSitterUtil.findFirst(rootNode, (node) => {
      const isInNode = offset >= node.startIndex && offset <= node.endIndex;
      return isInNode && condition(node);
    });

    return hoveredNode ?? undefined;
  }
}
