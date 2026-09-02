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
 * End-to-end test driving the bundled server binary (out/server.js) over its
 * real stdio JSON-RPC transport, the same way an editor would. Unlike the
 * other tests in this directory, this deliberately does not import the
 * server module directly: `server.ts` creates a real `LSP.Connection` over
 * stdio and calls `connection.listen()` as a side effect of being imported,
 * so it can only be safely exercised as a separate process.
 * -----------------------------------------------------------------------------
 */

import assert from 'node:assert/strict';
import { ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

// Built by the root esbuild.config.js (`npm run esbuild` at the repo root),
// which is what CI runs before the test suite. This is NOT the same output
// as `server/out/server.js` (produced by `server`'s own `npm run build`,
// used for the standalone SEA binary).
const SERVER_BUNDLE = path.join(__dirname, '..', '..', '..', 'out', 'server.js');
const LIB_A = path.join(__dirname, 'fixtures', 'RuntimeLoadLibA');
const LIB_B = path.join(__dirname, 'fixtures', 'RuntimeLoadLibB');
const LIB_C = path.join(__dirname, 'fixtures', 'RuntimeLoadLibC');
const FILE_N = path.join(LIB_B, 'N.mo');
const FILE_P = path.join(LIB_C, 'P.mo');

function fileUri(p: string): string {
  return url.pathToFileURL(p).toString();
}

interface JsonRpcMessage {
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: unknown;
}

/** A minimal JSON-RPC (LSP framing) client for driving the server bundle over stdio. */
class LspTestClient {
  #child: ChildProcessWithoutNullStreams;
  #buffer = Buffer.alloc(0);
  #nextId = 1;
  #pending = new Map<number, (msg: JsonRpcMessage) => void>();
  #exitCode: number | null | undefined = undefined;
  #logs: string[] = [];

  constructor() {
    assert.ok(
      fs.existsSync(SERVER_BUNDLE),
      `Server bundle not found at ${SERVER_BUNDLE}. Run 'npm run esbuild' before the tests.`,
    );
    this.#child = spawn(process.execPath, [SERVER_BUNDLE, '--stdio'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.#child.stdout.on('data', (chunk: Buffer) => this.#onData(chunk));
    this.#child.on('exit', (code) => {
      this.#exitCode = code;
    });
  }

  /** `true` once the server process has exited (e.g. crashed). */
  get hasExited(): boolean {
    return this.#exitCode !== undefined;
  }

  get exitCode(): number | null | undefined {
    return this.#exitCode;
  }

  /** All `window/logMessage` texts received from the server so far. */
  get logs(): readonly string[] {
    return this.#logs;
  }

  /** Waits until a log message containing `substring` arrives, or times out. */
  async waitForLog(substring: string, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (this.#logs.some((l) => l.includes(substring))) {
        return true;
      }
      await new Promise((r) => setTimeout(r, 25));
    }
    return this.#logs.some((l) => l.includes(substring));
  }

  #onData(chunk: Buffer): void {
    this.#buffer = Buffer.concat([this.#buffer, chunk]);
    for (;;) {
      const headerEnd = this.#buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) return;
      const header = this.#buffer.subarray(0, headerEnd).toString('utf8');
      const match = /Content-Length: (\d+)/.exec(header);
      if (!match) return;
      const length = parseInt(match[1], 10);
      const bodyStart = headerEnd + 4;
      if (this.#buffer.length < bodyStart + length) return;
      const body = this.#buffer.subarray(bodyStart, bodyStart + length).toString('utf8');
      this.#buffer = this.#buffer.subarray(bodyStart + length);

      const message = JSON.parse(body) as JsonRpcMessage;
      if (message.method === 'window/logMessage') {
        const logParams = message.params as { message?: unknown } | undefined;
        if (typeof logParams?.message === 'string') {
          this.#logs.push(logParams.message);
        }
        continue;
      }
      const resolve = message.id !== undefined ? this.#pending.get(message.id) : undefined;
      if (message.id !== undefined && resolve) {
        this.#pending.delete(message.id);
        resolve(message);
      } else if (message.id !== undefined && message.method) {
        // Server-to-client request. Mimic vscode-languageclient: reject a
        // (redundant) dynamic registration of workspace folder change events
        // the way the real client does, but accept everything else. A server
        // that sends this registration crashes on the unhandled rejection.
        const registersWorkspaceFolders =
          message.method === 'client/registerCapability' &&
          JSON.stringify(message.params ?? '').includes('workspace/didChangeWorkspaceFolders');
        if (registersWorkspaceFolders) {
          this.#send({ id: message.id, error: { code: -32601, message: 'Unexpected registration' } });
        } else {
          this.#send({ id: message.id, result: null });
        }
      }
    }
  }

  #send(message: JsonRpcMessage): void {
    const json = JSON.stringify(message);
    const header = `Content-Length: ${Buffer.byteLength(json, 'utf8')}\r\n\r\n`;
    this.#child.stdin.write(header + json);
  }

  request(method: string, params: unknown): Promise<JsonRpcMessage> {
    const id = this.#nextId++;
    return new Promise((resolve) => {
      this.#pending.set(id, resolve);
      this.#send({ id, method, params });
    });
  }

  notify(method: string, params: unknown): void {
    this.#send({ method, params });
  }

  async dispose(): Promise<void> {
    // A crashed server never answers shutdown; don't hang the test on it.
    if (!this.hasExited) {
      await Promise.race([
        this.request('shutdown', {}),
        new Promise((r) => setTimeout(r, 1_000)),
      ]);
      this.notify('exit', undefined);
    }
    this.#child.kill();
  }
}

