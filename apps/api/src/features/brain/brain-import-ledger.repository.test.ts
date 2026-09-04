import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createBrainDatabase } from '../../db/brain-client.js';
import { BrainRepository } from './brain.repository.js';

const SOURCE = '/home/u/CLAUDE.md';

test('import ledger: upsert records a source and list returns it; re-import keeps the prior atom count', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oplyr-ledger-repo-'));
  const db = createBrainDatabase(path.join(dir, 'brain.db'));
  const repo = new BrainRepository();
  try {
    repo.upsertImportSource(
      {
        path: SOURCE,
        providerId: 'claude',
        kind: 'global',
        projectKey: null,
        contentHash: 'h1',
        atomsAdded: 3
      },
      db
    );
    const afterFirst = repo.listImportSources(db).get(SOURCE);
    assert.ok(afterFirst);
    assert.equal(afterFirst.contentHash, 'h1');
    assert.equal(afterFirst.atomsAdded, 3);

    // Re-importing an UNCHANGED source stores 0 new atoms (dedup) — keep the prior count, refresh the hash.
    repo.upsertImportSource(
      {
        path: SOURCE,
        providerId: 'claude',
        kind: 'global',
        projectKey: null,
        contentHash: 'h2',
        atomsAdded: 0
      },
      db
    );
    const afterZero = repo.listImportSources(db).get(SOURCE);
    assert.equal(afterZero!.contentHash, 'h2');
    assert.equal(afterZero!.atomsAdded, 3);

    // A later import that genuinely adds atoms updates the count.
    repo.upsertImportSource(
      {
        path: SOURCE,
        providerId: 'claude',
        kind: 'global',
        projectKey: null,
        contentHash: 'h3',
        atomsAdded: 5
      },
      db
    );
    assert.equal(repo.listImportSources(db).get(SOURCE)!.atomsAdded, 5);
    assert.equal(repo.listImportSources(db).size, 1);
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
