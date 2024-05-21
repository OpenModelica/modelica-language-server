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
import url from 'node:url';
import fs from 'node:fs/promises';

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
    { capabilities, workspaceFolders }: LSP.InitializeParams,
  ): Promise<ModelicaServer> {
    // Initialize logger
    setLogConnection(connection);
    setLogLevel('debug');
    logger.debug('Initializing...');

    const parser = await initializeParser();
    const analyzer = new Analyzer(parser);
    if (workspaceFolders != null) {
      for (const workspace of workspaceFolders) {
        await analyzer.loadLibrary(workspace.uri, true);
      }
    }
    // TODO: add libraries as well

    logger.debug('Initialized');
    return new ModelicaServer(analyzer, capabilities, connection);
  }

  /**
   * Return what parts of the language server protocol are supported by ModelicaServer.
   */
  public capabilities(): LSP.ServerCapabilities {
    return {
      completionProvider: undefined,
      hoverProvider: false,
      signatureHelpProvider: undefined,
      documentSymbolProvider: true,
      colorProvider: false,
      semanticTokensProvider: undefined,
      textDocumentSync: LSP.TextDocumentSyncKind.Full,
      workspace: {
        workspaceFolders: {
          supported: true,
          changeNotifications: true,
        },
      },
    };
  }

  public register(connection: LSP.Connection): void {
    // Make the text document manager listen on the connection
    // for open, change and close text document events
    this.#documents.listen(this.#connection);

    connection.onInitialized(this.onInitialized.bind(this));
    connection.onShutdown(this.onShutdown.bind(this));
    connection.onDidChangeTextDocument(this.onDidChangeTextDocument.bind(this));
    connection.onDidChangeWatchedFiles(this.onDidChangeWatchedFiles.bind(this));
    connection.onDocumentSymbol(this.onDocumentSymbol.bind(this));
  }

  private async onInitialized(): Promise<void> {
    logger.debug('onInitialized');
    await connection.client.register(
      new LSP.ProtocolNotificationType('workspace/didChangeWatchedFiles'),
      {
        watchers: [
          {
            globPattern: '**/*.{mo,mos}',
          },
        ],
      },
    );

    // If we opened a project, analyze it now that we're initialized
    // and the linter is ready.

    // TODO: analysis
  }

  private async onShutdown(): Promise<void> {
    logger.debug('onShutdown');
  }

  private async onDidChangeTextDocument(params: LSP.DidChangeTextDocumentParams): Promise<void> {
    logger.debug('onDidChangeTextDocument');
    for (const change of params.contentChanges) {
      this.#analyzer.updateDocument(params.textDocument.uri, change.text);
    }
  }

  private async onDidChangeWatchedFiles(params: LSP.DidChangeWatchedFilesParams): Promise<void> {
    logger.debug('onDidChangeWatchedFiles: ' + JSON.stringify(params, undefined, 4));

    for (const change of params.changes) {
      switch (change.type) {
        case LSP.FileChangeType.Created:
          this.#analyzer.addDocument(change.uri);
          break;
        case LSP.FileChangeType.Changed: {
          // TODO: incremental?
          const path = url.fileURLToPath(change.uri);
          const content = await fs.readFile(path, 'utf-8');
          this.#analyzer.updateDocument(change.uri, content);
          break;
        }
        case LSP.FileChangeType.Deleted: {
          this.#analyzer.removeDocument(change.uri);
          break;
        }
      }
    }
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
