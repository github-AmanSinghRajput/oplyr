-- On-device semantic memory: one embedding vector per atom, stored as raw Float32 bytes.
-- Kept in its own table (not a column on brain_atoms) so swapping the embedding model is a
-- single-table repopulate and never rewrites atoms. Atoms without a row here still work — recall
-- falls back to keyword scoring for them.
CREATE TABLE IF NOT EXISTS brain_embeddings (
  atom_id     TEXT PRIMARY KEY REFERENCES brain_atoms(id) ON DELETE CASCADE,
  model       TEXT NOT NULL,
  dim         INTEGER NOT NULL,
  vector      BLOB NOT NULL,
  embedded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (dim > 0)
);
