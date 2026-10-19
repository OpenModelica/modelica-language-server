import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Stable versions are shared by npm, the VSIX and the standalone binaries.
export function validateRelease(version, root = process.cwd()) {
  if (typeof version !== 'string' || version.trim() !== version
      || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
    throw new Error('Expected a stable release version such as 0.3.8, without a v prefix.');
  }
  for (const directory of ['.', 'client', 'server']) {
    const manifestPath = resolve(root, directory, 'package.json');
    const lockPath = resolve(root, directory, 'package-lock.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
    for (const [field, actual] of [
      [`${manifestPath}: version`, manifest.version],
      [`${lockPath}: version`, lock.version],
      [`${lockPath}: packages[""].version`, lock.packages?.['']?.version],
    ]) {
      if (actual !== version) {
        throw new Error(`${field} is ${JSON.stringify(actual)}; expected ${version}. Commit the version bump before releasing.`);
      }
    }
  }
  return `v${version}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    console.log(`Validated release ${validateRelease(process.argv[2])}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
