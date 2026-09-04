import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { computeSourceHash, sha256 } from './import-ledger.js';

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'oplyr-ledger-'));
}

test('computeSourceHash hashes curated file content and detects edits', async () => {
  const dir = tempDir();
  try {
    const filePath = path.join(dir, 'CLAUDE.md');
    fs.writeFileSync(filePath, '- prefers pnpm\n');

    const first = await computeSourceHash({ path: filePath, kind: 'global' });
    assert.equal(first, sha256('- prefers pnpm\n'));
    // Unchanged content → identical hash, regardless of curated kind.
    assert.equal(await computeSourceHash({ path: filePath, kind: 'project' }), first);

    // An edit changes the hash → the scan will surface it as `changed`.
    fs.writeFileSync(filePath, '- prefers pnpm\n- uses vitest\n');
    assert.notEqual(await computeSourceHash({ path: filePath, kind: 'global' }), first);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('computeSourceHash hashes the session tail and returns null for unreadable files', async () => {
  const dir = tempDir();
  try {
    const filePath = path.join(dir, 'rollout.jsonl');
    fs.writeFileSync(filePath, '{"a":1}\n{"b":2}\n');

    const first = await computeSourceHash({ path: filePath, kind: 'session' });
    assert.ok(first && first.length === 64);

    // Appended turns change the tail → hash changes (a grown session reads as `changed`).
    fs.appendFileSync(filePath, '{"c":3}\n');
    assert.notEqual(await computeSourceHash({ path: filePath, kind: 'session' }), first);

    assert.equal(
      await computeSourceHash({ path: path.join(dir, 'missing.md'), kind: 'global' }),
      null
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
