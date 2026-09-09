#!/usr/bin/env node
// Post-build check for `dist:mac`.
//
// `hdiutil create` intermittently fails with "Resource busy" — a macOS diskarbitration race that
// reproduces roughly one run in four with nothing else on the machine, and is unrelated to how we
// package. electron-builder retries it five times and has always recovered, but it still prints
//
//   ⨯ unable to execute hdiutil ... Exit code: 1
//
// which is indistinguishable from a build that genuinely failed. That ambiguity is the real
// problem, so the build now proves its own output instead of leaving you to read the log: if this
// passes, the retry noise can be ignored; if it fails, stop.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import url from 'node:url';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const releaseDir = path.join(here, '..', 'release');
const { version } = JSON.parse(readFileSync(path.join(here, '..', 'package.json'), 'utf8'));

const dmg = path.join(releaseDir, `Oplyr-${version}-arm64.dmg`);
const zip = path.join(releaseDir, `Oplyr-${version}-arm64-mac.zip`);
const feed = path.join(releaseDir, 'latest-mac.yml');

const failures = [];
const ok = [];

function check(label, fn) {
  try {
    const detail = fn();
    ok.push(detail ? `${label} — ${detail}` : label);
  } catch (error) {
    failures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Both streams merged: `hdiutil verify` reports its result on stderr, not stdout. */
function run(file, args) {
  return execFileSync(file, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).toString();
}

function runMerged(file, args) {
  const result = spawnSync(file, args, { encoding: 'utf8' });
  if (result.error) throw result.error;
  return `${result.stdout ?? ''}${result.stderr ?? ''}`;
}

check('DMG exists', () => {
  if (!existsSync(dmg)) throw new Error(`missing ${path.basename(dmg)}`);
  return `${(readFileSync(dmg).byteLength / 1e6).toFixed(0)}MB`;
});

check('DMG checksum verifies', () => {
  const out = runMerged('hdiutil', ['verify', dmg]);
  if (!/is VALID/.test(out)) throw new Error('hdiutil verify did not report VALID');
  return null;
});

// The payload matters more than the wrapper: a DMG can be structurally fine and hold the wrong app.
check('app inside the DMG', () => {
  const mount = mkdtempSync(path.join(tmpdir(), 'oplyr-verify-'));
  try {
    run('hdiutil', ['attach', '-nobrowse', '-quiet', '-mountpoint', mount, dmg]);
    const app = path.join(mount, 'Oplyr.app');
    const shipped = run('/usr/libexec/PlistBuddy', [
      '-c',
      'Print :CFBundleShortVersionString',
      path.join(app, 'Contents/Info.plist')
    ]).trim();
    if (shipped !== version) throw new Error(`app is ${shipped}, expected ${version}`);

    // Both of these have shipped broken before: the embedding runtime needs sharp and
    // onnxruntime-node to RESOLVE, or every memory is stored with no vector.
    for (const dep of ['sharp', 'onnxruntime-node']) {
      if (!existsSync(path.join(app, 'Contents/Resources/api/node_modules', dep))) {
        throw new Error(`${dep} is not in the bundle — semantic recall will not run`);
      }
    }
    return `v${shipped}, embedding deps present`;
  } finally {
    try {
      run('hdiutil', ['detach', '-quiet', mount]);
    } catch {
      // already gone
    }
    rmSync(mount, { recursive: true, force: true });
  }
});

// The update feed must point at the zip. A dmg-last build rewrites it to the DMG, which would send
// every existing install after an artifact that is never published.
check('update feed points at the zip', () => {
  if (!existsSync(feed)) throw new Error('missing latest-mac.yml');
  const text = readFileSync(feed, 'utf8');
  const feedVersion = /^version:\s*(.+)$/m.exec(text)?.[1]?.trim();
  const feedPath = /^path:\s*(.+)$/m.exec(text)?.[1]?.trim();
  if (feedVersion !== version) throw new Error(`feed says ${feedVersion}, expected ${version}`);
  if (!feedPath?.endsWith('.zip')) throw new Error(`feed path is ${feedPath}, expected the .zip`);
  if (!existsSync(zip)) throw new Error(`missing ${path.basename(zip)}`);
  return feedPath;
});

for (const line of ok) console.log(`  ok    ${line}`);
for (const line of failures) console.error(`  FAIL  ${line}`);

if (failures.length > 0) {
  console.error(`\ndist verification failed (${failures.length}). Do not sign or publish this build.`);
  process.exit(1);
}
console.log(
  `\nBuild verified: Oplyr ${version}. Any "unable to execute hdiutil" line above was retried and recovered.`
);
