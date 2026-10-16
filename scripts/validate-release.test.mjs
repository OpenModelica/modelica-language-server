import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateRelease } from './validate-release.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'modelica-release-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const directory of ['.', 'client', 'server']) {
    mkdirSync(join(root, directory), { recursive: true });
    writeFileSync(join(root, directory, 'package.json'), JSON.stringify({ version: '0.3.8' }));
    writeFileSync(join(root, directory, 'package-lock.json'), JSON.stringify({
      version: '0.3.8', packages: { '': { version: '0.3.8' } },
    }));
  }
  return root;
}

test('accepts matching versions across the extension, client, server and locks', t => {
  assert.equal(validateRelease('0.3.8', fixture(t)), 'v0.3.8');
});

for (const version of [undefined, '', 'v0.3.8', '0.3', '01.3.8', '0.3.8-beta.1', '0.3.8\n', '0.3.8; echo unexpected']) {
  test(`rejects unsupported version ${JSON.stringify(version)}`, t => {
    assert.throws(() => validateRelease(version, fixture(t)), /Expected a stable release version/);
  });
}

for (const directory of ['.', 'client', 'server']) {
  for (const field of ['manifest', 'lock', 'lock root']) {
    test(`rejects stale ${directory} ${field}`, t => {
      const root = fixture(t);
      const path = join(root, directory, field === 'manifest' ? 'package.json' : 'package-lock.json');
      const data = JSON.parse(readFileSync(path, 'utf8'));
      if (field === 'lock root') data.packages[''].version = '0.3.7';
      else data.version = '0.3.7';
      writeFileSync(path, JSON.stringify(data));
      assert.throws(() => validateRelease('0.3.8', root), /expected 0.3.8/);
    });
  }
}

test('rejects a missing lockfile root version', t => {
  const root = fixture(t);
  writeFileSync(join(root, 'server', 'package-lock.json'), JSON.stringify({ version: '0.3.8' }));
  assert.throws(() => validateRelease('0.3.8', root), /packages\[""\].version/);
});

test('CLI succeeds for the committed version and fails for a mismatched version', t => {
  const cwd = fixture(t);
  const script = fileURLToPath(new URL('./validate-release.mjs', import.meta.url));
  const valid = spawnSync(process.execPath, [script, '0.3.8'], { cwd, encoding: 'utf8' });
  assert.equal(valid.status, 0, valid.stderr);
  assert.match(valid.stdout, /Validated release v0.3.8/);
  const invalid = spawnSync(process.execPath, [script, '0.3.9'], { cwd, encoding: 'utf8' });
  assert.equal(invalid.status, 1, invalid.stderr);
  assert.match(invalid.stderr, /expected 0.3.9/);
});
