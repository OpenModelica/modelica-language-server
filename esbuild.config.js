const esbuild = require('esbuild');
const fs = require('fs');

// web-tree-sitter publishes both ESM (.js) and CJS (.cjs) builds. esbuild
// picks the ESM version by default; that build uses import.meta.url which
// esbuild shims as undefined in CJS output, causing createRequire(undefined)
// to throw at runtime. Force the CJS variant so __dirname is used instead.
// require.resolve() applies the "require" export condition and returns .cjs.
const webTreeSitterCjs = require.resolve('web-tree-sitter', {
  paths: [require('path').join(__dirname, 'server')],
});

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
  // Bundle language-service ESM builds; their UMD wrappers contain runtime
  // relative require() calls that cannot be relocated into a single bundle.
  mainFields: ['module', 'main'],
  external: [
    'vscode',
  ],
  alias: {
    'web-tree-sitter': webTreeSitterCjs,
  },
  // Read by server/src/version.ts.
  define: {
    __MODELICA_LS_VERSION__: JSON.stringify(require('./server/package.json').version),
  },
  format: 'cjs',
  tsconfig: './server/tsconfig.json',
}).catch(() => process.exit(1));

// Copy tree-sitter-modelica.wasm and web-tree-sitter.wasm to the output directory
if (!fs.existsSync('out')) {
  fs.mkdirSync('out');
}
fs.copyFileSync('./server/src/tree-sitter-modelica.wasm', './out/tree-sitter-modelica.wasm');
fs.copyFileSync('./server/node_modules/web-tree-sitter/web-tree-sitter.wasm', './out/web-tree-sitter.wasm');
