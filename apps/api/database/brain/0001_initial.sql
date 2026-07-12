CREATE TABLE IF NOT EXISTS brain_entities (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  type TEXT NOT NULL,
  stable_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (type IN ('user', 'machine', 'project', 'agent', 'session')),
  UNIQUE (type, stable_key)
);

CREATE TABLE IF NOT EXISTS brain_atoms (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  type TEXT NOT NULL,
  text TEXT NOT NULL,
  normalized_text TEXT NOT NULL,
  scope TEXT NOT NULL,
  project_key TEXT,
  source_hash TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.6,
  salience REAL NOT NULL DEFAULT 0.5,
  provenance_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at TEXT,
  CHECK (type IN ('fact', 'entity', 'preference', 'convention', 'decision')),
  CHECK (scope IN ('global', 'project')),
  CHECK (confidence >= 0 AND confidence <= 1),
  CHECK (salience >= 0 AND salience <= 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_brain_atoms_source_hash
  ON brain_atoms(source_hash);

CREATE INDEX IF NOT EXISTS idx_brain_atoms_scope_project
  ON brain_atoms(scope, project_key, deleted_at);

CREATE INDEX IF NOT EXISTS idx_brain_atoms_last_seen
  ON brain_atoms(last_seen_at);

CREATE TABLE IF NOT EXISTS brain_edges (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  source_atom_id TEXT NOT NULL REFERENCES brain_atoms(id) ON DELETE CASCADE,
  target_atom_id TEXT NOT NULL REFERENCES brain_atoms(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 0.5,
  asserter_agent_id TEXT REFERENCES brain_entities(id) ON DELETE SET NULL,
  decay REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (type IN (
    'relates-to',
    'caused-by',
    'supersedes',
    'contradicts',
    'decided-in',
    'about-file',
    'about-project',
    'asserted-by',
    'mentions'
  )),
  CHECK (weight >= 0 AND weight <= 1),
  CHECK (decay >= 0 AND decay <= 1),
  UNIQUE (source_atom_id, target_atom_id, type)
);

CREATE INDEX IF NOT EXISTS idx_brain_edges_source
  ON brain_edges(source_atom_id, type);

CREATE INDEX IF NOT EXISTS idx_brain_edges_target
  ON brain_edges(target_atom_id, type);

CREATE TABLE IF NOT EXISTS brain_raw_archive (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  source_type TEXT NOT NULL,
  source_hash TEXT NOT NULL UNIQUE,
  compressed_blob BLOB NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at TEXT,
  CHECK (source_type IN ('chat_turn', 'diff', 'transcript', 'file_snapshot', 'meeting'))
);

CREATE TABLE IF NOT EXISTS brain_preferences (
  preference_key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
