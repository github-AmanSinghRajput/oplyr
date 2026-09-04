#!/usr/bin/env node
// Preflight for the local runtime + tests.
//
// better-sqlite3 is a native module whose compiled ABI (NODE_MODULE_VERSION) must match the Node that
// loads it. That ABI drifts out from under us whenever the active Node changes — Homebrew Node vs an
// `nvm use`, or a packaged build that rebuilds it for Electron's ABI — and the next `dev:desktop` then
// dies with a cryptic `ERR_DLOPEN_FAILED ... was compiled against a different Node.js version`.
//
// Rather than make anyone run `npm rebuild better-sqlite3` by hand after every Node/context switch,
// this verifies the module loads under THIS Node and auto-rebuilds ONLY on an ABI mismatch. A healthy
// tree is a fast no-op. It runs as `predev`/`pretest`, so it fires on the exact `npm run dev`/`npm test`
// invocations the desktop shell and CI use.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const require = createRequire(import.meta.url);

/** Try to load + instantiate better-sqlite3 under the current Node. Returns the error, or null if OK. */
function tryLoad() {
  try {
    const Database = require('better-sqlite3');
    new Database(':memory:').close();
    return null;
  } catch (error) {
    return error;
  }
}

/**
 * The two failures a rebuild actually fixes: the binary was built for a different ABI, or it isn't
 * there at all (an interrupted `npm rebuild` deletes the old binding before writing the new one, so
 * a killed install leaves the tree with no binding). Anything else we surface instead of masking.
 */
function isRecoverable(error) {
  const message = error?.message ?? String(error ?? '');
  return (
    error?.code === 'ERR_DLOPEN_FAILED' ||
    /NODE_MODULE_VERSION|different Node\.js version|was compiled against/i.test(message) ||
    /Could not locate the bindings file/i.test(message)
  );
}

const initial = tryLoad();
if (!initial) {
  process.exit(0); // healthy — no-op
}

if (!isRecoverable(initial)) {
  console.error('[ensure-native] better-sqlite3 failed to load:', initial?.message ?? initial);
  console.error('[ensure-native] a rebuild will not fix this. Try: npm install');
  process.exit(1);
}

// Rebuild against the current Node. Run from the dir that actually owns node_modules/better-sqlite3
// (the hoisted workspace root), derived from the package itself so it's independent of cwd.
const repoRoot = path.resolve(
  path.dirname(require.resolve('better-sqlite3/package.json')),
  '..',
  '..'
);
console.log(
  `[ensure-native] better-sqlite3's native binding is missing or built for a different Node ABI ` +
    `(now Node ${process.version}, ABI ${process.versions.modules}). Rebuilding — this happens once ` +
    `after a Node or packaged-build switch…`
);
// This runs as a `pretest`/`predev` lifecycle script, so npm has exported its own config into the
// environment — including any `--workspace` filter from the outer command. The nested rebuild must
// operate on the hoisted root tree that actually owns better-sqlite3, so drop that scoping rather
// than letting the outer invocation redirect it.
const rebuildEnv = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key]) => !/^npm_config_(workspaces?|include_workspace_root)$/i.test(key)
  )
);
try {
  execFileSync('npm', ['rebuild', 'better-sqlite3'], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: rebuildEnv
  });
} catch {
  console.error('[ensure-native] automatic rebuild failed. Run it by hand: npm rebuild better-sqlite3');
  // A rebuild normally lands the prebuilt binary and never invokes a compiler. If it does fall
  // through to node-gyp, node-gyp 9's bundled gyp imports distutils, which Python 3.12 removed —
  // so a machine whose default python3 is newer needs to be pointed at an older one.
  console.error(
    '[ensure-native] if that fails in node-gyp with "No module named \'distutils\'", build against ' +
      'Python 3.11: npm_config_python=$(command -v python3.11) npm rebuild better-sqlite3'
  );
  process.exit(1);
}

const afterRebuild = tryLoad();
if (afterRebuild) {
  console.error('[ensure-native] still failing after rebuild:', afterRebuild?.message ?? afterRebuild);
  process.exit(1);
}
console.log(`[ensure-native] better-sqlite3 ready for Node ${process.version}.`);
