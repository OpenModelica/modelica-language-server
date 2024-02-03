const esbuild = require('esbuild');
const fs = require('fs');

// Build client
esbuild.build({
  entryPoints: [
    './client/src/extension.ts'
  ],
  bundle: true,
  outfile: './out/client.js',
  platform: 'node',
  external: [
    'vscode'
  ],
  format: 'cjs',
  tsconfig: './client/tsconfig.json',
}).catch(() => process.exit(1));

// Build server
esbuild.build({
  entryPoints: [
    './server/src/server.ts'
  ],
  bundle: true,
  outfile: './out/server.js',
  platform: 'node',
  external: [
    'vscode',
  ],
  format: 'cjs',
  tsconfig: './server/tsconfig.json',
}).catch(() => process.exit(1));

// Copy tree-sitter.wasm and tree-sitter-modelica.wasm to the output directory
if (!fs.existsSync('out')) {
  fs.mkdirSync('out');
}
fs.copyFileSync('./server/src/tree-sitter-modelica.wasm', './out/tree-sitter-modelica.wasm');
fs.copyFileSync('./server/node_modules/web-tree-sitter/tree-sitter.wasm', './out/tree-sitter.wasm');
