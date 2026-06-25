import type { AssistantVoiceModelMode, ClaudeModelOption, ClaudeSettings } from '../../types.js';
import { ClaudeSettingsRepository } from './claude-settings.repository.js';

export interface ClaudeSettingsPayload {
  settings: ClaudeSettings;
  source: 'app' | 'default';
  options: {
    models: ClaudeModelOption[];
  };
}

const knownClaudeModels: ClaudeModelOption[] = [
  {
    slug: 'default',
    displayName: 'Default',
    description: 'Uses the model Claude Code recommends for this account.',
    suggestedForDiscussion: false
  },
  {
    slug: 'haiku',
    displayName: 'Haiku',
    description: 'Fast and lower-cost for lightweight discussion, planning, and quick questions.',
    suggestedForDiscussion: true
  },
  {
    slug: 'sonnet',
    displayName: 'Sonnet',
    description: 'Best daily coding balance for edits, review, and general development work.',
    suggestedForDiscussion: false
  },
  {
    slug: 'sonnet[1m]',
    displayName: 'Sonnet 1M',
    description: 'Best for long sessions and large-context codebases.',
    suggestedForDiscussion: false
  },
  {
    slug: 'opus',
    displayName: 'Opus',
    description: 'Highest reasoning depth for harder technical problems and tricky refactors.',
    suggestedForDiscussion: false
  }
] as const;

export class ClaudeSettingsService {
  constructor(
    private readonly repository: ClaudeSettingsRepository = new ClaudeSettingsRepository()
  ) {}

  async getSettings(): Promise<ClaudeSettingsPayload> {
    const appSettings = await this.repository.get();
    const settings = sanitizeClaudeSettings(appSettings);
    return {
      settings,
      source: appSettings?.model || appSettings?.voiceModelMode ? 'app' : 'default',
      options: {
        models: [...knownClaudeModels]
      }
    };
  }

  async updateSettings(input: Partial<ClaudeSettings>): Promise<ClaudeSettingsPayload> {
    const current = await this.getSettings();
    const nextSettings = sanitizeClaudeSettings({
      ...current.settings,
      ...input
    });
    await this.repository.save(nextSettings);

    return {
      settings: nextSettings,
      source: 'app',
      options: current.options
    };
  }

  async getExecutionOverrides(context?: {
    surface?: 'voice' | 'text';
    intent?: 'discussion' | 'write';
  }): Promise<ClaudeSettings> {
    const payload = await this.getSettings();
    return resolveExecutionOverrides(payload, context);
  }
}

function sanitizeClaudeSettings(input: Partial<ClaudeSettings> | null | undefined): ClaudeSettings {
  const model = typeof input?.model === 'string' ? input.model.trim() : '';
  return {
    model: model || null,
    voiceModelMode: sanitizeVoiceModelMode(input?.voiceModelMode) ?? 'auto'
  };
}

function resolveExecutionOverrides(
  payload: ClaudeSettingsPayload,
  context?: { surface?: 'voice' | 'text'; intent?: 'discussion' | 'write' }
): ClaudeSettings {
  const settings = payload.settings;
  if (context?.surface !== 'voice') {
    return settings;
  }

  if (settings.voiceModelMode === 'inherit') {
    return settings;
  }

  if (context.intent === 'write' && settings.voiceModelMode === 'auto') {
    return settings;
  }

  return {
    ...settings,
    model: payload.options.models.find((option) => option.slug === 'haiku')?.slug ?? settings.model
  };
}

function sanitizeVoiceModelMode(value: unknown): AssistantVoiceModelMode | null {
  if (value === 'auto' || value === 'fast' || value === 'inherit') {
    return value;
  }

  return null;
}
