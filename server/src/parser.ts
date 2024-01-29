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

/* -----------------------------------------------------------------------------
 * Taken from bash-language-server and adapted to Modelica language server
 * https://github.com/bash-lsp/bash-language-server/blob/main/server/src/parser.ts
 * -----------------------------------------------------------------------------
 */

import * as Parser from 'web-tree-sitter';

/**
 * Initialize tree-sitter parser and load Modelica language.
 *
 * @returns tree-sitter-modelica parser
 */
export async function initializeParser(): Promise<Parser> {
  await Parser.init();
  const parser = new Parser;

  const Modelica = await Parser.Language.load(`${__dirname}/../tree-sitter-modelica.wasm`);
  parser.setLanguage(Modelica);

  return parser;
}
