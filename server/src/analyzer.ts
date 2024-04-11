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

import { getAllDeclarationsInTree } from "./util/declarations";
import { logger } from "./util/logger";
import * as TreeSitterUtil from "./util/tree-sitter";

type AnalyzedDocument = {
  uri: string;
  fileContent: string;
  declarations: LSP.SymbolInformation[];
  tree: Parser.Tree;
};

export default class Analyzer {
  private parser: Parser;
  private uriToAnalyzedDocument: Record<string, AnalyzedDocument | undefined> =
    {};

  public constructor(parser: Parser) {
    this.parser = parser;
  }

  public analyze(uri: string, fileContent: string): LSP.Diagnostic[] {
    logger.debug(`analyze '${uri}':`);

    const diagnostics: LSP.Diagnostic[] = [];
    const tree = this.parser.parse(fileContent);
    //logger.debug(tree.rootNode.toString());

    // Get declarations
    const declarations = getAllDeclarationsInTree(tree, uri);

    // Analyze imported modules if necessary
    this.resolveImports(tree);

    // Update saved analysis for document uri
    // TODO: do we even need fileContent?
    this.uriToAnalyzedDocument[uri] = {
      uri,
      fileContent,
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

  private resolveImports(tree: Parser.Tree): void {
    // TODO: within statements
    if (tree.rootNode.firstChild?.type == "within_clause") {
      const packagePath =
        tree.rootNode.firstChild.childForFieldName("name")?.text?.split(".") ??
        [];
      logger.debug(`within package ${packagePath?.join(".")}`);
    }

    // // TODO: Find all import statements
    // TreeSitterUtil.forEach(tree.rootNode, (child) => {
    //   // TODO: return false if the node is not a class? or can imports be in any block?
    //   if (child.type == "import_clause") {
    //     const packagePath = child.childForFieldName("name")!.text.split(".");
    //     packagePath.pop();

    //     this.analyzePackage(packagePath);
    //   }
    // });
  }
}
