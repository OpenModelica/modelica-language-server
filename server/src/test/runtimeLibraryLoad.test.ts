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
const FILE_N = path.join(LIB_B, 'N.mo');

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

  constructor() {
    assert.ok(
      fs.existsSync(SERVER_BUNDLE),
      `Server bundle not found at ${SERVER_BUNDLE}. Run 'npm run esbuild' before the tests.`,
    );
    this.#child = spawn(process.execPath, [SERVER_BUNDLE, '--stdio'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.#child.stdout.on('data', (chunk: Buffer) => this.#onData(chunk));
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
      const resolve = message.id !== undefined ? this.#pending.get(message.id) : undefined;
      if (message.id !== undefined && resolve) {
        this.#pending.delete(message.id);
        resolve(message);
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
    await this.request('shutdown', {});
    this.notify('exit', undefined);
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
});
