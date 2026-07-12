import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { env } from '../../config/env.js';
import type {
  AssistantVoiceModelMode,
  CodexModelOption,
  CodexReasoningEffort,
  CodexReasoningOption,
  CodexSettings
} from '../../types.js';
import { CodexSettingsRepository } from './codex-settings.repository.js';

const codexConfigPath = path.join(os.homedir(), '.codex', 'config.toml');
const codexModelsCachePath = path.join(os.homedir(), '.codex', 'models_cache.json');

type GlobalCodexSettings = CodexSettings;

interface CodexModelsCacheEntry {
  slug?: string;
  display_name?: string;
  description?: string;
  default_reasoning_level?: string | null;
  supported_reasoning_levels?: Array<{
    effort?: string;
    description?: string;
  }>;
  visibility?: string | null;
  priority?: number;
}

interface CodexModelsCacheFile {
  models?: CodexModelsCacheEntry[];
}

export interface CodexSettingsPayload {
  settings: CodexSettings;
  source: 'app' | 'environment' | 'global' | 'default';
  options: {
    models: CodexModelOption[];
  };
}

export class CodexSettingsService {
  constructor(
    private readonly repository: CodexSettingsRepository = new CodexSettingsRepository()
  ) {}

  async getSettings(): Promise<CodexSettingsPayload> {
    const appSettings = await this.repository.get();
    const globalSettings = await readGlobalCodexSettings();
    const availableModels = await readAvailableCodexModels();
    return buildPayload(appSettings, globalSettings, availableModels);
  }

  async updateSettings(input: Partial<CodexSettings>): Promise<CodexSettingsPayload> {
    const current = await this.getSettings();
    const nextSettings = sanitizeCodexSettings({
      ...current.settings,
      ...input
    });
    const normalized = normalizeCodexSettings(nextSettings, current.options.models);

    await this.repository.save(normalized);

    return {
      settings: normalized,
      source: 'app',
      options: current.options
    };
  }

  async getExecutionOverrides(context?: {
    surface?: 'voice' | 'text';
    intent?: 'discussion' | 'write';
  }): Promise<CodexSettings> {
    const payload = await this.getSettings();
    return resolveExecutionOverrides(payload, context);
  }
}

function buildPayload(
  appSettings: Partial<CodexSettings> | null,
  globalSettings: GlobalCodexSettings | null,
  availableModels: CodexModelOption[]
): CodexSettingsPayload {
  const envSettings = sanitizeCodexSettings({
    model: env.codexModel || null,
    reasoningEffort: normalizeReasoningEffort(env.codexReasoningEffort),
    voiceModelMode: 'auto'
  });
  const resolved = normalizeCodexSettings(
    {
      model:
        sanitizeOptionalString(appSettings?.model) ??
        sanitizeOptionalString(envSettings.model) ??
        sanitizeOptionalString(globalSettings?.model) ??
        availableModels[0]?.slug ??
        null,
      reasoningEffort:
        normalizeReasoningEffort(appSettings?.reasoningEffort) ??
        normalizeReasoningEffort(envSettings.reasoningEffort) ??
        normalizeReasoningEffort(globalSettings?.reasoningEffort) ??
        null,
      voiceModelMode:
        sanitizeVoiceModelMode(appSettings?.voiceModelMode) ?? envSettings.voiceModelMode
    },
    availableModels
  );

  const source =
    appSettings?.model || appSettings?.reasoningEffort || appSettings?.voiceModelMode
      ? 'app'
      : envSettings.model || envSettings.reasoningEffort || envSettings.voiceModelMode !== 'auto'
        ? 'environment'
        : globalSettings?.model || globalSettings?.reasoningEffort
          ? 'global'
          : 'default';

  return {
    settings: resolved,
    source,
    options: {
      models: availableModels
    }
  };
}

function sanitizeCodexSettings(settings: Partial<CodexSettings>): CodexSettings {
  return {
    model: sanitizeOptionalString(settings.model),
    reasoningEffort: normalizeReasoningEffort(settings.reasoningEffort),
    voiceModelMode: sanitizeVoiceModelMode(settings.voiceModelMode) ?? 'auto'
  };
}

function normalizeCodexSettings(
  settings: CodexSettings,
  availableModels: CodexModelOption[]
): CodexSettings {
  const selectedModel = settings.model
    ? (availableModels.find((entry) => entry.slug === settings.model) ?? null)
    : null;
  const defaultReasoning = selectedModel?.defaultReasoningEffort ?? null;
  const supportedReasoning = new Set(
    selectedModel?.supportedReasoningEfforts.map((entry) => entry.effort) ?? []
  );
  const reasoningEffort =
    settings.reasoningEffort &&
    (supportedReasoning.size === 0 || supportedReasoning.has(settings.reasoningEffort))
      ? settings.reasoningEffort
      : defaultReasoning;

  return {
    // Persist only a validated, canonical slug — this value is passed to `codex -c model=<value>`,
    // so an arbitrary string must never survive. When the model list is known and the requested
    // model isn't in it, drop to null (Codex's own default). If the list is unavailable (CLI not
    // installed → Codex won't run anyway) we can't validate, so keep the raw value.
    model: availableModels.length > 0 ? (selectedModel?.slug ?? null) : settings.model,
    reasoningEffort,
    voiceModelMode: settings.voiceModelMode
  };
}

