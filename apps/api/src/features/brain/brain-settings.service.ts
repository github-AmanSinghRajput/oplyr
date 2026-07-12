import type { AssistantProviderId } from '../../types.js';
import { BrainSettingsRepository, DEFAULT_PROJECT_SETTINGS } from './brain-settings.repository.js';
import type { BrainMode, BrainProjectSettings, BrainSettings } from './brain.types.js';

export type BrainSettingsUpdate = Partial<
  Pick<
    BrainSettings,
    | 'enabled'
    | 'recallEnabled'
    | 'captureEnabled'
    | 'crossProjectEnabled'
    | 'rawArchiveEnabled'
    | 'maxRecallAtoms'
    | 'maxRecallCharacters'
    | 'maxGraphHops'
  >
> & {
  mode?: BrainMode;
  allowSensitiveCapture?: boolean;
  allowSensitiveInjection?: boolean;
  agentWritePermissions?: Partial<Record<AssistantProviderId, boolean>>;
};

export class BrainSettingsService {
  constructor(
    private readonly repository: BrainSettingsRepository = new BrainSettingsRepository()
  ) {}

  async getSettings() {
    return this.repository.get();
  }

  async updateSettings(input: BrainSettingsUpdate) {
    const current = await this.repository.get();
    const now = new Date().toISOString();
    const mode = input.mode ?? current.mode;
    const isGod = mode === 'local_god';

    const next: BrainSettings = {
      ...current,
      mode,
      enabled: input.enabled ?? current.enabled,
      recallEnabled: input.recallEnabled ?? current.recallEnabled,
      captureEnabled: input.captureEnabled ?? current.captureEnabled,
      crossProjectEnabled: input.crossProjectEnabled ?? current.crossProjectEnabled,
      rawArchiveEnabled: input.rawArchiveEnabled ?? current.rawArchiveEnabled,
      // Leaving power-user mode forces sensitive handling back off.
      allowSensitiveCapture: isGod
        ? (input.allowSensitiveCapture ?? current.allowSensitiveCapture)
        : false,
      allowSensitiveInjection: isGod
        ? (input.allowSensitiveInjection ?? current.allowSensitiveInjection)
        : false,
      maxRecallAtoms:
        input.maxRecallAtoms === undefined
          ? current.maxRecallAtoms
          : clampInteger(input.maxRecallAtoms, 1, 20),
      maxRecallCharacters:
        input.maxRecallCharacters === undefined
          ? current.maxRecallCharacters
          : clampInteger(input.maxRecallCharacters, 400, 6000),
      maxGraphHops:
        input.maxGraphHops === undefined
          ? current.maxGraphHops
          : clampInteger(input.maxGraphHops, 0, 3),
      agentWritePermissions: { ...current.agentWritePermissions }
    };

    for (const [providerId, writeEnabled] of Object.entries(input.agentWritePermissions ?? {})) {
      if (!isAssistantProviderId(providerId) || typeof writeEnabled !== 'boolean') {
        continue;
      }
      next.agentWritePermissions[providerId] = { writeEnabled, updatedAt: now };
    }

    await this.repository.save(next);
    return next;
  }

  async getProjectSettings(projectKey: string | null): Promise<BrainProjectSettings> {
    if (!projectKey) {
      return DEFAULT_PROJECT_SETTINGS;
    }
    const map = await this.repository.getAllProjectSettings();
    return map[projectKey] ?? DEFAULT_PROJECT_SETTINGS;
  }

  async getIsolatedProjectKeys(): Promise<string[]> {
    const map = await this.repository.getAllProjectSettings();
    return Object.entries(map)
      .filter(([, settings]) => settings.isolate)
      .map(([key]) => key);
  }

  async updateProjectSettings(
    projectKey: string,
    input: Partial<BrainProjectSettings>
  ): Promise<BrainProjectSettings> {
    const current = await this.getProjectSettings(projectKey);
    const next: BrainProjectSettings = {
      isolate: input.isolate ?? current.isolate,
      captureEnabled: input.captureEnabled ?? current.captureEnabled
    };
    await this.repository.saveProjectSettings(projectKey, next);
    return next;
  }
}

function clampInteger(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function isAssistantProviderId(value: string): value is AssistantProviderId {
  return value === 'codex' || value === 'claude' || value === 'gemini';
}
