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
 * ----------------------------------------------------------------------------
 */

import * as path from 'node:path';
import * as LSP from 'vscode-languageserver/node';
import { TextDocument} from 'vscode-languageserver-textdocument';

import { initializeParser } from './parser';
import Analyzer from './analyzer';
import { logger, setLogConnection, setLogLevel } from './util/logger';
import { uniqueBasedOnHash } from './util/array';

/**
 * ModelicaServer collection all the important bits and bobs.
 */
export class ModelicaServer {
  analyzer: Analyzer;
  private clientCapabilities: LSP.ClientCapabilities;
  private connection: LSP.Connection;
  private documents: LSP.TextDocuments<TextDocument> = new LSP.TextDocuments(TextDocument);

  private constructor(
    analyzer: Analyzer,
    capabilities: LSP.ClientCapabilities,
    connection: LSP.Connection
  ) {
    this.analyzer = analyzer;
    this.clientCapabilities = capabilities;
    this.connection = connection;
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
      hoverProvider: true,
      signatureHelpProvider: undefined,
      documentSymbolProvider: true,
      colorProvider: false,
      semanticTokensProvider: undefined
    };
  }

  /**
   * Register handlers for the events from the Language Server Protocol
   * 
   * @param connection 
   */
  public register(connection: LSP.Connection): void {
    let currentDocument: TextDocument | null = null;
    let initialized = false;

    // Make the text document manager listen on the connection
    // for open, change and close text document events
    this.documents.listen(this.connection);
    
    // The content of a text document has changed. This event is emitted
    // when the text document first opened or when its content has changed.
    this.documents.onDidChangeContent(({ document }) => {
      logger.debug('onDidChangeContent');

      // We need to define some timing to wait some time or until whitespace is typed
      // to update the tree or we are doing this on every key stroke

      currentDocument = document;
      if (initialized) {
        this.analyzeDocument(document);
      }
    });

    connection.onDocumentSymbol(this.onDocumentSymbol.bind(this));
    connection.onHover(this.onHover.bind(this));
    logger.debug('Event Handlers Registered');

    connection.onInitialized(async () => {
      initialized = true;
      if (currentDocument) {
        // If we already have a document, analyze it now that we're initialized
        // and the linter is ready.
        this.analyzeDocument(currentDocument);
      }
    });
  }


  private async analyzeDocument(document: TextDocument) {
    const diagnostics = this.analyzer.analyze({document});
  }

  private logRequest({
    request,
    params,
    word,
  }: {
    request: string
    params: LSP.ReferenceParams | LSP.TextDocumentPositionParams
    word?: string | null
  }) {
    const wordLog = word ? `"${word}"` : 'null'
    logger.debug(
      `${request} ${params.position.line}:${params.position.character} word=${wordLog}`,
    )
  }

// getDocumentationForSymbol aus dem Bash LSP
  private getDocumentationForSymbol({
    currentUri,
    symbol,
  }: {
    symbol: LSP.SymbolInformation
    currentUri: string
  }): LSP.MarkupContent {

    logger.debug(`getDocumentationForSymbol: symbol=${symbol.name} uri=${symbol.location.uri}`)

    const symbolUri = symbol.location.uri
    const symbolStartLine = symbol.location.range.start.line

    const commentAboveSymbol = this.analyzer.commentsAbove(symbolUri, symbolStartLine)
    const commentAboveDocumentation = commentAboveSymbol ? `\n\n${commentAboveSymbol}` : ''
    const hoverHeader = `${symbolKindToDescription(symbol.kind)}: **${symbol.name}**`
    const symbolLocation =
      symbolUri !== currentUri
        ? `in ${path.relative(path.dirname(currentUri), symbolUri)}`
        : `on line ${symbolStartLine + 1}`

    // TODO: An improvement could be to add show the symbol definition in the hover instead
    // of the defined location – similar to how VSCode works for languages like TypeScript.

    return getMarkdownContent(
      `${hoverHeader} - *defined ${symbolLocation}*${commentAboveDocumentation}`,
    )
  }

  // ==============================
  // Language server event handlers
  // ==============================

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
    return this.analyzer.getDeclarationsForUri(params.textDocument.uri);
  }

  private async onHover(
    params: LSP.TextDocumentPositionParams,
  ): Promise<LSP.Hover | null> {
    const word = this.analyzer.wordAtPointFromTextPosition(params)
    const currentUri = params.textDocument.uri
    logger.debug('------------');
    this.logRequest({ request: 'onHover init', params, word })

    if (!word) {
      return null
    }

    const symbolsMatchingWord = this.analyzer.findDeclarationsMatchingWord({
      exactMatch: true,
      uri: currentUri,
      word,
      position: params.position,
    })
    logger.debug('symbolsMatchingWord: ', symbolsMatchingWord);

    const symbolDocumentation = deduplicateSymbols({
      symbols: symbolsMatchingWord,
      currentUri,
    })
      // do not return hover referencing for the current line
      .filter(
        (symbol) =>
          symbol.location.uri !== currentUri ||
          symbol.location.range.start.line !== params.position.line,
      )
      .map((symbol: LSP.SymbolInformation) =>
        this.getDocumentationForSymbol({ currentUri, symbol }),
      )

    if (symbolDocumentation.length === 1) {
      logger.debug('Symbol Documentation: ', symbolDocumentation[0]);
      const position = params.position
      const uri = currentUri
      const description = this.analyzer.descriptionInfo(uri, position)
      if (description) {
        return {contents: getMarkdownContent(description)}
      }
      //return { contents: symbolDocumentation[0] }
      return null
    }
    return null
  }
}

/*
return { contents: { kind: LSP.MarkupKind.Markdown, value: [
  '# Test',
  'Text text text',
  '```modelica code```'].join('\n')
  }
}
*/
/**
 * Deduplicate symbols by prioritizing the current file.
 */
function deduplicateSymbols({
  symbols,
  currentUri,
}: {
  symbols: LSP.SymbolInformation[]
  currentUri: string
}) {
  const isCurrentFile = ({ location: { uri } }: LSP.SymbolInformation) =>
    uri === currentUri

  const getSymbolId = ({ name, kind }: LSP.SymbolInformation) => `${name}${kind}`

  const symbolsCurrentFile = symbols.filter((s) => isCurrentFile(s))

  const symbolsOtherFiles = symbols
    .filter((s) => !isCurrentFile(s))
    // Remove identical symbols matching current file
    .filter(
      (symbolOtherFiles) =>
        !symbolsCurrentFile.some(
          (symbolCurrentFile) =>
            getSymbolId(symbolCurrentFile) === getSymbolId(symbolOtherFiles),
        ),
    )

  // NOTE: it might be that uniqueBasedOnHash is not needed anymore
  return uniqueBasedOnHash([...symbolsCurrentFile, ...symbolsOtherFiles], getSymbolId)
}

function symbolKindToDescription(kind: LSP.SymbolKind): string {
  switch (kind) {
    case LSP.SymbolKind.Class:
      return 'Class';
    case LSP.SymbolKind.Function:
      return 'Function';
    case LSP.SymbolKind.Package:
      return 'Package';
    case LSP.SymbolKind.TypeParameter:
      return 'Type';
    default:
      return 'Modelica symbol';
  }
}

function getMarkdownContent(documentation: string, language?: string): LSP.MarkupContent {
  return {
    value: language
      ? // eslint-disable-next-line prefer-template
        ['``` ' + language, documentation, '```'].join('\n')
      : documentation,
    kind: LSP.MarkupKind.Markdown,
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
      capabilities: server.capabilities(),
    };
  }
);

// Listen on the connection
connection.listen();
