import { getDatabase, isDatabaseConfigured } from '../../db/client.js';
import type { ClaudeSettings } from '../../types.js';

const preferenceKey = 'claude.settings';
let inMemoryFallback: ClaudeSettings | null = null;

export class ClaudeSettingsRepository {
  async get(): Promise<Partial<ClaudeSettings> | null> {
    if (!isDatabaseConfigured()) {
      return inMemoryFallback;
    }

    const database = getDatabase();
    const result = database
      .prepare(
        `
        SELECT value
        FROM app_preferences
        WHERE preference_key = ?
      `
      )
      .get(preferenceKey) as { value: string } | undefined;

    return parsePreference<Partial<ClaudeSettings>>(result?.value ?? null) ?? inMemoryFallback;
  }

  async save(settings: ClaudeSettings) {
    if (!isDatabaseConfigured()) {
      inMemoryFallback = settings;
      return;
    }

    const database = getDatabase();
    database
      .prepare(
        `
        INSERT INTO app_preferences (preference_key, value, updated_at)
        VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        ON CONFLICT (preference_key)
        DO UPDATE SET
          value = excluded.value,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      `
      )
      .run(preferenceKey, JSON.stringify(settings));
  }
}

function parsePreference<T>(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}
