import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { parseDependencies } from './dependency-parser.js';
import { buildTree } from './scanner.js';
import type { ScannedFile } from './codebase-map.types.js';

function sourceFile(relPath: string): ScannedFile {
  const name = relPath.split('/').pop() ?? relPath;
  return {
    path: relPath,
    name,
    ext: path.extname(name).toLowerCase(),
    dir: relPath.includes('/') ? relPath.split('/')[0] : '.',
    language: 'TypeScript'
  };
}

test('parseDependencies resolves relative import/require/export edges and ignores externals', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'oplyr-codemap-'));
  try {
    await fs.mkdir(path.join(root, 'lib'), { recursive: true });
    await fs.writeFile(
      path.join(root, 'index.ts'),
      [
        "import { helper } from './lib/util';",
        "import express from 'express';", // external — must be ignored
        "export { thing } from './lib/util';"
      ].join('\n')
    );
    await fs.writeFile(path.join(root, 'lib', 'util.ts'), 'export const helper = () => 1;\n');

    const files = [sourceFile('index.ts'), sourceFile('lib/util.ts')];
    const edges = await parseDependencies(root, files);

    // index.ts → lib/util.ts, deduped to a single edge despite two references.
    assert.deepEqual(edges, [{ from: 'index.ts', to: 'lib/util.ts' }]);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('parseDependencies resolves ESM .js-extension imports to the .ts source', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'oplyr-codemap-esm-'));
  try {
    await fs.mkdir(path.join(root, 'lib'), { recursive: true });
    await fs.writeFile(path.join(root, 'index.ts'), "import { helper } from './lib/util.js';\n");
    await fs.writeFile(path.join(root, 'lib', 'util.ts'), 'export const helper = () => 1;\n');

    const files = [sourceFile('index.ts'), sourceFile('lib/util.ts')];
    const edges = await parseDependencies(root, files);

    assert.deepEqual(edges, [{ from: 'index.ts', to: 'lib/util.ts' }]);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('parseDependencies resolves tsconfig path aliases (the @/ alias case)', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'oplyr-codemap-alias-'));
  try {
    await fs.writeFile(
      path.join(root, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@/*': ['./*'] } } })
    );
    await fs.mkdir(path.join(root, 'components'), { recursive: true });
    await fs.writeFile(path.join(root, 'page.tsx'), "import { Card } from '@/components/card';\n");
    await fs.writeFile(
      path.join(root, 'components', 'card.tsx'),
      'export const Card = () => null;\n'
    );

    const files = [sourceFile('page.tsx'), sourceFile('components/card.tsx')];
    const edges = await parseDependencies(root, files);

    assert.deepEqual(edges, [{ from: 'page.tsx', to: 'components/card.tsx' }]);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

function pyFile(relPath: string): ScannedFile {
  const name = relPath.split('/').pop() ?? relPath;
  return {
    path: relPath,
    name,
    ext: path.extname(name).toLowerCase(),
    dir: relPath.includes('/') ? relPath.split('/')[0] : '.',
    language: 'Python'
  };
}

test('parseDependencies resolves Python absolute + relative imports, ignores stdlib/3rd-party', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'oplyr-codemap-py-'));
  try {
    await fs.mkdir(path.join(root, 'app', 'services'), { recursive: true });
    await fs.writeFile(
      path.join(root, 'app', 'main.py'),
      [
        'import os', // stdlib — ignored
        'import requests', // third-party — ignored
        'from app.services.auth import login', // absolute → app/services/auth.py
        'from .config import settings' // relative → app/config.py
      ].join('\n')
    );
    await fs.writeFile(path.join(root, 'app', 'services', 'auth.py'), 'def login():\n    pass\n');
    await fs.writeFile(path.join(root, 'app', 'config.py'), 'settings = {}\n');

    const files = [pyFile('app/main.py'), pyFile('app/services/auth.py'), pyFile('app/config.py')];
    const edges = await parseDependencies(root, files);
    const sorted = edges.map((e) => `${e.from}->${e.to}`).sort();

    assert.deepEqual(sorted, ['app/main.py->app/config.py', 'app/main.py->app/services/auth.py']);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('parseDependencies resolves Python `from . import sibling` and package __init__', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'oplyr-codemap-py2-'));
  try {
    await fs.mkdir(path.join(root, 'pkg'), { recursive: true });
    await fs.writeFile(path.join(root, 'pkg', '__init__.py'), '\n');
    await fs.writeFile(
      path.join(root, 'pkg', 'a.py'),
      ['from . import b', 'from pkg import helpers'].join('\n')
    );
    await fs.writeFile(path.join(root, 'pkg', 'b.py'), 'x = 1\n');
    await fs.writeFile(path.join(root, 'pkg', 'helpers.py'), 'y = 2\n');

    const files = [
      pyFile('pkg/__init__.py'),
      pyFile('pkg/a.py'),
      pyFile('pkg/b.py'),
      pyFile('pkg/helpers.py')
    ];
    const edges = await parseDependencies(root, files);
    const targets = edges
      .filter((e) => e.from === 'pkg/a.py')
      .map((e) => e.to)
      .sort();

    // `from . import b` → pkg/b.py ; `from pkg import helpers` → pkg/helpers.py (submodule).
    assert.ok(targets.includes('pkg/b.py'), `expected pkg/b.py, got ${targets.join(',')}`);
    assert.ok(
      targets.includes('pkg/helpers.py'),
      `expected pkg/helpers.py, got ${targets.join(',')}`
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('buildTree nests files under folders, folders first then files', () => {
  const tree = buildTree([sourceFile('lib/util.ts'), sourceFile('index.ts')]);

  assert.equal(tree.length, 2);
  // Folder ("lib") sorts before the root file ("index.ts").
  assert.equal(tree[0].type, 'dir');
  assert.equal(tree[0].name, 'lib');
  assert.equal(tree[0].children?.[0]?.path, 'lib/util.ts');
  assert.equal(tree[1].type, 'file');
  assert.equal(tree[1].name, 'index.ts');
});
