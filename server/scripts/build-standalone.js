#!/usr/bin/env node
/**
 * Build a Node.js Single Executable Application (SEA) for the language server.
 * Produces out/modelica-language-server[.exe] alongside the existing WASM files.
 * Requires Node.js >= 20 and postject (dev dependency).
 *
 * Usage: node scripts/build-standalone.js
 */

'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', 'out');
const SEA_CONFIG = path.join(__dirname, '..', 'sea-config.json');
const BLOB = path.join(OUT_DIR, 'sea-prep.blob');
const IS_WIN = process.platform === 'win32';
const IS_MAC = process.platform === 'darwin';
const BINARY_NAME = IS_WIN ? 'modelica-language-server.exe' : 'modelica-language-server';
const OUT_BINARY = path.join(OUT_DIR, BINARY_NAME);
// Resolve postject's CLI script directly instead of the node_modules/.bin shim.
// On Windows npm creates postject.cmd there (not a bare "postject" file), so
// execFileSync of the bare name fails ENOENT. Invoking the JS entry under node
// works uniformly across platforms.
const POSTJECT_CLI = require.resolve('postject/dist/cli.js');

function run(cmd, args, opts) {
  console.log(`  $ ${cmd} ${args.join(' ')}`);
  execFileSync(cmd, args, { stdio: 'inherit', ...opts });
}

// 1. Generate the SEA preparation blob.
console.log('\n[1/4] Generating SEA blob...');
run(process.execPath, ['--experimental-sea-config', SEA_CONFIG]);

// 2. Copy the current node binary as the carrier.
console.log('\n[2/4] Copying node binary...');
fs.copyFileSync(process.execPath, OUT_BINARY);
fs.chmodSync(OUT_BINARY, 0o755);

// 2a. Strip the carrier on Linux. The official node binary keeps its symbol table and debug
// info, which Debian's lintian reports as unstripped-binary-or-object for every package that
// ships the server (OpenModelica's omedit .deb). It has to happen before the injection: postject
// adds the blob as a note, and stripping afterwards could remove it.
if (process.platform === 'linux') {
  console.log('\n[2a] Stripping the node binary...');
  run('strip', ['--strip-all', OUT_BINARY]);
}

// 3. Remove existing code signature on macOS (required before injection).
if (IS_MAC) {
  console.log('\n[2b] Removing macOS code signature...');
  run('codesign', ['--remove-signature', OUT_BINARY]);
}

// 4. Inject the blob.
console.log('\n[3/4] Injecting SEA blob with postject...');
const postjectArgs = [
  OUT_BINARY,
  'NODE_SEA_BLOB',
  BLOB,
  '--sentinel-fuse', 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
];
if (IS_MAC) {
  postjectArgs.push('--macho-segment-name', 'NODE_SEA');
}
run(process.execPath, [POSTJECT_CLI, ...postjectArgs]);

// 4. Re-sign on macOS (ad-hoc, sufficient for local use; CI can use a real identity).
if (IS_MAC) {
  console.log('\n[4/4] Ad-hoc re-signing for macOS...');
  run('codesign', ['--sign', '-', OUT_BINARY]);
} else {
  console.log('\n[4/4] Done.');
}

const size = (fs.statSync(OUT_BINARY).size / 1024 / 1024).toFixed(1);
console.log(`\nStandalone binary: ${OUT_BINARY}  (${size} MB)`);
console.log('WASM files must remain alongside the binary:');
console.log('  tree-sitter-modelica.wasm');
console.log('  web-tree-sitter.wasm');
