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
 * https://github.com/bash-lsp/bash-language-server/blob/main/server/src/server.ts
 * -----------------------------------------------------------------------------
 */

import * as LSP from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { initializeParser } from './parser';
import Analyzer from './analyzer';
import { logger, setLogConnection, setLogLevel } from './util/logger';

/**
 * ModelicaServer collection all the important bits and bobs.
 */
export class ModelicaServer {
  #analyzer: Analyzer;
  #clientCapabilities: LSP.ClientCapabilities;
  #connection: LSP.Connection;
  #documents: LSP.TextDocuments<TextDocument> = new LSP.TextDocuments(TextDocument);

  private constructor(
    analyzer: Analyzer,
    clientCapabilities: LSP.ClientCapabilities,
    connection: LSP.Connection,
  ) {
    this.#analyzer = analyzer;
    this.#clientCapabilities = clientCapabilities;
    this.#connection = connection;
  }

  public static async initialize(
    connection: LSP.Connection,
    { capabilities }: LSP.InitializeParams,
  ): Promise<ModelicaServer> {
    // Initialize logger
    setLogConnection(connection);
    setLogLevel('debug');
    logger.debug('Initializing...');

    const parser = await initializeParser();
    const analyzer = new Analyzer(parser);

    const server = new ModelicaServer(analyzer, capabilities, connection);

    logger.debug('Initialized');
    return server;
  }

  /**
   * Return what parts of the language server protocol are supported by ModelicaServer.
   */
  public capabilities(): LSP.ServerCapabilities {
    return {
      textDocumentSync: LSP.TextDocumentSyncKind.Full,
      completionProvider: undefined,
      hoverProvider: false,
      signatureHelpProvider: undefined,
      documentSymbolProvider: true,
      colorProvider: false,
      semanticTokensProvider: undefined,
    };
  }

  public register(connection: LSP.Connection): void {
    let currentDocument: TextDocument | null = null;
    let initialized = false;

    // Make the text document manager listen on the connection
    // for open, change and close text document events
    this.#documents.listen(this.#connection);

    connection.onDocumentSymbol(this.onDocumentSymbol.bind(this));

    connection.onInitialized(async () => {
      initialized = true;
      if (currentDocument) {
        // If we already have a document, analyze it now that we're initialized
        // and the linter is ready.
        this.analyzeDocument(currentDocument);
      }
    });

    // The content of a text document has changed. This event is emitted
    // when the text document first opened or when its content has changed.
    this.#documents.onDidChangeContent(({ document }) => {
      logger.debug('onDidChangeContent');

      // We need to define some timing to wait some time or until whitespace is typed
      // to update the tree or we are doing this on every key stroke

      currentDocument = document;
      if (initialized) {
        this.analyzeDocument(document);
      }
    });
  }

  private async analyzeDocument(document: TextDocument) {
    const diagnostics = this.#analyzer.analyze(document);
  }

  /**
   * Provide symbols defined in document.
   *
   * @param params  Unused.
   * @returns       Symbol information.
   */
  private onDocumentSymbol(params: LSP.DocumentSymbolParams): LSP.SymbolInformation[] {
    // TODO: ideally this should return LSP.DocumentSymbol[] instead of LSP.SymbolInformation[]
    // which is a hierarchy of symbols.
    // https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_documentSymbol
    logger.debug(`onDocumentSymbol`);
    return this.#analyzer.getDeclarationsForUri(params.textDocument.uri);
  }
}

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = LSP.createConnection(LSP.ProposedFeatures.all);

connection.onInitialize(async (params: LSP.InitializeParams): Promise<LSP.InitializeResult> => {
  const server = await ModelicaServer.initialize(connection, params);
  server.register(connection);
  return {
    capabilities: server.capabilities(),
  };
});

// Listen on the connection
connection.listen();
