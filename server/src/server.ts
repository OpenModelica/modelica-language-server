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
 * https://github.com/bash-lsp/bash-language-server/blob/main/server/src/server.ts
 * -----------------------------------------------------------------------------
 */

import * as LSP from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import url from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';

import { initializeParser } from './parser';
import { Parser } from 'web-tree-sitter';
import { formatDocument } from './formatting';
import { syntaxDiagnosticReport } from './util/diagnostics';
import { DiagnosticQueue } from './util/diagnosticQueue';
import Analyzer from './analyzer';
import { logger, setLoggerOptions } from './util/logger';
import { hostTriple, serverName, version, versionInfo } from './version';

/**
 * ModelicaServer collection all the important bits and bobs.
 */
export class ModelicaServer {
  #analyzer: Analyzer;
  #parser: Parser;
  #diagnosticQueue = new DiagnosticQueue(uri => this.publishSyntaxDiagnostics(uri));
  #syntaxDiagnosticsEnabled = false;
  #completionEnabled = false;
  #formatDocumentation = false;
  #connection: LSP.Connection;
  #documents: LSP.TextDocuments<TextDocument> = new LSP.TextDocuments(TextDocument);
  // Absolute, resolved paths of libraries/workspaces already handed to the
  // analyzer, so a later notification about the same folder is a no-op
  // instead of loading it (and all its documents) a second time.
  #loadedLibraryPaths: Set<string> = new Set();
  // Absolute paths from the latest modelica.libraries configuration. Keep
  // these separate from loaded paths so a shrunken configuration can unload
  // roots that disappeared from it.
  #configuredLibraryPaths: Set<string> = new Set();
  // modelicaPath libraries are startup-only, but may overlap with a later
  // modelica.libraries update and must not be unloaded by that update.
  #modelicaPathLibraryPaths: Set<string> = new Set();

  private constructor(analyzer: Analyzer, connection: LSP.Connection, parser: Parser) {
    this.#analyzer = analyzer;
    this.#connection = connection;
    this.#parser = parser;
  }

  public static async initialize(
    connection: LSP.Connection,
    { workspaceFolders, initializationOptions }: LSP.InitializeParams,
  ): Promise<ModelicaServer> {
    // Initialize logger
    setLoggerOptions({
      connection,
      logLevel: 'debug',
    });
    logger.info(`${serverName} ${version} (target: ${hostTriple()}, node: ${process.version})`);
    logger.debug('Initializing...');

    const parser = await initializeParser();
    const analyzer = new Analyzer(parser);
    const server = new ModelicaServer(analyzer, connection, parser);
    server.#completionEnabled =
      (initializationOptions as { completion?: { enabled?: unknown } } | undefined)?.completion?.enabled === true;
    server.#syntaxDiagnosticsEnabled =
      (initializationOptions as { diagnostics?: { syntax?: unknown } } | undefined)?.diagnostics?.syntax === true;
    server.#formatDocumentation =
      (initializationOptions as { formatting?: { formatDocumentation?: unknown } } | undefined)
        ?.formatting?.formatDocumentation === true;

    if (workspaceFolders != null) {
      for (const workspace of workspaceFolders) {
        await server.#tryLoadLibrary(workspace.uri, true, `workspace '${workspace.uri}'`);
      }
    }

    const modelicaPath = Array.isArray(
      (initializationOptions as { modelicaPath?: unknown } | undefined)?.modelicaPath,
    )
      ? (initializationOptions as { modelicaPath: unknown[] }).modelicaPath.filter(
          (value): value is string => typeof value === 'string' && value.length > 0,
        )
      : [];
    const configuredLibraries = Array.isArray(
      (initializationOptions as { libraries?: unknown } | undefined)?.libraries,
    )
      ? (initializationOptions as { libraries: unknown[] }).libraries.filter(
          (value): value is string => typeof value === 'string' && value.length > 0,
        )
      : [];

    for (const libraryPath of [...modelicaPath, ...configuredLibraries]) {
      await server.#loadConfiguredLibrary(libraryPath);
    }
    server.#modelicaPathLibraryPaths = new Set(modelicaPath.map((value) => path.resolve(value)));
    server.#configuredLibraryPaths = new Set(configuredLibraries.map((value) => path.resolve(value)));

    logger.debug('Initialized');
    return server;
  }

