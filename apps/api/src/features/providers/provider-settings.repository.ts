import { getDatabase, isDatabaseConfigured } from '../../db/client.js';
import type { AssistantProviderId } from '../../types.js';

export interface ProviderConnectionRecord {
  connected: boolean;
  connectedAt: string | null;
}

export interface ProviderConnectionState {
  activeProviderId: AssistantProviderId | null;
  connections: Record<AssistantProviderId, ProviderConnectionRecord>;
}

const preferenceKey = 'assistant.providers';
let inMemoryFallback: ProviderConnectionState = getDefaultState();
const providerIds: AssistantProviderId[] = ['codex', 'claude', 'gemini'];

export class ProviderSettingsRepository {
  async get(): Promise<ProviderConnectionState> {
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

    return normalizeState(parsePreference(result?.value ?? null));
  }

  async save(state: ProviderConnectionState) {
    if (!isDatabaseConfigured()) {
      inMemoryFallback = normalizeState(state);
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
      .run(preferenceKey, JSON.stringify(normalizeState(state)));
  }
}

function getDefaultState(): ProviderConnectionState {
  return {
    activeProviderId: null,
    connections: {
      codex: {
        connected: false,
        connectedAt: null
      },
      claude: {
        connected: false,
        connectedAt: null
      },
      gemini: {
        connected: false,
        connectedAt: null
      }
    }
  };
}

function normalizeProviderId(value: unknown): AssistantProviderId | null {
  return value === 'codex' || value === 'claude' || value === 'gemini' ? value : null;
}

function normalizeConnectionRecord(value: unknown): ProviderConnectionRecord {
  return {
    connected: Boolean(
      value && typeof value === 'object' && 'connected' in value && value.connected === true
    ),
    connectedAt:
      value &&
      typeof value === 'object' &&
      'connectedAt' in value &&
      typeof value.connectedAt === 'string'
        ? value.connectedAt
        : null
  };
}

function normalizeState(value: unknown): ProviderConnectionState {
  const defaultState = getDefaultState();

  if (!value || typeof value !== 'object') {
    return defaultState;
  }

  const legacyActiveProvider =
    'activeProvider' in value ? normalizeProviderId(value.activeProvider) : null;
  const activeProviderId =
    ('activeProviderId' in value ? normalizeProviderId(value.activeProviderId) : null) ??
    legacyActiveProvider;
  const connectionsValue =
    'connections' in value && value.connections && typeof value.connections === 'object'
      ? value.connections
      : {};

  const normalized: ProviderConnectionState = {
    activeProviderId,
    connections: {
      codex: normalizeConnectionRecord((connectionsValue as Record<string, unknown>).codex),
      claude: normalizeConnectionRecord((connectionsValue as Record<string, unknown>).claude),
      gemini: normalizeConnectionRecord((connectionsValue as Record<string, unknown>).gemini)
    }
  };

  // Multiple providers may be connected at once; only `activeProviderId` is single.
  if (legacyActiveProvider && !normalized.connections[legacyActiveProvider].connected) {
    normalized.connections[legacyActiveProvider] = {
      connected: true,
      connectedAt: null
    };
  }

  if (
    normalized.activeProviderId &&
    !normalized.connections[normalized.activeProviderId].connected
  ) {
    normalized.activeProviderId = null;
  }

  if (!normalized.activeProviderId) {
    const connectedProviderId = providerIds.find(
      (providerId) => normalized.connections[providerId].connected
    );
    if (connectedProviderId) {
      normalized.activeProviderId = connectedProviderId;
    }
  }

  return normalized;
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
