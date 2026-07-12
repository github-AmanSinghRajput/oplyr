import { getBrainDatabase, isBrainDatabaseConfigured } from '../../db/brain-client.js';
import type { AssistantProviderId } from '../../types.js';
import type { BrainMode, BrainProjectSettings, BrainSettings } from './brain.types.js';

const SETTINGS_KEY = 'brain.settings';
const PROJECTS_KEY = 'brain.projects';
const providerIds: AssistantProviderId[] = ['codex', 'claude', 'gemini'];

export const DEFAULT_PROJECT_SETTINGS: BrainProjectSettings = {
  isolate: false,
  captureEnabled: true
};

// When there's no DB (e.g. unit tests), settings live in-memory so the brain still behaves.
let inMemorySettings: BrainSettings = getDefaultBrainSettings();
let inMemoryProjects: Record<string, BrainProjectSettings> = {};

export class BrainSettingsRepository {
  async get(): Promise<BrainSettings> {
    if (!isBrainDatabaseConfigured()) {
      return inMemorySettings;
    }
    return normalizeBrainSettings(parseJson(this.readPreference(SETTINGS_KEY)));
  }

  async save(settings: BrainSettings) {
    const normalized = normalizeBrainSettings(settings);
    if (!isBrainDatabaseConfigured()) {
      inMemorySettings = normalized;
      return;
    }
    this.writePreference(SETTINGS_KEY, JSON.stringify(normalized));
  }

  async getAllProjectSettings(): Promise<Record<string, BrainProjectSettings>> {
    if (!isBrainDatabaseConfigured()) {
      return inMemoryProjects;
    }
    return normalizeProjectMap(parseJson(this.readPreference(PROJECTS_KEY)));
  }

  async saveProjectSettings(projectKey: string, settings: BrainProjectSettings) {
    const map = await this.getAllProjectSettings();
    map[projectKey] = normalizeProjectSettings(settings);
    if (!isBrainDatabaseConfigured()) {
      inMemoryProjects = map;
      return;
    }
    this.writePreference(PROJECTS_KEY, JSON.stringify(map));
  }

  private readPreference(key: string): string | null {
    const row = getBrainDatabase()
      .prepare('SELECT value FROM brain_preferences WHERE preference_key = ?')
      .get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  private writePreference(key: string, value: string) {
    getBrainDatabase()
      .prepare(
        `
        INSERT INTO brain_preferences (preference_key, value, updated_at)
        VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        ON CONFLICT (preference_key) DO UPDATE SET
          value = excluded.value,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      `
      )
      .run(key, value);
  }
}

export function getDefaultBrainSettings(): BrainSettings {
  return {
    mode: 'standard',
    enabled: true,
    recallEnabled: true,
    captureEnabled: true,
    crossProjectEnabled: true,
    rawArchiveEnabled: false,
    allowSensitiveCapture: false,
    allowSensitiveInjection: false,
    maxRecallAtoms: 8,
    maxRecallCharacters: 1800,
    maxGraphHops: 1,
    agentWritePermissions: {
      codex: { writeEnabled: true, updatedAt: null },
      claude: { writeEnabled: true, updatedAt: null },
      gemini: { writeEnabled: true, updatedAt: null }
    }
  };
}

// ── normalization ─────────────────────────────────────────────────────────────────────────────

function normalizeBrainSettings(value: unknown): BrainSettings {
  const defaults = getDefaultBrainSettings();
  if (!value || typeof value !== 'object') {
    return defaults;
  }
  const record = value as Record<string, unknown>;
  const mode = normalizeBrainMode(record.mode);
  const isGod = mode === 'local_god';

  return {
    mode,
    enabled: normalizeBoolean(record.enabled, defaults.enabled),
    recallEnabled: normalizeBoolean(record.recallEnabled, defaults.recallEnabled),
    captureEnabled: normalizeBoolean(record.captureEnabled, defaults.captureEnabled),
    crossProjectEnabled: normalizeBoolean(record.crossProjectEnabled, defaults.crossProjectEnabled),
    rawArchiveEnabled: normalizeBoolean(record.rawArchiveEnabled, defaults.rawArchiveEnabled),
    // Sensitive capture/injection can only be on when the power-user mode is explicitly unlocked.
    allowSensitiveCapture: isGod
      ? normalizeBoolean(record.allowSensitiveCapture, defaults.allowSensitiveCapture)
      : false,
    allowSensitiveInjection: isGod
      ? normalizeBoolean(record.allowSensitiveInjection, defaults.allowSensitiveInjection)
      : false,
    maxRecallAtoms: normalizeBoundedInteger(record.maxRecallAtoms, defaults.maxRecallAtoms, 1, 20),
    maxRecallCharacters: normalizeBoundedInteger(
      record.maxRecallCharacters,
      defaults.maxRecallCharacters,
      400,
      6000
    ),
    maxGraphHops: normalizeBoundedInteger(record.maxGraphHops, defaults.maxGraphHops, 0, 3),
    agentWritePermissions: normalizeAgentWritePermissions(record.agentWritePermissions)
  };
}

/** Old modes (safe/connected/deep) collapse into `standard`; only `local_god` is preserved. */
function normalizeBrainMode(value: unknown): BrainMode {
  return value === 'local_god' ? 'local_god' : 'standard';
}

function normalizeBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeBoundedInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function normalizeAgentWritePermissions(value: unknown) {
  const defaults = getDefaultBrainSettings().agentWritePermissions;
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return providerIds.reduce<BrainSettings['agentWritePermissions']>(
    (acc, providerId) => {
      const raw = record[providerId];
      const permission = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
      acc[providerId] = {
        writeEnabled: normalizeBoolean(permission.writeEnabled, defaults[providerId].writeEnabled),
        updatedAt: typeof permission.updatedAt === 'string' ? permission.updatedAt : null
      };
      return acc;
    },
    {} as BrainSettings['agentWritePermissions']
  );
}

function normalizeProjectSettings(value: unknown): BrainProjectSettings {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    isolate: normalizeBoolean(record.isolate, DEFAULT_PROJECT_SETTINGS.isolate),
    captureEnabled: normalizeBoolean(record.captureEnabled, DEFAULT_PROJECT_SETTINGS.captureEnabled)
  };
}

function normalizeProjectMap(value: unknown): Record<string, BrainProjectSettings> {
  if (!value || typeof value !== 'object') {
    return {};
  }
  const out: Record<string, BrainProjectSettings> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    out[key] = normalizeProjectSettings(entry);
  }
  return out;
}

function parseJson(value: string | null): unknown {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
