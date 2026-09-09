import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

/**
 * Guards the packaging of the embedding runtime.
 *
 * `@xenova/transformers` is not bundled by esbuild — it is copied into the packaged app by an
 * extraResources list in electron-builder.yml, and that list is written by hand. Twice now it has
 * been missing one of the library's dependencies, and both times the symptom was the same: the
 * import fails at load, every brain memory is stored with no vector, and semantic recall silently
 * degrades to keyword overlap in a shipped build. `onnxruntime-node` cost us every release through
 * 0.4.1; `sharp` was caught only because the "Keyword only" warning was added to the UI in this cycle.
 *
 * These tests read the library's real source and assert the list still covers it, so the next
 * missing dependency fails here instead of in a DMG.
 */

/** Walk up to the workspace root, so moving this file cannot silently break the paths below. */
function findRepoRoot(): string {
  let dir = url.fileURLToPath(new URL('.', import.meta.url));
  for (let i = 0; i < 8; i += 1) {
    if (fs.existsSync(path.join(dir, 'node_modules/@xenova/transformers'))) return dir;
    dir = path.dirname(dir);
  }
  throw new Error('could not locate the workspace root from this test file');
}

const repoRoot = findRepoRoot();
const transformersSrc = path.join(repoRoot, 'node_modules/@xenova/transformers/src');
const builderConfig = path.join(repoRoot, 'apps/desktop/electron-builder.yml');

/** Node builtins that transformers imports without the `node:` prefix. */
const NODE_BUILTINS = new Set(['fs', 'path', 'url', 'crypto', 'stream', 'os']);

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.isFile() && entry.name.endsWith('.js') ? [full] : [];
  });
}

/** Comments must go first: the library documents `import wavefile from 'wavefile'` inside a JSDoc
 *  example, and treating that as a real dependency would fail this test forever. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function bareImportSpecifiers(): Set<string> {
  const found = new Set<string>();
  for (const file of sourceFiles(transformersSrc)) {
    const code = stripComments(fs.readFileSync(file, 'utf8'));
    for (const match of code.matchAll(/\bimport\s+(?:[^;'"]*?\bfrom\s+)?['"]([^'"]+)['"]/g)) {
      const specifier = match[1]!;
      if (specifier.startsWith('.') || specifier.startsWith('node:')) continue;
      if (NODE_BUILTINS.has(specifier)) continue;
      if (specifier === '@xenova/transformers') continue; // self-reference
      found.add(specifier);
    }
  }
  return found;
}

function packagedModules(): Set<string> {
  const config = fs.readFileSync(builderConfig, 'utf8');
  const shipped = new Set<string>();
  for (const match of config.matchAll(/to:\s*api\/node_modules\/(\S+)/g)) shipped.add(match[1]!);
  return shipped;
}

test('every package transformers statically imports is shipped into the packaged app', () => {
  const required = bareImportSpecifiers();
  const shipped = packagedModules();

  // Sanity-check the extractor itself, so a regex that silently matches nothing cannot pass.
  assert.ok(
    required.has('onnxruntime-node'),
    'extractor found no onnxruntime-node import, so it is not reading the library'
  );

  const missing = [...required].filter((name) => !shipped.has(name));
  assert.deepEqual(
    missing,
    [],
    `these are imported by @xenova/transformers but not in electron-builder.yml extraResources, so ` +
      `a packaged build will fail at load and store every memory with no vector: ${missing.join(', ')}`
  );
});

test('running without the real sharp is still the librarys supported configuration', () => {
  // We ship a stub for sharp rather than 25MB of image codecs plus a 37-package closure. That is
  // only safe while the library keeps tolerating a falsy sharp. Both facts below are what make it
  // safe; if either changes, ship the real package instead of the stub.
  const pkg = JSON.parse(
    fs.readFileSync(path.join(transformersSrc, '..', 'package.json'), 'utf8')
  ) as { browser?: Record<string, unknown> };

  assert.equal(
    pkg.browser?.sharp,
    false,
    'transformers no longer declares sharp as omittable, so the stub may not be safe'
  );

  const imageSource = fs.readFileSync(path.join(transformersSrc, 'utils/image.js'), 'utf8');
  assert.match(
    imageSource,
    /else if \(sharp\)/,
    'utils/image.js no longer guards its sharp usage, so a stub would break image handling'
  );
});

test('the shipped sharp stub resolves and exports a falsy default', async () => {
  const stubDir = path.join(repoRoot, 'apps/desktop/resources/sharp-stub');
  const pkg = JSON.parse(fs.readFileSync(path.join(stubDir, 'package.json'), 'utf8')) as {
    name: string;
  };

  // It has to be named `sharp`, or Node will not resolve the bare specifier to it.
  assert.equal(pkg.name, 'sharp');

  const loaded = (await import(url.pathToFileURL(path.join(stubDir, 'index.mjs')).href)) as {
    default: unknown;
  };
  assert.equal(loaded.default, null, 'image.js branches on `else if (sharp)`, so it must be falsy');
});
