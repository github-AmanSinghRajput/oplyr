import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

/**
 * Guards that the `onUsage` callback is actually FORWARDED, not merely declared.
 *
 * It was declared on every options interface in both clients and then never passed into the
 * function that fires it, so token usage was silently absent from every reply — the callback
 * existed, typechecked, and did nothing. A missing hand-off between two option objects is invisible
 * to the compiler, because both shapes are structurally valid with the property absent.
 */
const clientDir = path.resolve(url.fileURLToPath(new URL('.', import.meta.url)), '../..');

for (const client of ['codex-client.ts', 'claude-client.ts']) {
  test(`${client} forwards onUsage into its streaming call`, () => {
    const source = fs.readFileSync(path.join(clientDir, client), 'utf8');

    // Declared somewhere...
    assert.ok(
      source.includes('onUsage?: (usage: TurnTokenUsage) => void;'),
      'onUsage is not declared on any options interface'
    );
    // ...fired somewhere...
    assert.match(
      source,
      /options\.onUsage\?\.\(usage\)/,
      'nothing in this client ever calls onUsage'
    );
    // ...and, the part that was missing, PASSED from the outer options to the inner call.
    assert.match(
      source,
      /onUsage: options\?\.onUsage/,
      'onUsage is declared and fired but never forwarded from the exported entry point, so it can never run'
    );
  });
}
