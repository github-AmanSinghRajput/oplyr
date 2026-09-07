import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isMappableFile, scanWorkspace } from './scanner.js';

/** Build a throwaway repo on disk from a { relativePath: contents } map. */
function makeRepo(files: string[]): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'oplyr-scan-'));
  for (const rel of files) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, 'x');
  }
  return root;
}

test('scanWorkspace never walks into installed dependencies or build output', async () => {
  // A Python backend and a JS frontend, dependencies and all. Anything a package manager or build
  // tool put on disk must not reach the map — it is not part of the codebase.
  const root = makeRepo([
    'app/main.py',
    'src/index.ts',
    'node_modules/react/index.js',
    '.venv/lib/python3.12/site-packages/requests/api.py',
    'venv/lib/site-packages/flask/app.py',
    'lib/site-packages/boto3/client.py',
    '__pycache__/main.cpython-312.pyc',
    '.pytest_cache/v/results',
    'myapp.egg-info/PKG-INFO',
    'somepkg.dist-info/METADATA',
    'build/lib/main.py',
    'dist/bundle.js',
    'coverage/lcov.info',
    'vendor/github.com/pkg/errors.go',
    'bower_components/jquery/jquery.js',
    '.next/server/page.js',
    '.git/config'
  ]);

  try {
    const scanned = (await scanWorkspace(root)).map((file) => file.path).sort();
    assert.deepEqual(scanned, ['app/main.py', 'src/index.ts']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('scanWorkspace drops OS and build droppings entirely', async () => {
  const root = makeRepo([
    'src/a.ts',
    '.DS_Store',
    'src/.DS_Store',
    'tsconfig.tsbuildinfo',
    'debug.log'
  ]);
  try {
    const scanned = (await scanWorkspace(root)).map((file) => file.path);
    assert.deepEqual(scanned, ['src/a.ts']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('scanWorkspace still refuses secret paths', async () => {
  const root = makeRepo(['src/a.ts', '.env', '.env.local', 'certs/key.pem']);
  try {
    const scanned = (await scanWorkspace(root)).map((file) => file.path);
    assert.ok(!scanned.some((p) => p.includes('.env')), '.env must never be scanned');
    assert.ok(!scanned.some((p) => p.endsWith('.pem')), 'keys must never be scanned');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// isMappableFile is stricter than scanWorkspace on purpose: the tree view is a file explorer and
// should show what is on disk, while the canvas is a picture of how the project fits together.
test('the canvas excludes hidden files, generated manifests and machine output', () => {
  for (const name of [
    '.gitignore',
    '.editorconfig',
    '.prettierrc',
    'package-lock.json',
    'pnpm-lock.yaml',
    'yarn.lock',
    'poetry.lock',
    'Cargo.lock',
    'app.min.js',
    'styles.min.css',
    'bundle.js.map',
    'vendor.bundle.js',
    'schema_pb2.py',
    'types.generated.ts'
  ]) {
    assert.equal(isMappableFile(name, path.extname(name)), false, `${name} should not be a node`);
  }
});

test('the canvas keeps the files that describe the project', () => {
  for (const name of [
    'package.json',
    'tsconfig.json',
    'next.config.mjs',
    'middleware.ts',
    'Dockerfile',
    'README.md',
    'pyproject.toml',
    'requirements.txt',
    'main.py',
    'index.tsx'
  ]) {
    assert.equal(isMappableFile(name, path.extname(name)), true, `${name} should be a node`);
  }
});
