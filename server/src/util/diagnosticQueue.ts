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


/**
 * One shared, lazy queue for all open documents, not a timer/parser per tab.
 * Stores only URIs/deadlines and yields between documents. The consumer reads
 * the current document at execution time and owns temporary parser resources.
 */
export class DiagnosticQueue {
  #pending = new Map<string, number>();
  #timer: ReturnType<typeof setTimeout> | undefined;
  #disposed = false;

  constructor(
    private readonly check: (uri: string) => void,
    private readonly debounceMs = 150,
    private readonly yieldMs = 25,
  ) {}

  schedule(uri: string): void {
    if (this.#disposed) return;
    this.#pending.set(uri, Date.now() + this.debounceMs);
    this.arm();
  }

  cancel(uri: string): void {
    this.#pending.delete(uri);
    if (!this.#pending.size) {
      clearTimeout(this.#timer);
      this.#timer = undefined;
    }
  }

  dispose(): void {
    this.#disposed = true;
    clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#pending.clear();
  }

  private arm(minimumDelay = 0): void {
    if (this.#disposed || this.#timer !== undefined || !this.#pending.size) return;
    let earliest = Infinity;
    for (const deadline of this.#pending.values()) earliest = Math.min(earliest, deadline);
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      const now = Date.now();
      for (const [uri, deadline] of this.#pending) {
        if (deadline > now) continue;
        this.#pending.delete(uri);
        try {
          this.check(uri);
        } finally {
          this.arm(this.yieldMs);
        }
        return;
      }
      this.arm();
    }, Math.max(minimumDelay, earliest - Date.now()));
  }
}

