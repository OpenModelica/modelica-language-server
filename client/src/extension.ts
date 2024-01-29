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

import * as path from 'path';
import { languages, workspace, ExtensionContext, TextDocument } from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind
} from 'vscode-languageclient/node';
import { getFileExtension, getLanguage } from './getLanguage';

let client: LanguageClient;

export function activate(context: ExtensionContext) {
  // Register event listener to set language for '.mo' files.
  const checkedFiles: { [id: string]: boolean} = {};
  workspace.onDidOpenTextDocument((document: TextDocument) => {
    if (checkedFiles[document.fileName]) {
      return;
    }

    checkedFiles[document.fileName] = true;
    if (getFileExtension(document) == '.mo') {
      const lang = getLanguage(document);

      switch (lang) {
        case 'modelica':
          languages.setTextDocumentLanguage(document, 'modelica');
          break;
        case 'metamodelica':
          languages.setTextDocumentLanguage(document, 'metamodelica');
          break;
        default:
          break;
      }
    }
  });

  // The server is implemented in node
  const serverModule = context.asAbsolutePath(
    path.join('server', 'out', 'server.js')
  );

  // If the extension is launched in debug mode then the debug server options are used
  // Otherwise the run options are used
  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
    }
  };

  // Options to control the language client
  const clientOptions: LanguageClientOptions = {
    // Register the server for modelica text documents
    documentSelector: [
      {
        language: 'modelica',
        scheme: 'file'
      }
    ],
    synchronize: {
      // Notify the server about file changes to '.clientrc files contained in the workspace
      fileEvents: workspace.createFileSystemWatcher('**/.clientrc')
    }
  };

  // Create the language client and start the client.
  client = new LanguageClient(
    'modelicaLanguageServer',
    'Modelica Language Server',
    serverOptions,
    clientOptions
  );

  // Start the client. This will also launch the server
  client.start();
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
