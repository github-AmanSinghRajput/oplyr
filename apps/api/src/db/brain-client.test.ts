import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createBrainDatabase } from './brain-client.js';

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'oplyr-brain-db-'));
}

function getMode(filePath: string) {
  return fs.statSync(filePath).mode & 0o777;
}

test('createBrainDatabase applies brain migrations to a dedicated SQLite file', () => {
  const tempDir = createTempDir();
  const dbPath = path.join(tempDir, 'nested', 'brain.db');

  try {
    const db = createBrainDatabase(dbPath);
    const tables = db
      .prepare(
        `
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
        ORDER BY name
      `
      )
      .all()
      .map((row) => String((row as { name: string }).name));

    assert.ok(tables.includes('brain_entities'));
    assert.ok(tables.includes('brain_atoms'));
    assert.ok(tables.includes('brain_edges'));
    assert.ok(tables.includes('brain_embeddings'));
    assert.ok(tables.includes('brain_raw_archive'));
    assert.ok(tables.includes('brain_preferences'));
    assert.ok(tables.includes('brain_schema_migrations'));

    const atomColumns = db
      .prepare(`SELECT name FROM pragma_table_info('brain_atoms')`)
      .all()
      .map((row) => String((row as { name: string }).name));
    assert.ok(atomColumns.includes('entities_json'));
    assert.ok(atomColumns.includes('contributors_json'));

    const migration = db
      .prepare('SELECT filename FROM brain_schema_migrations ORDER BY filename')
      .all() as { filename: string }[];
    assert.deepEqual(
      migration.map((row) => row.filename),
      [
        '0001_initial.sql',
        '0002_modes_and_sensitivity.sql',
        '0003_embeddings.sql',
        '0004_atom_graph_attribution.sql'
      ]
    );
    db.close();
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('createBrainDatabase is idempotent across repeated opens', () => {
  const tempDir = createTempDir();
  const dbPath = path.join(tempDir, 'brain.db');

  try {
    createBrainDatabase(dbPath).close();
    const db = createBrainDatabase(dbPath);
    const migrationCount = db
      .prepare('SELECT COUNT(*) AS count FROM brain_schema_migrations')
      .get() as { count: number };

    assert.equal(migrationCount.count, 4);
    db.close();
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('createBrainDatabase restricts file permissions for local brain data', () => {
  if (process.platform === 'win32') {
    return;
  }

  const tempDir = createTempDir();
  const brainDir = path.join(tempDir, 'private-brain');
  const dbPath = path.join(brainDir, 'brain.db');

  try {
    const db = createBrainDatabase(dbPath);
    db.close();

    assert.equal(getMode(brainDir), 0o700);
    assert.equal(getMode(dbPath), 0o600);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
