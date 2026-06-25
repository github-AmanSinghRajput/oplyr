import { getDatabase, isDatabaseConfigured } from '../../db/client.js';
import type { GeminiSettings } from '../../types.js';

const preferenceKey = 'gemini.settings';
let inMemoryFallback: GeminiSettings | null = null;

export class GeminiSettingsRepository {
  async get(): Promise<Partial<GeminiSettings> | null> {
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

    return parsePreference<Partial<GeminiSettings>>(result?.value ?? null) ?? inMemoryFallback;
  }

  async save(settings: GeminiSettings) {
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
