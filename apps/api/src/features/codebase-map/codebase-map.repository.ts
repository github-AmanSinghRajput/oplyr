import { getDatabase, isDatabaseConfigured } from '../../db/client.js';
import type { CodebaseMap } from './codebase-map.types.js';

export class CodebaseMapRepository {
  /** Persist (or replace) the cached map for a workspace root. */
  saveMap(rootPath: string, map: CodebaseMap): void {
    if (!isDatabaseConfigured()) {
      return;
    }
    const database = getDatabase();
    database
      .prepare(
        `
        INSERT INTO codebase_maps (root_path, map_json, scanned_at)
        VALUES (?, ?, ?)
        ON CONFLICT(root_path) DO UPDATE SET
          map_json = excluded.map_json,
          scanned_at = excluded.scanned_at
      `
      )
      .run(rootPath, JSON.stringify(map), map.scannedAt);
  }

  /** Read the cached map for a workspace root, or null if none / unreadable. */
  getMap(rootPath: string): CodebaseMap | null {
    if (!isDatabaseConfigured()) {
      return null;
    }
    const database = getDatabase();
    const row = database
      .prepare('SELECT map_json FROM codebase_maps WHERE root_path = ? LIMIT 1')
      .get(rootPath) as { map_json: string } | undefined;
    if (!row?.map_json) {
      return null;
    }
    try {
      return JSON.parse(row.map_json) as CodebaseMap;
    } catch {
      return null;
    }
  }

  getSummary(rootPath: string, filePath: string): string | null {
    if (!isDatabaseConfigured()) {
      return null;
    }
    const database = getDatabase();
    const row = database
      .prepare(
        'SELECT summary FROM codebase_file_summaries WHERE root_path = ? AND file_path = ? LIMIT 1'
      )
      .get(rootPath, filePath) as { summary: string } | undefined;
    return row?.summary ?? null;
  }

  saveSummary(rootPath: string, filePath: string, summary: string): void {
    if (!isDatabaseConfigured()) {
      return;
    }
    const database = getDatabase();
    database
      .prepare(
        `
        INSERT INTO codebase_file_summaries (root_path, file_path, summary, updated_at)
        VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        ON CONFLICT(root_path, file_path) DO UPDATE SET
          summary = excluded.summary,
          updated_at = excluded.updated_at
      `
      )
      .run(rootPath, filePath, summary);
  }
}
