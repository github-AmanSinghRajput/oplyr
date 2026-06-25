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
