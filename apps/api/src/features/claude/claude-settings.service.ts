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
  const requested = typeof input?.model === 'string' ? input.model.trim() : '';
  // Only persist a model that's in our known list — the slug is passed to `claude --model`, so an
  // arbitrary string must never reach the CLI. Unknown/empty falls back to the provider default (null).
  const model = knownClaudeModels.some((option) => option.slug === requested) ? requested : null;
  return {
    model,
    voiceModelMode: sanitizeVoiceModelMode(input?.voiceModelMode) ?? 'auto'
  };
}

function resolveExecutionOverrides(
  payload: ClaudeSettingsPayload,
  context?: { surface?: 'voice' | 'text'; intent?: 'discussion' | 'write' }
): ClaudeSettings {
  const settings = payload.settings;
  const mode = settings.voiceModelMode;
  const hasModel = (slug: string) => payload.options.models.some((option) => option.slug === slug);

  // 'inherit' = always use exactly the picked model (manual control / escape hatch).
  if (mode === 'inherit') {
    return settings;
  }

  // Auto-upgrade for edits: file-editing turns get the strongest model (Opus).
  if (context?.intent === 'write' && mode === 'auto' && hasModel('opus')) {
    return { ...settings, model: 'opus' };
  }

  // Voice reads (and explicit 'fast' mode) downgrade to Haiku to save tokens. Text reads in 'auto'
  // keep the user's picked model so the Topbar picker stays meaningful.
  if ((mode === 'fast' || context?.surface === 'voice') && hasModel('haiku')) {
    return { ...settings, model: 'haiku' };
  }

  return settings;
}

function sanitizeVoiceModelMode(value: unknown): AssistantVoiceModelMode | null {
  if (value === 'auto' || value === 'fast' || value === 'inherit') {
    return value;
  }

  return null;
}
