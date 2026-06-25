import { getDatabase, isDatabaseConfigured } from '../../db/client.js';
import type { VoiceSettings } from '../../types.js';

const preferenceKey = 'voice.settings';

export class VoiceSettingsRepository {
  async get(): Promise<Partial<VoiceSettings> | null> {
    if (!isDatabaseConfigured()) {
      return null;
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

    return parsePreference<Partial<VoiceSettings>>(result?.value ?? null);
  }

  async save(settings: VoiceSettings) {
    if (!isDatabaseConfigured()) {
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
