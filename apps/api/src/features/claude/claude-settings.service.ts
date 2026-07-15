import type {
  AssistantVoiceModelMode,
  ClaudeModelOption,
  ClaudeReasoningEffort,
  ClaudeReasoningOption,
  ClaudeSettings
} from '../../types.js';
import { ClaudeSettingsRepository } from './claude-settings.repository.js';
import {
  loadClaudeCatalogFromDisk,
  refreshClaudeCatalog
} from '../providers/provider-cli-source.service.js';

export interface ClaudeSettingsPayload {
  settings: ClaudeSettings;
  source: 'app' | 'default';
  options: {
    models: ClaudeModelOption[];
    reasoningEfforts: ClaudeReasoningOption[];
  };
}

// Claude's `/effort` levels (provider-wide, not per-model). Applied by injecting `/effort <level>`
// into the prompt at spawn time (see claude-client).
const claudeReasoningEfforts: ClaudeReasoningOption[] = [
  { effort: 'low', description: 'Fastest — minimal reasoning for quick, simple turns.' },
  { effort: 'medium', description: 'Balanced reasoning for everyday coding.' },
  { effort: 'high', description: 'Deep reasoning for hard problems and tricky refactors.' },
  { effort: 'xhigh', description: 'Extra-deep reasoning for the most complex work.' }
] as const;

// BOOTSTRAP ONLY. The authoritative model list is scraped live from `claude --ax-screen-reader
// /model` (see provider-cli-source.service) and cached to disk. This list is used only until that
// first scrape lands (or if scraping ever fails), so the picker is never empty. Order/labels mirror
// the CLI's `/model` so even the bootstrap matches the terminal.
const bootstrapClaudeModels: ClaudeModelOption[] = [
  {
    slug: 'default',
    displayName: 'Default',
    description: 'Sonnet 5 · Efficient for routine tasks. The model Claude Code recommends.',
    suggestedForDiscussion: true
  },
  {
    slug: 'sonnet',
    displayName: 'Sonnet',
    description: 'Sonnet 5 · Efficient for routine tasks.',
    suggestedForDiscussion: false
  },
  {
    slug: 'claude-fable-5',
    displayName: 'Fable 5',
    description: 'Fable 5 · Most capable — for your hardest and longest-running tasks.',
    suggestedForDiscussion: false
  },
  {
    slug: 'opus',
    displayName: 'Opus',
    description: 'Opus 4.8 with 1M context · Best for everyday, complex tasks.',
    suggestedForDiscussion: false
  },
  {
    slug: 'haiku',
    displayName: 'Haiku',
    description: 'Haiku 4.5 · Fastest for quick answers.',
    suggestedForDiscussion: false
  }
] as const;

export class ClaudeSettingsService {
  constructor(
    private readonly repository: ClaudeSettingsRepository = new ClaudeSettingsRepository()
  ) {}

  async getSettings(): Promise<ClaudeSettingsPayload> {
    const appSettings = await this.repository.get();
    const models = await resolveClaudeModels();
    const settings = sanitizeClaudeSettings(appSettings, models);
    return {
      settings,
      source:
        appSettings?.model || appSettings?.reasoningEffort || appSettings?.voiceModelMode
          ? 'app'
          : 'default',
      options: {
        models: [...models],
        reasoningEfforts: [...claudeReasoningEfforts]
      }
    };
  }

  async updateSettings(input: Partial<ClaudeSettings>): Promise<ClaudeSettingsPayload> {
    const current = await this.getSettings();
    const nextSettings = sanitizeClaudeSettings(
      { ...current.settings, ...input },
      current.options.models
    );
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

/**
 * The live model list, scraped from `claude /model` and cached (in-memory + disk). Falls back to the
 * bootstrap list only until the first scrape lands or if scraping fails, so the picker is never
 * empty. A background scrape is kicked once when no cache exists yet, so it becomes live shortly.
 */
async function resolveClaudeModels(): Promise<ClaudeModelOption[]> {
  const catalog = await loadClaudeCatalogFromDisk();
  if (catalog?.models?.length) {
    return catalog.models;
  }
  kickBackgroundClaudeScrape();
  return bootstrapClaudeModels;
}

let backgroundScrapeStarted = false;
function kickBackgroundClaudeScrape() {
  if (backgroundScrapeStarted) return;
  backgroundScrapeStarted = true;
  void refreshClaudeCatalog().catch(() => undefined);
}

function sanitizeClaudeSettings(
  input: Partial<ClaudeSettings> | null | undefined,
  models: ClaudeModelOption[] = bootstrapClaudeModels
): ClaudeSettings {
  const requested = typeof input?.model === 'string' ? input.model.trim() : '';
  // Only persist a model that's in the live list — the slug is passed to `claude --model`, so an
  // arbitrary string must never reach the CLI. Unknown/empty falls back to the provider default (null).
  const model = models.some((option) => option.slug === requested) ? requested : null;
  return {
    model,
    reasoningEffort: sanitizeReasoningEffort(input?.reasoningEffort),
    // Default 'inherit' so the picked model + effort run as-is on the next turn (see codex service).
    voiceModelMode: sanitizeVoiceModelMode(input?.voiceModelMode) ?? 'inherit'
  };
}

function sanitizeReasoningEffort(value: unknown): ClaudeReasoningEffort | null {
  // Only known levels reach the injected `/effort <level>` command.
  return claudeReasoningEfforts.some((option) => option.effort === value)
    ? (value as ClaudeReasoningEffort)
    : null;
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
