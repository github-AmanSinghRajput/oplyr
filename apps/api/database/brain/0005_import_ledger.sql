-- Import ledger: one row per source file (curated CLAUDE.md/AGENTS.md/GEMINI.md or a session
-- transcript) that has been brought into the brain. It lets a scan tell `new` / `added` / `changed`
-- apart without re-offering sources already imported. `content_hash` is sha256 of the durable content
-- the distiller actually consumed (whole file for curated docs, the read tail for sessions), so an
-- appended session or an edited doc surfaces as `changed`. Keyed by absolute path.
CREATE TABLE IF NOT EXISTS brain_import_sources (
  path          TEXT PRIMARY KEY,
  provider_id   TEXT NOT NULL,
  kind          TEXT NOT NULL,            -- 'global' | 'project' | 'session'
  project_key   TEXT,
  content_hash  TEXT NOT NULL,
  atoms_added   INTEGER NOT NULL DEFAULT 0,
  imported_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_brain_import_sources_provider ON brain_import_sources(provider_id);
