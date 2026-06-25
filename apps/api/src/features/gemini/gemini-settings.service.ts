import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AssistantVoiceModelMode, GeminiModelOption, GeminiSettings } from '../../types.js';
import { GeminiSettingsRepository } from './gemini-settings.repository.js';

const geminiConfigPath = path.join(os.homedir(), '.gemini', 'settings.json');

export interface GeminiSettingsPayload {
  settings: GeminiSettings;
  source: 'app' | 'global' | 'default';
  options: {
    models: GeminiModelOption[];
  };
}

const knownGeminiModels: GeminiModelOption[] = [
  {
    slug: 'auto',
    displayName: 'Auto',
    description: 'Lets Gemini CLI choose the best model for the current request.',
    suggestedForDiscussion: false
  },
  {
    slug: 'gemini-2.5-pro',
    displayName: 'Gemini 2.5 Pro',
    description: 'Best for deeper reasoning, larger refactors, and harder engineering work.',
    suggestedForDiscussion: false
  },
  {
    slug: 'gemini-2.5-flash',
    displayName: 'Gemini 2.5 Flash',
    description: 'Faster for interactive discussion, voice turns, and short implementation loops.',
    suggestedForDiscussion: true
  },
  {
    slug: 'gemini-2.5-flash-lite',
    displayName: 'Gemini 2.5 Flash-Lite',
    description: 'Lightest latency and cost for quick follow-ups and lightweight turns.',
    suggestedForDiscussion: true
  }
];

export class GeminiSettingsService {
  constructor(
    private readonly repository: GeminiSettingsRepository = new GeminiSettingsRepository()
  ) {}

  async getSettings(): Promise<GeminiSettingsPayload> {
    const appSettings = await this.repository.get();
    const globalSettings = await readGlobalGeminiSettings();
    const settings = sanitizeGeminiSettings({
      model: appSettings?.model ?? globalSettings?.model ?? null,
      voiceModelMode: appSettings?.voiceModelMode ?? globalSettings?.voiceModelMode ?? 'auto'
    });

    return {
      settings,
      source:
        appSettings?.model || appSettings?.voiceModelMode
          ? 'app'
          : globalSettings?.model
            ? 'global'
            : 'default',
      options: {
        models: [...knownGeminiModels]
      }
    };
  }

  async updateSettings(input: Partial<GeminiSettings>): Promise<GeminiSettingsPayload> {
    const current = await this.getSettings();
    const nextSettings = sanitizeGeminiSettings({
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
  }): Promise<GeminiSettings> {
    const payload = await this.getSettings();
    return resolveExecutionOverrides(payload, context);
  }
}

function sanitizeGeminiSettings(input: Partial<GeminiSettings> | null | undefined): GeminiSettings {
  const model = typeof input?.model === 'string' ? input.model.trim() : '';
  return {
    model: model || null,
    voiceModelMode: sanitizeVoiceModelMode(input?.voiceModelMode) ?? 'auto'
  };
}

function resolveExecutionOverrides(
  payload: GeminiSettingsPayload,
  context?: { surface?: 'voice' | 'text'; intent?: 'discussion' | 'write' }
): GeminiSettings {
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
    model:
      payload.options.models.find((option) => option.slug === 'gemini-2.5-flash')?.slug ??
      settings.model
  };
}

async function readGlobalGeminiSettings(): Promise<Partial<GeminiSettings> | null> {
  try {
    const raw = await fs.readFile(geminiConfigPath, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return sanitizeGeminiSettings({
      model: typeof parsed.model === 'string' ? parsed.model : null,
      voiceModelMode:
        typeof parsed.voiceModelMode === 'string'
          ? (parsed.voiceModelMode as AssistantVoiceModelMode)
          : undefined
    });
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === 'ENOENT'
    ) {
      return null;
    }

    return null;
  }
}

function sanitizeVoiceModelMode(value: unknown): AssistantVoiceModelMode | null {
  if (value === 'auto' || value === 'fast' || value === 'inherit') {
    return value;
  }

  return null;
}
