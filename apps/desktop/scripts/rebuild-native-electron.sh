#!/usr/bin/env bash
#
# Rebuild the app's native modules (better-sqlite3, node-pty) for Electron's ABI, so the PACKAGED app
# can load them. `npm install` / `npm rebuild` build them for system Node, which the packaged app
# (running via ELECTRON_RUN_AS_NODE) can't load. Run this BEFORE `npm run pack:test` / `npm run dist`.
#
# To go back to dev + tests (system Node), run:  npm rebuild better-sqlite3 node-pty
#
# Notes:
#  - Uses the npm_config_* env form (the reliable way to target Electron; @electron/rebuild --force
#    and node-gyp's CLI --target were both unreliable here).
#  - PYTHON must be a 3.11 (3.12+ dropped distutils, which node-gyp needs). Override with PYTHON=...
set -euo pipefail

ELECTRON_VERSION="${ELECTRON_VERSION:-42.5.0}"
ARCH="${ARCH:-arm64}"
PY="${PYTHON:-/opt/homebrew/bin/python3.11}"
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"

for mod in better-sqlite3 node-pty; do
  dir="$ROOT/node_modules/$mod"
  if [ ! -d "$dir" ]; then
    echo "skip: $mod not found at $dir" >&2
    continue
  fi
  echo "→ rebuilding $mod for Electron $ELECTRON_VERSION ($ARCH)"
  (
    cd "$dir"
    rm -rf build
    PYTHON="$PY" \
      npm_config_runtime=electron \
      npm_config_target="$ELECTRON_VERSION" \
      npm_config_arch="$ARCH" \
      npm_config_disturl=https://electronjs.org/headers \
      npx node-gyp rebuild
  )
done

echo "✔ native modules rebuilt for Electron $ELECTRON_VERSION — safe to package"
