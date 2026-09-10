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
import { createRequire } from 'node:module';
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

    // Presence is not enough, and checking presence is how 0.5.1 shipped broken: `sharp` was in
    // the bundle but exported a falsy value, which makes transformers throw while loading. So
    // actually IMPORT the library from the DMG's own node_modules. That directory is a real copy,
    // not a symlink, so resolution here is exactly the packaged app's.
    const apiDir = path.join(app, 'Contents/Resources/api');
    for (const dep of ['sharp', 'onnxruntime-node']) {
      if (!existsSync(path.join(apiDir, 'node_modules', dep))) {
        throw new Error(`${dep} is not in the bundle — semantic recall will not run`);
      }
    }

    // Only `utils/image.js`, not the whole library. Importing all of transformers pulls in
    // onnxruntime's native binding, and dlopen refuses it from a foreign process on a signed app
    // ("library load disallowed by system policy") — which would fail every correct build. image.js
    // is where the sharp branch lives, so it is both the narrowest and the only relevant check.
    const probe = spawnSync(
      process.execPath,
      ['--input-type=module', '-e', "await import('@xenova/transformers/src/utils/image.js');"],
      { cwd: apiDir, encoding: 'utf8', timeout: 60_000 }
    );
    if (probe.status !== 0) {
      const why = (probe.stderr ?? '').split('\n').find((line) => /Error/.test(line)) ?? 'unknown';
      throw new Error(`the embedding runtime does not load from the bundle: ${why.trim()}`);
    }

    const electronVersion = JSON.parse(
      readFileSync(path.join(here, '..', 'package.json'), 'utf8')
    ).devDependencies?.electron?.replace(/^[^0-9]*/, '');
    const require_ = createRequire(import.meta.url);
    const expectedAbi = String(require_('node-abi').getAbi(electronVersion, 'electron'));

    const checked = [];
    for (const mod of ['better-sqlite3', 'node-pty']) {
      const binding = path.join(
        apiDir,
        'node_modules',
        mod,
        mod === 'node-pty' ? 'build/Release/pty.node' : 'build/Release/better_sqlite3.node'
      );
      if (!existsSync(binding)) throw new Error(`${mod} has no compiled binding in the bundle`);
      // Node-API modules are ABI-stable, so there is nothing to match.
      if (usesNodeApi(binding)) {
        checked.push(`${mod} napi`);
        continue;
      }
      const { abi, builtForThisNode } = abiOfBinding(binding);
      if (builtForThisNode || abi !== expectedAbi) {
        throw new Error(
          `${mod} is built for ABI ${abi}, but Electron ${electronVersion} loads ABI ${expectedAbi}. ` +
            `The API will die at startup. Run \`npm run rebuild:native\` and repackage.`
        );
      }
      checked.push(`${mod} ABI ${abi}`);
    }

    return `v${shipped}, embedding runtime loads, ${checked.join(' + ')}`;
  } finally {
    try {
      run('hdiutil', ['detach', '-quiet', mount]);
    } catch {
      // already gone
    }
    rmSync(mount, { recursive: true, force: true });
  }
});

/**
 * The native bindings must be built for ELECTRON's ABI, not the system Node's.
 *
 * This is what broke 0.5.2 for every user: the packaged `better_sqlite3.node` was built for Node
 * 24 (ABI 137) while Electron 42 loads ABI 146, so the API process died at startup with
 * ERR_DLOPEN_FAILED, the frontend had no backend, and onboarding stopped on step 1 with a generic
 * "voice setup failed". `npm rebuild better-sqlite3` (which the release runbook tells you to run at
 * the end, to get dev and tests working again) builds for system Node, and packaging afterwards
 * ships that.
 *
 * Detection loads the shipped binding under THIS Node on purpose:
 *  - it loads          → built for system Node → wrong, and the app will not boot
 *  - it refuses, naming the version it was built for → compare that to Electron's ABI
 *
 * Note that `build/config.gypi` is NOT usable for this. It still said `runtime: electron` on a tree
 * whose actual .node had since been replaced by a Node build, because prebuild-install overwrites
 * the binary without touching the metadata.
 */
/**
 * Does this binding use Node-API? Those are ABI-stable across Node and Electron versions by design,
 * so they load anywhere and must NOT be held to an ABI match. node-pty is one; better-sqlite3 is
 * not. An earlier version of this check ignored the distinction and failed a perfectly good build,
 * reporting node-pty as "built for ABI 137" when 137 was simply the ABI of the Node running the
 * check.
 */
function usesNodeApi(bindingPath) {
  const symbols = spawnSync('nm', ['-u', bindingPath], { encoding: 'utf8' });
  return (symbols.stdout ?? '').includes('napi_');
}

/**
 * The ABI a binding was compiled for.
 *
 * Loading it under THIS Node is the probe: an ABI-bound module built for Electron refuses and names
 * the version it wants, while one built for the running Node loads silently — which is the failure
 * we are looking for, because packaging must not ship a system-Node build.
 */
function abiOfBinding(bindingPath) {
  const probe = spawnSync(
    process.execPath,
    ['-e', `process.dlopen({ exports: {} }, ${JSON.stringify(bindingPath)})`],
    { encoding: 'utf8' }
  );
  if (probe.status === 0) return { abi: process.versions.modules, builtForThisNode: true };
  const matched = /NODE_MODULE_VERSION (\d+)/.exec(probe.stderr ?? '');
  if (!matched) throw new Error(`could not read the ABI of ${path.basename(bindingPath)}`);
  return { abi: matched[1], builtForThisNode: false };
}

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
  console.error(
    `\ndist verification failed (${failures.length}). Do not sign or publish this build.`
  );
  process.exit(1);
}
console.log(
  `\nBuild verified: Oplyr ${version}. Any "unable to execute hdiutil" line above was retried and recovered.`
);
