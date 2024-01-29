/*
 * This file is part of modelica-language-server.
 *
 * modelica-language-server is free software: you can redistribute it and/or
 * modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version.
 *
 * modelica-language-server is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU Affero
 * General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with modelica-language-server. If not, see
 * <http://www.gnu.org/licenses/>.
 */

/* -----------------------------------------------------------------------------
 * Taken from bash-language-server and adapted to Modelica language server
 * https://github.com/bash-lsp/bash-language-server/blob/main/server/src/analyser.ts
 * -----------------------------------------------------------------------------
 */

import * as LSP from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

import Parser = require('web-tree-sitter');

import {
  getAllDeclarationsInTree
} from './util/declarations';
import { logger } from './util/logger';

type AnalyzedDocument = {
  document: TextDocument,
  declarations: LSP.SymbolInformation[],
  tree: Parser.Tree
}

export default class Analyzer {
  private parser: Parser;
  private uriToAnalyzedDocument: Record<string, AnalyzedDocument | undefined> = {};

  constructor (parser: Parser) {
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
      tree
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
}
