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

import * as path from 'path';
import * as fs from 'fs';
import {
  commands,
  window,
  workspace,
  ConfigurationTarget,
  ExtensionContext,
} from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from 'vscode-languageclient/node';

let client: LanguageClient;

/**
 * Options controlling the language client.
 *
 * Exported so tests can assert the configuration synchronization below without
 * starting a server.
 */
export function createClientOptions(): LanguageClientOptions {
  return {
    // Register the server for modelica text documents
    documentSelector: [
      {
        language: 'modelica',
        scheme: 'file',
      },
    ],
    synchronize: {
      // Notify the server about file changes to '.clientrc files contained in the workspace
      fileEvents: workspace.createFileSystemWatcher('**/.clientrc'),
      // Forward `modelica.*` setting changes as `workspace/didChangeConfiguration`.
      // Without this the client sends `{settings: null}` and the server never sees
      // libraries added to `modelica.libraries` after startup. Naming the section
      // makes the payload `{modelica: {libraries: [...]}}`, which is the shape
      // `ModelicaServer.onDidChangeConfiguration` reads.
      configurationSection: 'modelica',
    },
    initializationOptions: {
      libraries: workspace.getConfiguration('modelica').get<string[]>('libraries', []),
    },
  };
}

export function activate(context: ExtensionContext): void {
  // The server is implemented in node, point to packed module
  const serverModule = context.asAbsolutePath(path.join('out', 'server.js'));
  if (!fs.existsSync(serverModule)) {
    throw new Error(`Can't find server module in ${serverModule}`);
  }

  // If the extension is launched in debug mode then the debug server options are used
  // Otherwise the run options are used
  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
    },
  };

  const clientOptions = createClientOptions();

  // Create the language client and start the client.
  client = new LanguageClient(
    'modelicaLanguageServer',
    'Modelica Language Server',
    serverOptions,
    clientOptions,
  );

  // Start the client. This will also launch the server
  client.start();

  context.subscriptions.push(
    commands.registerCommand('modelica.loadLibrary', loadLibrary),
  );
}

/**
 * Prompts for Modelica library roots and adds them to `modelica.libraries`.
 *
 * Writing the setting makes the client send `workspace/didChangeConfiguration`,
 * which a running server picks up to load the library without a restart. The
 * server skips paths it has already loaded, so re-adding one is harmless, and
 * it reports a directory with no `package.mo` back to the user itself.
 */
async function loadLibrary(): Promise<void> {
  const picked = await window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: true,
    openLabel: 'Load Library',
    title: 'Select Modelica library root directories',
  });
  if (picked === undefined || picked.length === 0) {
    return;
  }

  // Store alongside the project when there is one, so the library list travels
  // with it; a workspace write would fail outside a workspace.
  const target = workspace.workspaceFolders
    ? ConfigurationTarget.Workspace
    : ConfigurationTarget.Global;

  const configuration = workspace.getConfiguration('modelica');
  const inspected = configuration.inspect<string[]>('libraries');
  // Append to the value at this scope only. Using the effective (merged) value
  // would copy entries from the other scopes into this one.
  const scoped = (target === ConfigurationTarget.Workspace
    ? inspected?.workspaceValue
    : inspected?.globalValue) ?? [];
  const effective = configuration.get<string[]>('libraries', []);

  const updated = [...scoped];
  const added: string[] = [];
  for (const folder of picked) {
    if (!effective.includes(folder.fsPath) && !updated.includes(folder.fsPath)) {
      updated.push(folder.fsPath);
      added.push(folder.fsPath);
    }
  }

  if (added.length === 0) {
    window.showInformationMessage(
      picked.length === 1
        ? 'Modelica: that library is already in "modelica.libraries".'
        : 'Modelica: those libraries are already in "modelica.libraries".',
    );
    return;
  }

  await configuration.update('libraries', updated, target);
  window.showInformationMessage(
    `Modelica: loading ${added.map((p) => path.basename(p)).join(', ')}.`,
  );
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
