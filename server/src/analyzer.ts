/* --------------------------------------------------------------------------------------------
 * Copyright (c) 2018 Mads Hartmann
 * Copyright (C) 2023 Andreas Heuermann, Osman Karabel
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * Taken from bash-language-server and adapted to Modelica language server
 * https://github.com/bash-lsp/bash-language-server/blob/main/server/src/analyser.ts
 * ------------------------------------------------------------------------------------------ */

import * as LSP from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { Query } from 'web-tree-sitter';
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
