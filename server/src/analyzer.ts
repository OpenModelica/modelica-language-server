/* --------------------------------------------------------------------------------------------
 * Copyright (c) 2023 Andreas Heuermann, Osman Karabel
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as LSP from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { Query } from 'web-tree-sitter';
import Parser = require('web-tree-sitter');

import { logger } from './util/logger';

type AnalyzedDocument = {
  document: TextDocument;
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

    // Update saved analysis for document uri
    this.uriToAnalyzedDocument[uri] = {
      document,
      tree
    };

    return diagnostics;
  }
}
