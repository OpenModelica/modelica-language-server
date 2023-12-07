import * as Parser from 'web-tree-sitter';

export async function initializeParser(): Promise<Parser> {
  await Parser.init();
  const parser = new Parser;

  const Modelica = await Parser.Language.load(`${__dirname}/../tree-sitter-modelica.wasm`);
  parser.setLanguage(Modelica);

  return parser;
}