  /**
   * Loads a library or workspace folder into the analyzer, skipping it if
   * the same path has already been loaded (e.g. because it was already
   * loaded at startup, or a duplicate change notification arrived).
   *
   * @param uri uri to the library/workspace root
   * @param isWorkspace `true` if this is a user workspace/project, `false` if
   *     this is a library.
   * @param description human-readable description for log messages
   * @returns `'loaded'`, `'duplicate'` if already loaded, or `'failed'` if
   *     the path does not exist or has no `package.mo`.
   */
  async #tryLoadLibrary(
    uri: LSP.URI,
    isWorkspace: boolean,
    description: string,
  ): Promise<'loaded' | 'duplicate' | 'failed'> {
    const normalizedPath = path.resolve(url.fileURLToPath(uri));
    if (this.#loadedLibraryPaths.has(normalizedPath)) {
      logger.debug(`Skipping ${description}: already loaded.`);
      return 'duplicate';
    }

    try {
      const loaded = await this.#analyzer.loadLibrary(uri, isWorkspace);
      if (loaded) {
        this.#loadedLibraryPaths.add(normalizedPath);
        return 'loaded';
      }
      return 'failed';
    } catch (err) {
      logger.error(`Failed to load ${description}: ${err instanceof Error ? err.message : err}`);
      return 'failed';
    }
  }

  /**
   * Resolves a `modelica.libraries`-style path and loads it, warning the
   * user via the client if it could not be loaded.
   */
  async #loadConfiguredLibrary(libraryPath: string): Promise<void> {
    const libraryUri = url.pathToFileURL(path.resolve(libraryPath)).toString();
    logger.debug(`Loading configured library '${libraryPath}'`);
    const result = await this.#tryLoadLibrary(
      libraryUri,
      false,
      `configured library '${libraryPath}'`,
    );
    if (result === 'failed') {
      const message =
        `Could not load Modelica library '${libraryPath}': the path does not exist or has no ` +
        `'package.mo'. Remove or fix this entry in the "modelica.libraries" setting to stop loading it.`;
      logger.warn(message);
      this.#connection.window.showWarningMessage(message);
    }
  }

  /**
   * Return what parts of the language server protocol are supported by ModelicaServer.
   */
  public capabilities(): LSP.ServerCapabilities {
    return {
      completionProvider: { triggerCharacters: ['.'], resolveProvider: false },
      declarationProvider: true,
      definitionProvider: true,
      hoverProvider: true,
      signatureHelpProvider: undefined,
      documentSymbolProvider: true,
      documentFormattingProvider: true,
      documentRangeFormattingProvider: true,
      colorProvider: false,
      semanticTokensProvider: undefined,
      textDocumentSync: LSP.TextDocumentSyncKind.Incremental,
      workspace: {
        workspaceFolders: {
          supported: true,
          changeNotifications: true,
        },
      },
    };
  }

  /**
   * Register handlers for the events from the Language Server Protocol
   *
   * @param connection
   */
  public register(connection: LSP.Connection): void {
    // Make the text document manager listen on the connection
    // for open, change and close text document events
    this.#documents.listen(this.#connection);

    connection.onInitialized(this.onInitialized.bind(this));
    connection.onShutdown(this.onShutdown.bind(this));
    // Subscribe through the document manager: registering another connection
    // handler would replace its handler and leave formatting with stale text.
    this.#documents.onDidChangeContent(({ document }) => {
      if (this.#syntaxDiagnosticsEnabled && document.languageId === 'modelica') {
        this.#diagnosticQueue.schedule(document.uri);
      }
      if (!document.uri.startsWith('file:')) return;
      void this.#analyzer.updateDocument(document.uri, document.getText()).catch(err => {
        logger.warn(`Could not update '${document.uri}': ${err instanceof Error ? err.message : err}`);
      });
    });
    this.#documents.onDidClose(({ document }) => {
      this.#diagnosticQueue.cancel(document.uri);
      if (this.#syntaxDiagnosticsEnabled) void connection.sendDiagnostics({ uri: document.uri, diagnostics: [] });
    });
    connection.onDidChangeWatchedFiles(this.onDidChangeWatchedFiles.bind(this));
    connection.onDidChangeConfiguration(this.onDidChangeConfiguration.bind(this));
    // Workspace folder change subscription is done in `onInitialized`, not
    // here: subscribing during `onInitialize` (before the server capabilities
    // are filled) makes the library send a premature, redundant dynamic
    // `client/registerCapability`, which the client rejects and crashes the
    // process on the unhandled rejection.
    connection.onDeclaration(this.onDeclaration.bind(this));
    connection.onDefinition(this.onDefinition.bind(this));
    connection.onDocumentSymbol(this.onDocumentSymbol.bind(this));
    connection.onHover(this.onHover.bind(this));
    connection.onCompletion(params => {
      if (!this.#completionEnabled) return { isIncomplete: false, items: [] };
      const document = this.#documents.get(params.textDocument.uri);
      if (!document || document.languageId !== 'modelica') return { isIncomplete: false, items: [] };
      try {
        return this.#analyzer.complete(document, params.position, uri => this.#documents.get(uri));
      } catch (error) {
        logger.warn(`Could not complete '${document.uri}': ${error instanceof Error ? error.message : error}`);
        return { isIncomplete: false, items: [] };
      }
    });
    connection.onDocumentFormatting(this.onFormatting.bind(this));
    connection.onDocumentRangeFormatting(this.onFormatting.bind(this));
  }

  private publishSyntaxDiagnostics(uri: string): void {
    if (!this.#syntaxDiagnosticsEnabled) return;
    const current = this.#documents.get(uri);
    if (!current || current.languageId !== 'modelica') return;
    // Parsing and collecting are synchronous, so no older result can finish
    // after a newer edit or close. Always read the latest managed document.
    const report = syntaxDiagnosticReport(this.#parser, current, err => {
      logger.warn(`Could not check '${uri}': ${err instanceof Error ? err.message : err}`);
    });
    void this.#connection.sendDiagnostics(report);
  }

  private setSyntaxDiagnostics(enabled: boolean): void {
    if (enabled === this.#syntaxDiagnosticsEnabled) return;
    this.#syntaxDiagnosticsEnabled = enabled;
    for (const document of this.#documents.all()) {
      if (document.languageId !== 'modelica') continue;
      if (enabled) {
        this.#diagnosticQueue.schedule(document.uri);
      } else {
        this.#diagnosticQueue.cancel(document.uri);
        void this.#connection.sendDiagnostics({ uri: document.uri, version: document.version, diagnostics: [] });
      }
    }
  }

  private onFormatting(
    params: LSP.DocumentFormattingParams | LSP.DocumentRangeFormattingParams,
  ): LSP.TextEdit[] {
    const document = this.#documents.get(params.textDocument.uri);
    if (!document) return [];
    try {
      const options = {
        ...params.options,
        formatDocumentation: typeof params.options.formatDocumentation === 'boolean'
          ? params.options.formatDocumentation : this.#formatDocumentation,
      };
      return formatDocument(this.#parser, document, options,
        'range' in params ? params.range : undefined);
    } catch (err) {
      logger.warn(`Could not format '${document.uri}': ${err instanceof Error ? err.message : err}`);
      return [];
    }
  }

  private async onInitialized(): Promise<void> {
    logger.debug('onInitialized');

    // Subscribe synchronously, before the first `await` below: otherwise a
    // `workspace/didChangeWorkspaceFolders` notification arriving while that
    // await is pending is delivered before the handler is attached and lost.
    // Capabilities are already filled by now, so this sends no dynamic
    // registration. It throws if the client didn't advertise the
    // `workspace.workspaceFolders` capability, which must not take down the
    // rest of the session.
    try {
      this.#connection.workspace.onDidChangeWorkspaceFolders(
        this.onDidChangeWorkspaceFolders.bind(this),
      );
    } catch (err) {
      logger.warn(
        `Client does not support workspace folder change notifications; libraries added ` +
          `after startup will require a restart. (${err instanceof Error ? err.message : err})`,
      );
    }

    await this.#connection.client.register(
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
    this.#diagnosticQueue.dispose();
    logger.debug('onShutdown');
  }

  private async onDidChangeWatchedFiles(params: LSP.DidChangeWatchedFilesParams): Promise<void> {
    logger.debug('onDidChangeWatchedFiles: ' + JSON.stringify(params, undefined, 4));

    for (const change of params.changes) {
      switch (change.type) {
        case LSP.FileChangeType.Created:
          await this.#analyzer.addDocument(change.uri);
          break;
        case LSP.FileChangeType.Changed: {
          // TODO: incremental?
          const path = url.fileURLToPath(change.uri);
          const content = await fs.readFile(path, 'utf-8');
          await this.#analyzer.updateDocument(change.uri, content);
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
   * Loads libraries added to the workspace and unloads those removed after
   * startup, so a client can make a new library available (e.g. to resolve an
   * external `within` reference) or free one it no longer needs, without
   * restarting the server.
   */
  private async onDidChangeWorkspaceFolders(
    event: LSP.WorkspaceFoldersChangeEvent,
  ): Promise<void> {
    logger.debug(
      `onDidChangeWorkspaceFolders: +${event.added.length} folder(s), -${event.removed.length} folder(s)`,
    );

    for (const folder of event.added) {
      const result = await this.#tryLoadLibrary(folder.uri, true, `workspace folder '${folder.uri}'`);
      if (result === 'loaded') {
        logger.info(`Loaded newly added workspace folder '${folder.uri}'.`);
      }
    }

    for (const folder of event.removed) {
      this.#unloadLibrary(folder.uri);
    }
  }

  /**
   * Unloads every library under a removed workspace folder and forgets its
   * path so the same folder can be added again later.
   */
  #unloadLibrary(
    uri: LSP.URI,
    options?: { preserveWorkspaces?: boolean; preservePaths?: ReadonlySet<string> },
  ): void {
    let normalizedRoot: string;
    try {
      normalizedRoot = path.resolve(url.fileURLToPath(uri));
    } catch (err) {
      logger.warn(
        `Ignoring removed workspace folder with non-file URI '${uri}': ` +
          `${err instanceof Error ? err.message : err}`,
      );
      return;
    }

    const removedPaths = this.#analyzer.unloadLibrary(uri, options);
    if (!options?.preserveWorkspaces) {
      this.#loadedLibraryPaths.delete(normalizedRoot);
    }
    for (const removed of removedPaths) {
      this.#loadedLibraryPaths.delete(path.resolve(removed));
    }

    if (removedPaths.length > 0) {
      logger.info(
        `Unloaded ${removedPaths.length} librar${removedPaths.length === 1 ? 'y' : 'ies'} ` +
          `under removed workspace folder '${uri}'.`,
      );
    } else {
      logger.debug(`No loaded libraries found under removed workspace folder '${uri}'.`);
    }
  }

  /**
   * Synchronizes libraries with `modelica.libraries` after startup, so a
   * client can push an updated library list without restarting the server.
   */
  private async onDidChangeConfiguration(params: LSP.DidChangeConfigurationParams): Promise<void> {
    logger.debug('onDidChangeConfiguration');
    const settings = params.settings as {
      modelica?: {
        libraries?: unknown;
        formatting?: { formatDocumentation?: unknown };
        diagnostics?: { syntax?: unknown };
        completion?: { enabled?: unknown };
      };
    } | undefined;
    if (settings?.modelica?.completion !== undefined) {
      this.#completionEnabled = settings.modelica.completion.enabled === true;
    }
    if (settings?.modelica?.diagnostics !== undefined) {
      this.setSyntaxDiagnostics(settings.modelica.diagnostics.syntax === true);
    }
    if (settings?.modelica?.formatting !== undefined) {
      this.#formatDocumentation = settings.modelica.formatting.formatDocumentation === true;
    }
    if (!Array.isArray(settings?.modelica?.libraries)) {
      return;
    }
    const libraries = settings.modelica.libraries.filter(
      (value): value is string => typeof value === 'string' && value.length > 0,
    );
    const configuredLibraryPaths = new Set(libraries.map((value) => path.resolve(value)));

    for (const previousPath of this.#configuredLibraryPaths) {
      if (!configuredLibraryPaths.has(previousPath)) {
        this.#unloadLibrary(url.pathToFileURL(previousPath).toString(), {
          preserveWorkspaces: true,
          preservePaths: this.#modelicaPathLibraryPaths,
        });
      }
    }

    for (const libraryPath of libraries) {
      await this.#loadConfiguredLibrary(libraryPath);
    }
    this.#configuredLibraryPaths = configuredLibraryPaths;
  }

  // TODO: We currently treat goto declaration and goto definition the same,
  //       but there are probably some differences we need to handle.
  //
  // 1. inner/outer variables. Modelica allows the user to redeclare variables
  //    from enclosing classes to use them in inner classes. Goto Declaration
  //    should go to whichever declaration is in scope, while Goto Definition
  //    should go to the `outer` declaration. In the following example:
  //
  //        model Outer
  //          model Inner
  //            inner Real shared;
  //          equation
  //            shared = ...;             (A)
  //          end Inner;
  //          outer Real shared = 0;
  //        equation
  //          shared = ...;               (B)
  //        end Outer;
  //
  //   +-----+-------------+------------+
  //   | Ref | Declaration | Definition |
  //   +-----+-------------+------------+
  //   |  A  |    inner    |   outer    |
  //   |  B  |    outer    |   outer    |
  //   +-----+-------------+------------+
  //
  // 2. extends_clause is weird. This is a valid class:
  //
  //        class extends Foo;
  //        end Foo;
  //
  //    What does this even mean? Is this a definition of Foo or a redeclaration of Foo?
  //
  // 3. Import aliases. Should this be considered to be a declaration of `Frobnicator`?
  //
  //        import Frobnicator = Foo.Bar.Baz;
  //

  private async onDeclaration(params: LSP.DeclarationParams): Promise<LSP.LocationLink[]> {
    logger.debug('onDeclaration');

    const locationLink = await this.#analyzer.findDeclaration(
      params.textDocument.uri,
      params.position,
    );
    if (locationLink == null) {
      return [];
    }

    return [locationLink];
  }

  private async onDefinition(params: LSP.DefinitionParams): Promise<LSP.LocationLink[]> {
    logger.debug('onDefinition');

    const locationLink = await this.#analyzer.findDeclaration(
      params.textDocument.uri,
      params.position,
    );
    if (locationLink == null) {
      return [];
    }

    return [locationLink];
  }

  // ==============================
  // Language server event handlers
  // ==============================

  /**
   * Provide symbols defined in document.
   *
   * @param symbolParams  Document symbols of given text document.
   * @returns             Symbol information.
   */
  private async onDocumentSymbol(
    params: LSP.DocumentSymbolParams,
  ): Promise<LSP.SymbolInformation[]> {
    // TODO: ideally this should return LSP.DocumentSymbol[] instead of LSP.SymbolInformation[]
    // which is a hierarchy of symbols.
    // https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_documentSymbol
    logger.debug(`onDocumentSymbol`);
    return this.#analyzer.getDeclarationsForUri(params.textDocument.uri);
  }

  /**
   * Provide hover information at given text document position.
   *
   * @param params  Text document position.
   * @returns       Hover information.
   */
  private async onHover(params: LSP.HoverParams): Promise<LSP.Hover | null> {
    logger.debug('onHover');
    return this.#analyzer.findHoverInfo(params.textDocument.uri, params.position);
  }
}

if (process.argv.includes('--version')) {
  // Checked before creating the connection, which throws when no transport
  // (--stdio, --socket, ...) is given.
  process.stdout.write(`${versionInfo()}\n`);
} else {
  // Create a connection for the server, using the transport given on the
  // command line. Also include all preview / proposed LSP features.
  const connection = LSP.createConnection(LSP.ProposedFeatures.all);

  connection.onInitialize(async (params: LSP.InitializeParams): Promise<LSP.InitializeResult> => {
    const server = await ModelicaServer.initialize(connection, params);
    server.register(connection);
    return {
      capabilities: server.capabilities(),
      serverInfo: {
        name: serverName,
        version,
      },
    };
  });

  // Listen on the connection
  connection.listen();
}