function resolveExecutionOverrides(
  payload: CodexSettingsPayload,
  context?: { surface?: 'voice' | 'text'; intent?: 'discussion' | 'write' }
): CodexSettings {
  const settings = payload.settings;
  const mode = settings.voiceModelMode;

  // 'inherit' = always use exactly the picked model (manual control / escape hatch).
  if (mode === 'inherit') {
    return settings;
  }

  // Auto-upgrade for edits: file-editing turns deserve the strongest model + high reasoning.
  if (context?.intent === 'write' && mode === 'auto') {
    return normalizeCodexSettings(
      {
        ...settings,
        model: selectStrongestCodexModel(payload.options.models) ?? settings.model,
        reasoningEffort: 'high'
      },
      payload.options.models
    );
  }

  // Voice reads (and explicit 'fast' mode) downgrade to a faster model to save tokens. Text reads in
  // 'auto' keep the user's picked model so the Topbar picker stays meaningful.
  if (mode === 'fast' || context?.surface === 'voice') {
    return normalizeCodexSettings(
      {
        ...settings,
        model: selectFasterCodexModel(payload.options.models, settings.model) ?? settings.model,
        reasoningEffort: selectVoiceReasoningEffort(settings.reasoningEffort)
      },
      payload.options.models
    );
  }

  return settings;
}

/** The most capable model (the models cache is priority-sorted), skipping fast/mini variants. */
function selectStrongestCodexModel(options: CodexModelOption[]) {
  const strong = options.find((option) => !isFastCodexModel(option));
  return (strong ?? options[0])?.slug ?? null;
}

function selectFasterCodexModel(options: CodexModelOption[], currentModel: string | null) {
  const current = currentModel
    ? (options.find((option) => option.slug === currentModel) ?? null)
    : null;
  if (current && isFastCodexModel(current)) {
    return current.slug;
  }

  return options.find((option) => isFastCodexModel(option))?.slug ?? null;
}

function isFastCodexModel(option: CodexModelOption) {
  const haystack = `${option.slug} ${option.displayName}`.toLowerCase();
  return /\b(mini|nano|small|flash|fast|lite)\b/.test(haystack);
}

function selectVoiceReasoningEffort(current: CodexReasoningEffort | null) {
  if (!current) {
    return 'low' as const;
  }

  if (current === 'minimal' || current === 'low') {
    return current;
  }

  return 'low' as const;
}

async function readGlobalCodexSettings(): Promise<GlobalCodexSettings | null> {
  try {
    const raw = await fs.readFile(codexConfigPath, 'utf8');
    return sanitizeCodexSettings({
      model: matchTomlString(raw, 'model'),
      reasoningEffort: normalizeReasoningEffort(matchTomlString(raw, 'model_reasoning_effort'))
    });
  } catch (error) {
    if (isFileMissing(error)) {
      return null;
    }

    throw error;
  }
}

async function readAvailableCodexModels(): Promise<CodexModelOption[]> {
  try {
    const raw = await fs.readFile(codexModelsCachePath, 'utf8');
    const body = JSON.parse(raw) as CodexModelsCacheFile;
    const models = Array.isArray(body.models) ? body.models : [];

    return (
      models
        .filter((entry) => entry.slug && entry.display_name && entry.visibility !== 'hidden')
        // Match the Codex CLI `/model` ordering: most-capable/featured first (higher priority),
        // then alphabetical as a stable tiebreak.
        .sort(
          (left, right) =>
            (right.priority ?? 0) - (left.priority ?? 0) ||
            (left.display_name ?? '').localeCompare(right.display_name ?? '')
        )
        .map((entry) => ({
          slug: entry.slug ?? '',
          displayName: entry.display_name ?? entry.slug ?? '',
          description: entry.description?.trim() || 'Available in the current Codex installation.',
          defaultReasoningEffort: normalizeReasoningEffort(entry.default_reasoning_level),
          supportedReasoningEfforts: (entry.supported_reasoning_levels ?? [])
            .map((option) => mapReasoningOption(option))
            .filter((option): option is CodexReasoningOption => Boolean(option))
        }))
    );
  } catch (error) {
    if (isFileMissing(error)) {
      return [];
    }

    throw error;
  }
}

function mapReasoningOption(entry: { effort?: string; description?: string } | undefined) {
  const effort = normalizeReasoningEffort(entry?.effort);
  if (!effort) {
    return null;
  }

  return {
    effort,
    description: entry?.description?.trim() || describeReasoningEffort(effort)
  };
}

function describeReasoningEffort(effort: CodexReasoningEffort) {
  if (effort === 'low') {
    return 'Fast responses with lighter reasoning';
  }
  if (effort === 'medium') {
    return 'Balanced speed and reasoning depth';
  }
  if (effort === 'high') {
    return 'Greater reasoning depth for complex work';
  }

  return 'Extra high reasoning depth for the toughest problems';
}

function matchTomlString(raw: string, key: string) {
  const pattern = new RegExp(`^${key}\\s*=\\s*"([^"]+)"`, 'm');
  return pattern.exec(raw)?.[1]?.trim() || null;
}

function sanitizeOptionalString(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

function sanitizeVoiceModelMode(value: unknown): AssistantVoiceModelMode | null {
  if (value === 'auto' || value === 'fast' || value === 'inherit') {
    return value;
  }

  return null;
}

function normalizeReasoningEffort(value: unknown): CodexReasoningEffort | null {
  if (typeof value !== 'string') {
    return null;
  }

  if (
    value === 'minimal' ||
    value === 'low' ||
    value === 'medium' ||
    value === 'high' ||
    value === 'xhigh'
  ) {
    return value;
  }

  return null;
}

function isFileMissing(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT');
}
