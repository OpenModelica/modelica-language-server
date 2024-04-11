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
    const analyzer = new Analyzer(parser);

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
    const modelicaFileFilter = {
      scheme: "file",
      pattern: {
        glob: "*.{mo,mos}",
        matches: LSP.FileOperationPatternKind.file,
      },
    };

    const folderFilter = {
      scheme: "file",
      pattern: {
        glob: "*",
        matches: LSP.FileOperationPatternKind.folder,
      }
    };

    return {
      textDocumentSync: LSP.TextDocumentSyncKind.Full,
      completionProvider: undefined,
      hoverProvider: false,
      signatureHelpProvider: undefined,
      documentSymbolProvider: true,
      colorProvider: false,
      semanticTokensProvider: undefined,
      workspace: {
        workspaceFolders: {
          supported: true,
          changeNotifications: true,
        },
        fileOperations: {
          didCreate: {
            filters: [modelicaFileFilter]
          },
          didRename: {
            filters: [modelicaFileFilter /*, folderFilter*/]
          },
          didDelete: {
            filters: [modelicaFileFilter /*, folderFilter*/],
          },
        },
      },
    };
  }

  public register(connection: LSP.Connection): void {
    let currentDocument: TextDocument | null = null;
    let initialized = false;

    // Make the text document manager listen on the connection
    // for open, change and close text document events
    this.documents.listen(this.connection);

    connection.onDocumentSymbol(this.onDocumentSymbol.bind(this));

    connection.onInitialized(async () => {
      logger.debug("onInitialized");
      initialized = true;
      // if (currentDocument) {
      //   // If we already have a document, analyze it now that we're initialized
      //   // and the linter is ready.
      //   this.analyzeDocument(currentDocument);
      // }

      // If we opened a project, analyze it now that we're initialized
      // and the linter is ready.
      this.analyzeWorkspaceFolders();
    });

    connection.workspace.onDidCreateFiles(async (params) => {
      for (const file of params.files) {
        this.analyzer.analyze(file.uri, await fs.readFile(file.uri, "utf-8"));
      }
    });

    connection.workspace.onDidRenameFiles(async (params) => {
      for (const file of params.files) {
        // ...or maybe just analyzer.renameDocument, depending on uh if oldUri and newUri are always in the same folder?
        this.analyzer.removeDocument(file.oldUri);
        this.analyzer.analyze(
          file.newUri,
          await fs.readFile(file.newUri, "utf-8")
        );
      }
    });

    connection.workspace.onDidDeleteFiles(async (params) => {
      for (const file of params.files) {
        this.analyzer.removeDocument(file.uri);
      }
    });

    // The content of a text document has changed. This event is emitted
    // when the text document first opened or when its content has changed.
    this.documents.onDidChangeContent(({ document }) => {
      logger.debug("onDidChangeContent");

      // We need to define some timing to wait some time or until whitespace is typed
      // to update the tree or we are doing this on every key stroke

      currentDocument = document;
      if (initialized) {
        this.analyzeDocument(document);
      }
    });
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
        const diagnostics = this.analyzer.analyze(
          entry.path,
          await fs.readFile(entry.path, "utf-8")
        );
      }
    }
  }

  private async analyzeDocument(document: TextDocument): Promise<void> {
    const diagnostics = this.analyzer.analyze(document.uri, document.getText());
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
    server.register(connection);
    return {
      capabilities: server.capabilities,
    };
  }
);

// Listen on the connection
connection.listen();