/** Repeatedly issues `textDocument/definition` until it resolves or the timeout elapses. */
async function waitForDefinition(
  client: LspTestClient,
  uri: string,
  position: { line: number; character: number },
  timeoutMs: number,
): Promise<unknown> {
  const deadline = Date.now() + timeoutMs;
  let lastResult: unknown;
  do {
    const response = await client.request('textDocument/definition', {
      textDocument: { uri },
      position,
    });
    lastResult = response.result;
    if (Array.isArray(lastResult) ? lastResult.length > 0 : lastResult != null) {
      return lastResult;
    }
    await new Promise((r) => setTimeout(r, 50));
  } while (Date.now() < deadline);
  return lastResult;
}

/** Locates the position of `symbol` inside the first line containing `marker`. */
function positionOf(text: string, marker: string, symbol: string): { line: number; character: number } {
  const lines = text.split('\n');
  const line = lines.findIndex((l) => l.includes(marker));
  assert.notEqual(line, -1, `fixture must contain a line with '${marker}'`);
  const character = lines[line].indexOf(symbol) + 1;
  return { line, character };
}

/** Initializes the server with `libB` as the only known workspace folder. */
async function initializeWithLibB(client: LspTestClient): Promise<void> {
  const libBUri = fileUri(LIB_B);
  await client.request('initialize', {
    processId: process.pid,
    rootUri: libBUri,
    workspaceFolders: [{ uri: libBUri, name: 'RuntimeLoadLibB' }],
    capabilities: { workspace: { workspaceFolders: true, didChangeWorkspaceFolders: true } },
    initializationOptions: { libraries: [] },
  });
  client.notify('initialized', {});
}

