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


import assert from 'node:assert/strict';
import { DiagnosticQueue } from '../diagnosticQueue';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('lazy diagnostic queue', () => {
  let queue: DiagnosticQueue;
  afterEach(() => queue?.dispose());

  async function until(predicate: () => boolean) {
    const deadline = Date.now() + 3000;
    while (!predicate() && Date.now() < deadline) await sleep(5);
    assert.ok(predicate(), 'queued checks should complete');
  }

  it('coalesces a burst of edits to the latest document contents', async () => {
    let text = '';
    const checked: string[] = [];
    queue = new DiagnosticQueue(() => checked.push(text), 30, 5);
    for (let i = 0; i < 100; i++) {
      text = String(i);
      queue.schedule('file:///M.mo');
    }
    assert.deepEqual(checked, [], 'opening/editing must not parse synchronously');
    await until(() => checked.length > 0);
    assert.deepEqual(checked, ['99']);
    await sleep(60);
    assert.equal(checked.length, 1, 'no repeated work for an unchanged document');
  });

  it('yields to other work between checks when many documents are open', async () => {
    const checked: string[] = [];
    let yielded = true;
    queue = new DiagnosticQueue(uri => {
      assert.ok(yielded, 'must let other event-loop work run between documents');
      yielded = false;
      checked.push(uri);
      setTimeout(() => { yielded = true; }, 0);
    }, 10, 5);
    for (let i = 0; i < 50; i++) queue.schedule('file:///' + i + '.mo');
    await until(() => checked.length === 50);
    assert.equal(new Set(checked).size, 50);
  });

  it('does not let a continuously edited file block other queued files', async () => {
    const checked: string[] = [];
    queue = new DiagnosticQueue(uri => checked.push(uri), 40, 5);
    queue.schedule('typing');
    queue.schedule('waiting');
    const edits = setInterval(() => queue.schedule('typing'), 5);
    try {
      await until(() => checked.includes('waiting'));
      assert.deepEqual(checked, ['waiting']);
    } finally {
      clearInterval(edits);
    }
    await until(() => checked.includes('typing'));
  });

  it('cancels closed documents, allows reopening, and stops on shutdown', async () => {
    const checked: string[] = [];
    queue = new DiagnosticQueue(uri => checked.push(uri), 20, 5);
    queue.schedule('closed');
    queue.schedule('open');
    queue.cancel('closed');
    await until(() => checked.length > 0);
    assert.deepEqual(checked, ['open']);
    queue.schedule('closed');
    await until(() => checked.length === 2);
    assert.deepEqual(checked, ['open', 'closed']);
    queue.schedule('shutdown');
    queue.dispose();
    queue.schedule('after shutdown');
    await sleep(60);
    assert.equal(checked.length, 2);
  });
});

