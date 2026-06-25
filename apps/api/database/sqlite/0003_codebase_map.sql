-- Instant codebase map: cached per workspace root so re-opening is instant; re-scan on demand.
CREATE TABLE IF NOT EXISTS codebase_maps (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  root_path TEXT NOT NULL UNIQUE,
  map_json TEXT NOT NULL,
  scanned_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- On-demand AI file summaries, cached by (workspace root, file path).
CREATE TABLE IF NOT EXISTS codebase_file_summaries (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  root_path TEXT NOT NULL,
  file_path TEXT NOT NULL,
  summary TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (root_path, file_path)
);
