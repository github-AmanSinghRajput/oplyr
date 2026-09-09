import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
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

test('the embedding runtime actually loads and embeds with the shipped sharp stub', async () => {
  // This replaces two tests that read the library's SOURCE and asserted the sharp guard existed.
  // They passed while the app was broken: `utils/image.js` guards its usage with `else if (sharp)`
  // but ends in `else { throw new Error('Unable to load image processing library.') }`, so a falsy
  // stub does not disable image support, it throws at module load. 0.5.1 shipped that way.
  //
  // So this asserts the outcome instead of the shape: assemble exactly what the DMG puts in
  // `api/node_modules` — the enumerated dependencies plus our stub standing in for sharp — and
  // make the real library embed a sentence in it. Runs in a child process because module
  // resolution is per-directory and cannot be redirected in-process.
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'oplyr-embed-'));
  try {
    const modules = path.join(sandbox, 'node_modules');
    fs.mkdirSync(path.join(modules, '@xenova'), { recursive: true });
    fs.mkdirSync(path.join(modules, '@huggingface'), { recursive: true });

    for (const dep of [
      '@xenova/transformers',
      '@huggingface/jinja',
      'onnxruntime-node',
      'onnxruntime-web',
      'onnxruntime-common'
    ]) {
      fs.symlinkSync(path.join(repoRoot, 'node_modules', dep), path.join(modules, dep));
    }
    fs.cpSync(
      path.join(repoRoot, 'apps/desktop/resources/sharp-stub'),
      path.join(modules, 'sharp'),
      {
        recursive: true
      }
    );
    fs.writeFileSync(path.join(sandbox, 'package.json'), '{"type":"module"}');

    const probe = path.join(sandbox, 'probe.mjs');
    fs.writeFileSync(
      probe,
      [
        "const t = await import('@xenova/transformers');",
        't.env.allowRemoteModels = false;',
        `t.env.localModelPath = ${JSON.stringify(path.join(repoRoot, 'apps/api/models'))};`,
        `t.env.cacheDir = ${JSON.stringify(path.join(sandbox, 'cache'))};`,
        "const extractor = await t.pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');",
        "const out = await extractor(['the retry budget is three attempts'], { pooling: 'mean', normalize: true });",
        'process.stdout.write(`DIMS:${out.data.length}`);'
      ].join('\n')
    );

    // `--preserve-symlinks` is load-bearing. Without it Node resolves each symlink to its realpath
    // and then resolves `sharp` relative to THAT, i.e. back out of the sandbox and into the repo's
    // real sharp — so the first version of this test embedded happily with a deliberately broken
    // stub. The DMG copies these directories rather than linking them, so preserving the link path
    // is what reproduces the packaged app's resolution.
    const result = spawnSync(process.execPath, ['--preserve-symlinks', probe], {
      cwd: sandbox,
      encoding: 'utf8',
      timeout: 120_000
    });

    assert.equal(
      result.status,
      0,
      `the embedding runtime failed to load with the shipped dependency set:\n${result.stderr}`
    );
    assert.match(
      result.stdout,
      /DIMS:384/,
      `expected a 384-dimension MiniLM vector, got: ${result.stdout}`
    );
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test('the shipped sharp stub resolves and exports a TRUTHY default', async () => {
  const stubDir = path.join(repoRoot, 'apps/desktop/resources/sharp-stub');
  const pkg = JSON.parse(fs.readFileSync(path.join(stubDir, 'package.json'), 'utf8')) as {
    name: string;
  };

  // It has to be named `sharp`, or Node will not resolve the bare specifier to it.
  assert.equal(pkg.name, 'sharp');

  const loaded = (await import(url.pathToFileURL(path.join(stubDir, 'index.mjs')).href)) as {
    default: unknown;
  };
  // Truthy, not falsy: image.js throws on a falsy sharp rather than disabling image support.
  assert.ok(loaded.default, 'a falsy default makes utils/image.js throw at module load');
});
