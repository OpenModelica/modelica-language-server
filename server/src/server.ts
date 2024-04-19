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

import * as LSP from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import findCacheDirectory from "find-cache-dir";
import * as fsWalk from "@nodelib/fs.walk";
import * as fs from "node:fs/promises";
import * as util from "node:util";
import * as url from "node:url";

import { initializeParser } from "./parser";
import Analyzer from "./analyzer";
import { logger, setLogConnection, setLogLevel } from "./util/logger";

/**
 * ModelicaServer collection all the important bits and bobs.
 */
export class ModelicaServer {
  private initialized = false;
  private analyzer: Analyzer;
  private clientCapabilities: LSP.ClientCapabilities;
  private workspaceFolders: LSP.WorkspaceFolder[] | null | undefined;
  private connection: LSP.Connection;
  private documents: LSP.TextDocuments<TextDocument> = new LSP.TextDocuments(
    TextDocument
  );

  private constructor(
    analyzer: Analyzer,
    clientCapabilities: LSP.ClientCapabilities,
    workspaceFolders: LSP.WorkspaceFolder[] | null | undefined,
    connection: LSP.Connection
  ) {
    this.analyzer = analyzer;
    this.clientCapabilities = clientCapabilities;
    this.workspaceFolders = workspaceFolders;
    this.connection = connection;
  }

  public static async initialize(
    connection: LSP.Connection,
    initializeParams: LSP.InitializeParams
  ): Promise<ModelicaServer> {
    // Initialize logger
    setLogConnection(connection);
    setLogLevel("debug");
    logger.debug("Initializing...");

    const parser = await initializeParser();
    const analyzer = new Analyzer(parser, initializeParams.workspaceFolders);

    const server = new ModelicaServer(
      analyzer,
      initializeParams.capabilities,
      initializeParams.workspaceFolders,
      connection
    );

    logger.debug("Initialized");
    return server;
  }

  /**
   * Return what parts of the language server protocol are supported by ModelicaServer.
   */
  public get capabilities(): LSP.ServerCapabilities {
    return {
      colorProvider: false,
      completionProvider: undefined,
      declarationProvider: true,
      documentSymbolProvider: true,
      hoverProvider: false,
      signatureHelpProvider: undefined,
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

  public async register(connection: LSP.Connection): Promise<void> {
    let currentDocument: TextDocument | null = null;

    // Make the text document manager listen on the connection
    // for open, change and close text document events
    this.documents.listen(this.connection);

    connection.onShutdown(this.onShutdown.bind(this));
    connection.onDocumentSymbol(this.onDocumentSymbol.bind(this));
    connection.onInitialized(this.onInitialized.bind(this));
    connection.onDidChangeWatchedFiles(this.onDidChangeWatchedFiles.bind(this));
    connection.onDeclaration(this.onDeclaration.bind(this));

    // The content of a text document has changed. This event is emitted
    // when the text document first opened or when its content has changed.
    this.documents.onDidChangeContent(({ document }) => {
      logger.debug("onDidChangeContent");

      // We need to define some timing to wait some time or until whitespace is typed
      // to update the tree or we are doing this on every key stroke

      currentDocument = document;
      if (this.initialized) {
        this.analyzeDocument(document);
      }
    });
  }

  private async onInitialized(): Promise<void> {
      logger.debug("onInitialized");
      this.initialized = true;

      await connection.client.register(
        new LSP.ProtocolNotificationType("workspace/didChangeWatchedFiles"),
        {
          watchers: [
            {
              globPattern: "**/*.{mo,mos}",
            },
          ],
        }
      );

      // If we opened a project, analyze it now that we're initialized
      // and the linter is ready.
      this.analyzeWorkspaceFolders();
  }

  private async onShutdown(): Promise<void> {
    logger.debug("close");

    const cacheDir = findCacheDirectory({
      name: "modelica-language-server",
      create: true
    });

    if (cacheDir) {
      // TODO: open the file and read it
      // TODO: determine what needs to be saved
      await this.analyzer.saveCache();
    }
  }

  private async analyzeWorkspaceFolders(): Promise<void> {
    if (!this.workspaceFolders) {
      return;
    }

    for (const workspace of this.workspaceFolders) {
      const walk = util.promisify(fsWalk.walk);
      const entries = await walk(url.fileURLToPath(workspace.uri), {
        entryFilter: (entry) => !!entry.name.match(/\.mos?$/),
      });

      for (const entry of entries) {
        const stats = await fs.stat(entry.path);
        const diagnostics = this.analyzer.analyze(
          url.pathToFileURL(entry.path).href,
          await fs.readFile(entry.path, "utf-8"),
          stats.mtime
        );
      }
    }

    await this.analyzer.saveCache();
  }

  private async analyzeDocument(document: TextDocument): Promise<void> {
    const diagnostics = this.analyzer.analyze(document.uri, document.getText());
  }

  private async onDidChangeWatchedFiles(params: LSP.DidChangeWatchedFilesParams): Promise<void> {
    logger.debug(
      "onDidChangeWatchedFiles: " + JSON.stringify(params, undefined, 4)
    );

    for (const change of params.changes) {
      switch (change.type) {
        case LSP.FileChangeType.Created: {
          const uri = url.fileURLToPath(change.uri);
          this.analyzer.analyze(uri, await fs.readFile(uri, "utf-8"));
          break;
        }
        case LSP.FileChangeType.Changed: {
          const uri = url.fileURLToPath(change.uri);
          this.analyzer.analyze(uri, await fs.readFile(uri, "utf-8"));
          break;
        }
        case LSP.FileChangeType.Deleted: {
          const uri = url.fileURLToPath(change.uri);
          this.analyzer.removeDocument(uri);
          break;
        }
      }
    }
  }

  private onDeclaration(params: LSP.DeclarationParams): LSP.Location | undefined {
    return this.analyzer.findDeclarationFromPosition(
      params.textDocument.uri,
      params.position.line,
      params.position.character
    );
  }

  /**
   * Provide symbols defined in document.
   *
   * @param params  Unused.
   * @returns       Symbol information.
   */
  private onDocumentSymbol(
    params: LSP.DocumentSymbolParams
  ): LSP.SymbolInformation[] {
    // TODO: ideally this should return LSP.DocumentSymbol[] instead of LSP.SymbolInformation[]
    // which is a hierarchy of symbols.
    // https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_documentSymbol
    logger.debug(`onDocumentSymbol`);
    return this.analyzer.getDeclarationsForUri(params.textDocument.uri);
  }
}

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = LSP.createConnection(LSP.ProposedFeatures.all);

connection.onInitialize(
  async (params: LSP.InitializeParams): Promise<LSP.InitializeResult> => {
    const server = await ModelicaServer.initialize(connection, params);
    await server.register(connection);
    return {
      capabilities: server.capabilities,
    };
  }
);

// Listen on the connection
connection.listen();
