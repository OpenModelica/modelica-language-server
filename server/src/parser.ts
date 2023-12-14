/* --------------------------------------------------------------------------------------------
 * Copyright (c) 2023 Andreas Heuermann, Osman Karabel
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

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