describe('runtime library loading', () => {
  it('resolves an external reference only after the library is announced without a restart', async function () {
    this.timeout(20_000);

    const client = new LspTestClient();
    try {
      const libBUri = fileUri(LIB_B);
      const nUri = fileUri(FILE_N);
      const nText = fs.readFileSync(FILE_N, 'utf8');
      const lineIndex = nText.split('\n').findIndex((l) => l.includes('extends RuntimeLoadLibA.M'));
      assert.notEqual(lineIndex, -1, 'fixture file must contain the extends clause');
      const characterIndex = nText.split('\n')[lineIndex].indexOf('RuntimeLoadLibA.M') + 1;
      const position = { line: lineIndex, character: characterIndex };

      // Only libB is known at startup; libA (which defines RuntimeLoadLibA.M) is not.
      await client.request('initialize', {
        processId: process.pid,
        rootUri: libBUri,
        workspaceFolders: [{ uri: libBUri, name: 'RuntimeLoadLibB' }],
        capabilities: {
          workspace: { workspaceFolders: true, didChangeWorkspaceFolders: true },
        },
        initializationOptions: { libraries: [] },
      });
      client.notify('initialized', {});
      client.notify('textDocument/didOpen', {
        textDocument: { uri: nUri, languageId: 'modelica', version: 1, text: nText },
      });

      const before = await client.request('textDocument/definition', {
        textDocument: { uri: nUri },
        position,
      });
      assert.deepEqual(
        before.result,
        [],
        'RuntimeLoadLibA.M should not resolve before libA is known to the server',
      );

      // Announce the new library the way an editor would when the user adds
      // a workspace folder, without restarting the server process.
      client.notify('workspace/didChangeWorkspaceFolders', {
        event: { added: [{ uri: fileUri(LIB_A), name: 'RuntimeLoadLibA' }], removed: [] },
      });

      const after = await waitForDefinition(client, nUri, position, 5_000);
      assert.ok(
        Array.isArray(after) && after.length > 0,
        `RuntimeLoadLibA.M should resolve once libA is announced at runtime, got: ${JSON.stringify(after)}`,
      );
    } finally {
      await client.dispose();
    }
  });

  it('initializes successfully for a client that does not support workspace folder change notifications', async function () {
    this.timeout(20_000);

    // `connection.workspace.onDidChangeWorkspaceFolders` throws if the client
    // capabilities don't include `workspace.workspaceFolders`. That must not
    // fail `initialize` for clients that simply don't support the feature.
    const client = new LspTestClient();
    try {
      const response = await client.request('initialize', {
        processId: process.pid,
        rootUri: null,
        capabilities: {},
        initializationOptions: { libraries: [] },
      });
      assert.equal(response.error, undefined, JSON.stringify(response.error));
      assert.ok(response.result, 'initialize should return a result');
    } finally {
      await client.dispose();
    }
  });

  it('stays alive after initialized when the client rejects a workspace folder registration', async function () {
    this.timeout(20_000);

    // Regression: subscribing to workspace folder changes during `initialize`
    // sent a premature, redundant dynamic registration. A client that rejects
    // it (as vscode-languageclient does, see LspTestClient) crashed the server
    // on the unhandled rejection, silently killing every subsequent request.
    const client = new LspTestClient();
    try {
      const libBUri = fileUri(LIB_B);
      const nUri = fileUri(FILE_N);
      const nText = fs.readFileSync(FILE_N, 'utf8');

      await client.request('initialize', {
        processId: process.pid,
        rootUri: libBUri,
        workspaceFolders: [{ uri: libBUri, name: 'RuntimeLoadLibB' }],
        capabilities: { workspace: { workspaceFolders: true } },
        initializationOptions: { libraries: [] },
      });
      client.notify('initialized', {});
      client.notify('textDocument/didOpen', {
        textDocument: { uri: nUri, languageId: 'modelica', version: 1, text: nText },
      });

      // Give the server time to process the rejected registration; a buggy
      // server crashes here on the unhandled rejection.
      await new Promise((r) => setTimeout(r, 500));
      assert.equal(
        client.hasExited,
        false,
        `server process exited (code ${client.exitCode}) after the client rejected a ` +
          `workspace folder registration`,
      );

      // And it still answers requests.
      const response = await client.request('textDocument/documentSymbol', {
        textDocument: { uri: nUri },
      });
      assert.equal(response.error, undefined, JSON.stringify(response.error));
    } finally {
      await client.dispose();
    }
  });

  it('resolves an external reference after the library list is pushed via didChangeConfiguration', async function () {
    this.timeout(20_000);

    // A client can make a new library available by pushing an updated
    // `modelica.libraries` list, without adding a workspace folder.
    const client = new LspTestClient();
    try {
      const nUri = fileUri(FILE_N);
      const nText = fs.readFileSync(FILE_N, 'utf8');
      const position = positionOf(nText, 'extends RuntimeLoadLibA.M', 'RuntimeLoadLibA.M');

      await initializeWithLibB(client);
      client.notify('textDocument/didOpen', {
        textDocument: { uri: nUri, languageId: 'modelica', version: 1, text: nText },
      });

      const before = await client.request('textDocument/definition', {
        textDocument: { uri: nUri },
        position,
      });
      assert.deepEqual(before.result, [], 'should not resolve before libA is configured');

      // libB is already loaded (its path repeats here); only libA is new.
      client.notify('workspace/didChangeConfiguration', {
        settings: { modelica: { libraries: [LIB_A, LIB_B] } },
      });

      const after = await waitForDefinition(client, nUri, position, 5_000);
      assert.ok(
        Array.isArray(after) && after.length > 0,
        `RuntimeLoadLibA.M should resolve after the config push, got: ${JSON.stringify(after)}`,
      );
      assert.equal(client.hasExited, false, `server exited (code ${client.exitCode})`);
    } finally {
      await client.dispose();
    }
  });

  it('stops resolving a library removed via didChangeConfiguration', async function () {
    this.timeout(20_000);

    const client = new LspTestClient();
    try {
      const nUri = fileUri(FILE_N);
      const nText = fs.readFileSync(FILE_N, 'utf8');
      const position = positionOf(nText, 'extends RuntimeLoadLibA.M', 'RuntimeLoadLibA.M');

      await initializeWithLibB(client);
      client.notify('textDocument/didOpen', {
        textDocument: { uri: nUri, languageId: 'modelica', version: 1, text: nText },
      });
      client.notify('workspace/didChangeConfiguration', {
        settings: { modelica: { libraries: [LIB_A] } },
      });

      const loaded = await waitForDefinition(client, nUri, position, 5_000);
      assert.ok(Array.isArray(loaded) && loaded.length > 0, 'libA should resolve after config add');

      client.notify('workspace/didChangeConfiguration', {
        settings: { modelica: { libraries: [] } },
      });

      assert.ok(await client.waitForLog('Unloaded 1 library', 5_000), 'libA should be unloaded');
      const after = await client.request('textDocument/definition', {
        textDocument: { uri: nUri },
        position,
      });
      assert.deepEqual(after.result, [], 'should not resolve after libA is removed from config');
      assert.equal(client.hasExited, false, `server exited (code ${client.exitCode})`);
    } finally {
      await client.dispose();
    }
  });

  it('keeps a library available when it is also a workspace folder', async function () {
    this.timeout(20_000);

    const client = new LspTestClient();
    try {
      const libAUri = fileUri(LIB_A);
      const libBUri = fileUri(LIB_B);
      const nUri = fileUri(FILE_N);
      const nText = fs.readFileSync(FILE_N, 'utf8');
      const position = positionOf(nText, 'extends RuntimeLoadLibA.M', 'RuntimeLoadLibA.M');

      await client.request('initialize', {
        processId: process.pid,
        rootUri: libBUri,
        workspaceFolders: [
          { uri: libAUri, name: 'RuntimeLoadLibA' },
          { uri: libBUri, name: 'RuntimeLoadLibB' },
        ],
        capabilities: { workspace: { workspaceFolders: true, didChangeWorkspaceFolders: true } },
        initializationOptions: { libraries: [LIB_A] },
      });
      client.notify('initialized', {});
      client.notify('textDocument/didOpen', {
        textDocument: { uri: nUri, languageId: 'modelica', version: 1, text: nText },
      });

      const before = await waitForDefinition(client, nUri, position, 5_000);
      assert.ok(Array.isArray(before) && before.length > 0, 'libA should resolve initially');

      client.notify('workspace/didChangeConfiguration', {
        settings: { modelica: { libraries: [] } },
      });

      assert.ok(
        await client.waitForLog('No loaded libraries found under removed workspace folder', 5_000),
        'the workspace-owned library should not be unloaded',
      );
      const after = await waitForDefinition(client, nUri, position, 5_000);
      assert.ok(
        Array.isArray(after) && after.length > 0,
        'libA should remain available through the workspace after config removal',
      );
      assert.equal(client.hasExited, false, `server exited (code ${client.exitCode})`);
    } finally {
      await client.dispose();
    }
  });

  it('treats re-announcing an already-loaded library as a no-op without disturbing resolution', async function () {
    this.timeout(20_000);

    // Loading the same library twice must not re-parse it or break the state
    // it already built up; the second announcement should be skipped.
    const client = new LspTestClient();
    try {
      const nUri = fileUri(FILE_N);
      const nText = fs.readFileSync(FILE_N, 'utf8');
      const position = positionOf(nText, 'extends RuntimeLoadLibA.M', 'RuntimeLoadLibA.M');
      const libAFolder = { uri: fileUri(LIB_A), name: 'RuntimeLoadLibA' };

      await initializeWithLibB(client);
      client.notify('textDocument/didOpen', {
        textDocument: { uri: nUri, languageId: 'modelica', version: 1, text: nText },
      });

      client.notify('workspace/didChangeWorkspaceFolders', {
        event: { added: [libAFolder], removed: [] },
      });
      const first = await waitForDefinition(client, nUri, position, 5_000);
      assert.ok(Array.isArray(first) && first.length > 0, 'libA should resolve after first announce');

      // Announce the very same folder again.
      client.notify('workspace/didChangeWorkspaceFolders', {
        event: { added: [libAFolder], removed: [] },
      });
      assert.ok(
        await client.waitForLog('already loaded', 5_000),
        `expected an "already loaded" log for the duplicate announce; logs: ${client.logs.join(' | ')}`,
      );

      // Resolution must still work after the duplicate announce.
      const second = await waitForDefinition(client, nUri, position, 5_000);
      assert.ok(
        Array.isArray(second) && second.length > 0,
        `RuntimeLoadLibA.M should still resolve after a duplicate announce, got: ${JSON.stringify(second)}`,
      );
      assert.equal(client.hasExited, false, `server exited (code ${client.exitCode})`);
    } finally {
      await client.dispose();
    }
  });

  it('loads valid libraries while tolerating an invalid folder announced in the same batch', async function () {
    this.timeout(20_000);

    // Two runtime-added libraries where one references the other, mixed with a
    // nonexistent folder: the bad entry must neither crash the server nor stop
    // the good ones from loading, and cross-library resolution must work.
    const client = new LspTestClient();
    try {
      const pUri = fileUri(FILE_P);
      const pText = fs.readFileSync(FILE_P, 'utf8');
      const position = positionOf(pText, 'extends RuntimeLoadLibA.M', 'RuntimeLoadLibA.M');
      const missing = path.join(LIB_B, 'this-folder-does-not-exist');

      await initializeWithLibB(client);
      client.notify('textDocument/didOpen', {
        textDocument: { uri: pUri, languageId: 'modelica', version: 1, text: pText },
      });

      // Announce a bad folder and both real libraries together.
      client.notify('workspace/didChangeWorkspaceFolders', {
        event: {
          added: [
            { uri: fileUri(missing), name: 'Missing' },
            { uri: fileUri(LIB_A), name: 'RuntimeLoadLibA' },
            { uri: fileUri(LIB_C), name: 'RuntimeLoadLibC' },
          ],
          removed: [],
        },
      });

      // P (in libC) extends RuntimeLoadLibA.M (in libA): resolving it proves
      // both were loaded despite the invalid sibling.
      const after = await waitForDefinition(client, pUri, position, 5_000);
      assert.ok(
        Array.isArray(after) && after.length > 0,
        `cross-library reference should resolve, got: ${JSON.stringify(after)}`,
      );
      assert.equal(client.hasExited, false, `server exited (code ${client.exitCode})`);
    } finally {
      await client.dispose();
    }
  });

  it('unloads a library when its workspace folder is removed, and can reload it afterwards', async function () {
    this.timeout(20_000);

    // A long-running session (e.g. OMEdit) can free a library it no longer
    // needs: removing the workspace folder unloads it, so references stop
    // resolving; announcing it again reloads it from scratch.
    const client = new LspTestClient();
    try {
      const nUri = fileUri(FILE_N);
      const nText = fs.readFileSync(FILE_N, 'utf8');
      const position = positionOf(nText, 'extends RuntimeLoadLibA.M', 'RuntimeLoadLibA.M');
      const libAFolder = { uri: fileUri(LIB_A), name: 'RuntimeLoadLibA' };

      await initializeWithLibB(client);
      client.notify('textDocument/didOpen', {
        textDocument: { uri: nUri, languageId: 'modelica', version: 1, text: nText },
      });

      // Add, then confirm it resolves.
      client.notify('workspace/didChangeWorkspaceFolders', {
        event: { added: [libAFolder], removed: [] },
      });
      const added = await waitForDefinition(client, nUri, position, 5_000);
      assert.ok(Array.isArray(added) && added.length > 0, 'libA should resolve after being added');

      // Remove the folder: the library is unloaded and no longer resolves.
      client.notify('workspace/didChangeWorkspaceFolders', {
        event: { added: [], removed: [libAFolder] },
      });
      assert.ok(
        await client.waitForLog('Unloaded 1 library', 5_000),
        `expected an unload log; logs: ${client.logs.join(' | ')}`,
      );
      // Give the unload a moment to take effect, then confirm it stopped resolving.
      await new Promise((r) => setTimeout(r, 300));
      const afterRemoval = await client.request('textDocument/definition', {
        textDocument: { uri: nUri },
        position,
      });
      assert.deepEqual(
        afterRemoval.result,
        [],
        `RuntimeLoadLibA.M should not resolve after libA is unloaded, got: ${JSON.stringify(afterRemoval.result)}`,
      );

      // Re-adding reloads it (proves the remembered path was forgotten on removal).
      client.notify('workspace/didChangeWorkspaceFolders', {
        event: { added: [libAFolder], removed: [] },
      });
      const readded = await waitForDefinition(client, nUri, position, 5_000);
      assert.ok(
        Array.isArray(readded) && readded.length > 0,
        `RuntimeLoadLibA.M should resolve again after re-adding libA, got: ${JSON.stringify(readded)}`,
      );
      assert.equal(client.hasExited, false, `server exited (code ${client.exitCode})`);
    } finally {
      await client.dispose();
    }
  });
});
