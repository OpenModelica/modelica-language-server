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
import * as fs from 'fs';
import Parser = require('web-tree-sitter');

import {
  getLocalDeclarations,
  getAllDeclarationsInTree
} from './util/declarations';
import { logger } from './util/logger';
import { log } from 'console';
import { extractHoverInformation } from './util/hoverUtil';

type AnalyzedDocument = {
  document: TextDocument,
  declarations: LSP.SymbolInformation[],
  tree: Parser.Tree
}

export default class Analyzer {
  private parser: Parser;
  private uriToAnalyzedDocument: Record<string, AnalyzedDocument | undefined> = {};

  constructor(parser:Parser)
  {
    this.parser = parser;
  }

  public analyze(document: TextDocument): LSP.Diagnostic[] {
    logger.debug('analyze:');

    const diagnostics: LSP.Diagnostic[] = [];
    const fileContent = document.getText();
    const uri = document.uri;

    const tree = this.parser.parse(fileContent);
    logger.debug(tree.rootNode.toString());

    // Get declarations
    const declarations = getAllDeclarationsInTree(tree, uri);

    // Update saved analysis for document uri
    this.uriToAnalyzedDocument[uri] = {
      document,
      declarations,
      tree,
    };

    return diagnostics;
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

  /**
   * Find all declarations for given identifier reachable from position.
   */
  public findDeclarationsMatchingIdent({
    uri,
    position,
    identifier
  }: {
    uri: string
    position: LSP.Position
    identifier: string
  }): LSP.SymbolInformation[] {
    logger.debug('Finding Declarations Matching Word...');
    return this.getAllDeclarations({ uri, position }).filter((symbol) => {
      logger.debug('name === word');
      return symbol.name === identifier;
    });
  }

  private getAnalyzedReachableUris({ fromUri }: { fromUri?: string } = {}): string[] {
    return this.ensureUrisAreAnalyzed(this.getReachableUris({ fromUri }));
  }

  private ensureUrisAreAnalyzed(uris: string[]): string[] {
    return uris.filter((uri) => {
      if (!this.uriToAnalyzedDocument[uri]) {
        // Either the background analysis didn't run or the file is outside
        // the workspace. Let us try to analyze the file.
        try {
          logger.debug(`Analyzing file not covered by background analysis ${uri}`);
          const fileContent = fs.readFileSync(new URL(uri), 'utf8');
          this.analyze(TextDocument.create(uri, 'modelica', 1, fileContent));
        } catch (err) {
          logger.warn(`Error while analyzing file ${uri}: ${err}`);
          return false;
        }
      }

      return true;
    });
  }

  private getReachableUris({ fromUri }: { fromUri?: string } = {}): string[] {
    if (!fromUri) {
      return Object.keys(this.uriToAnalyzedDocument);
    }
    return [fromUri];
  }

  private getAllDeclarations({
    uri: fromUri,
    position,
  }: { uri?: string; position?: LSP.Position } = {}): LSP.SymbolInformation[] {
    return this.getAnalyzedReachableUris({ fromUri }).reduce((symbols, uri) => {
      logger.debug('getAnalyzedReachableUris Initialized');
      const analyzedDocument = this.uriToAnalyzedDocument[uri];

      if (analyzedDocument) {
        if (uri !== fromUri || !position) {
          // TODO: Use the global declarations for external files or if we do not have a position
        }

        // For the current file we find declarations based on the current scope
        if (uri === fromUri && position) {
          const node = analyzedDocument.tree.rootNode?.descendantForPosition({
            row: position.line,
            column: position.character,
          });

          const localDeclarations = getLocalDeclarations({
            node,
            rootNode: analyzedDocument.tree.rootNode,
            uri,
          });
          logger.debug('localDeclarations: ', localDeclarations);
          Object.keys(localDeclarations).map((name) => {
            const symbolsMatchingWord = localDeclarations[name];

            // Find the latest definition
            let closestSymbol: LSP.SymbolInformation | null = null;
            symbolsMatchingWord.forEach((symbol) => {
              // Skip if the symbol is defined in the current file after the requested position
              if (symbol.location.range.start.line > position.line) {
                return;
              }

              if (
                closestSymbol === null ||
                symbol.location.range.start.line > closestSymbol.location.range.start.line
              ) {
                closestSymbol = symbol;
              }
            });

            if (closestSymbol) {
              logger.debug('ClosestSymbol: ', closestSymbol);
              symbols.push(closestSymbol);
            }
          });
        }
      }

      return symbols;
    }, [] as LSP.SymbolInformation[]);
  }

  /**
   * Find a block of comments above a line position
   */
  public commentsAbove(uri: string, line: number): string | null {
    const doc = this.uriToAnalyzedDocument[uri]?.document;
    if (!doc) {
      return null;
    }

    let commentBlock = [];
    let inBlockComment = false;

    // start from the line above
    let commentBlockIndex = line - 1;

    while (commentBlockIndex >= 0) {
      let currentLineText = doc.getText({
        start: { line: commentBlockIndex, character: 0 },
        end: { line: commentBlockIndex + 1, character: 0 },
      }).trim();

      if (inBlockComment) {
        if (currentLineText.startsWith('/*')) {
          inBlockComment = false;
          // Remove the /* from the start
          currentLineText = currentLineText.substring(2).trim();
        } else {
          // Remove leading * from lines within the block comment
          currentLineText = currentLineText.replace(/^\*\s?/, '').trim();
        }
        if (currentLineText) { // Don't add empty lines
          commentBlock.push(currentLineText);
        }
      } else {
        if (currentLineText.startsWith('//')) {
          // Strip the // and add to block
          commentBlock.push(currentLineText.substring(2).trim());
        } else if (currentLineText.endsWith('*/')) {
          inBlockComment = true;
          // Remove the */ from the end
          currentLineText = currentLineText.substring(0, currentLineText.length - 2).trim();
          if (currentLineText) { // Don't add empty lines
            commentBlock.push(currentLineText);
          }
        } else {
          break; // Stop if the current line is not part of a comment
        }
      }

      commentBlockIndex -= 1;
    }

    if (commentBlock.length) {
      commentBlock = [...commentBlock.reverse()];
      return commentBlock.join('\n\n');
    }

    return null;
  }

  /**
   * Return identifier at given text position.
   *
   * Checks if a node of type identifier exists at given position and return
   * text.
   *
   * @param params  Text document position.
   * @returns       String with identifier or null on failure.
   */
  public identFromTextPosition(
    params: LSP.TextDocumentPositionParams,
  ): string | null {

    const node = this.nodeAtPoint(
      params.textDocument.uri,
      params.position.line,
      params.position.character);

    if (!node || node.childCount > 0 || node.text.trim() === '') {
      return null;
    }

    // Filter for identifier
    if (node.type !== "IDENT") {
      return null;
    }

    return node.text.trim();
  }

  /**
   * Return abstract syntax tree node representing text position.
   *
   * @param uri
   * @param line
   * @param column
   * @returns       Node matching position.
   */
  private nodeAtPoint(
    uri: string,
    line: number,
    column: number,
  ): Parser.SyntaxNode | null {
    const tree = this.uriToAnalyzedDocument[uri]?.tree;

    if (!tree?.rootNode) {
      // Check for lacking rootNode (due to failed parse?)
      return null;
    }

    return tree.rootNode.descendantForPosition({ row: line, column });
  }

  public hoverInformation(
    uri: string,
    position: LSP.Position
    ): string {
      const targetNode = this.nodeAtPoint(uri, position.line, position.character);
      if (!targetNode) {
          logger.debug('No target node found.');
          return '';
      }
      return extractHoverInformation(targetNode);
    }
}
