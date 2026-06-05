const esbuild = require('esbuild');
const fs = require('fs');

const isWatch = process.argv.includes('--watch');

const buildOptions = {
  entryPoints: ['./src/server.ts'],
  bundle: true,
  outfile: './out/server.js',
  platform: 'node',
  format: 'cjs',
  tsconfig: './tsconfig.json',
  banner: { js: '#!/usr/bin/env node' },
};

function copyWasm() {
  if (!fs.existsSync('out')) fs.mkdirSync('out');
  fs.copyFileSync('./src/tree-sitter-modelica.wasm', './out/tree-sitter-modelica.wasm');
  fs.copyFileSync('./node_modules/web-tree-sitter/tree-sitter.wasm', './out/tree-sitter.wasm');
}

if (isWatch) {
  esbuild.context(buildOptions).then(ctx => { copyWasm(); return ctx.watch(); }).catch(() => process.exit(1));
} else {
  esbuild.build(buildOptions).then(copyWasm).catch(() => process.exit(1));
}
