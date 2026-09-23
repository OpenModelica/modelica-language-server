const esbuild = require('esbuild');
const fs = require('fs');

const isWatch = process.argv.includes('--watch');

// web-tree-sitter publishes both ESM (.js) and CJS (.cjs) builds. esbuild
// picks the ESM version by default; that build uses import.meta.url which
// esbuild shims as undefined in CJS output, causing createRequire(undefined)
// to throw at runtime. Force the CJS variant so __dirname is used instead.
const webTreeSitterCjs = require.resolve('web-tree-sitter');

const buildOptions = {
  entryPoints: ['./src/server.ts'],
  bundle: true,
  outfile: './out/server.js',
  platform: 'node',
  // Bundle language-service ESM builds instead of UMD runtime require() calls.
  mainFields: ['module', 'main'],
  format: 'cjs',
  tsconfig: './tsconfig.json',
  alias: { 'web-tree-sitter': webTreeSitterCjs },
  // Read by src/version.ts; the standalone binary has no package.json beside it.
  define: { __MODELICA_LS_VERSION__: JSON.stringify(require('./package.json').version) },
  banner: { js: '#!/usr/bin/env node' },
};

function copyWasm() {
  if (!fs.existsSync('out')) fs.mkdirSync('out');
  fs.copyFileSync('./src/tree-sitter-modelica.wasm', './out/tree-sitter-modelica.wasm');
  fs.copyFileSync('./node_modules/web-tree-sitter/web-tree-sitter.wasm', './out/web-tree-sitter.wasm');
}

if (isWatch) {
  esbuild.context(buildOptions).then(ctx => { copyWasm(); return ctx.watch(); }).catch(() => process.exit(1));
} else {
  esbuild.build(buildOptions).then(copyWasm).catch(() => process.exit(1));
}
