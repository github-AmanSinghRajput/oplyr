import { getDatabase, isDatabaseConfigured } from '../../db/client.js';
import type { AppSettings, AppTheme } from '../../types.js';

const preferenceKey = 'app.settings';
let inMemoryFallback: AppSettings = getDefaultSettings();

export class AppSettingsRepository {
  async get(): Promise<AppSettings> {
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

    return normalizeAppSettings(parsePreference(result?.value ?? null));
  }

  async save(settings: AppSettings) {
    const normalized = normalizeAppSettings(settings);
    if (!isDatabaseConfigured()) {
      inMemoryFallback = normalized;
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
      .run(preferenceKey, JSON.stringify(normalized));
  }
}

function getDefaultSettings(): AppSettings {
  return {
    displayName: null,
    theme: 'dark',
    welcomedAt: null
  };
}

function normalizeTheme(value: unknown): AppTheme {
  return value === 'light' ? 'light' : 'dark';
}

function normalizeDisplayName(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 48) : null;
}

function normalizeAppSettings(value: unknown): AppSettings {
  if (!value || typeof value !== 'object') {
    return getDefaultSettings();
  }

  const record = value as Record<string, unknown>;
  return {
    displayName: normalizeDisplayName(record.displayName),
    theme: normalizeTheme(record.theme),
    welcomedAt: typeof record.welcomedAt === 'string' ? record.welcomedAt : null
  };
}

function parsePreference(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}
