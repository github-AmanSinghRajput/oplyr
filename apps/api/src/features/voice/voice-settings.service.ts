import { env } from '../../config/env.js';
import type {
  AudioBridgeState,
  TranscriptionLanguageOption,
  TranscriptionModelOption,
  TranscriptionRuntimeConfig,
  VoiceNoiseMode,
  VoiceQualityProfile,
  VoiceSettings,
  VoiceSettingsCapabilities
} from '../../types.js';
import { VoiceSettingsRepository } from './voice-settings.repository.js';

const defaultVoiceSettings: VoiceSettings = {
  silenceWindowMs: 1800,
  voiceLocale: env.voiceLocale,
  autoResumeAfterReply: true,
  transcriptionLanguageCode: env.transcriptionLanguageCode,
  transcriptionModel: getInitialTranscriptionModel(),
  qualityProfile: 'demo',
  noiseMode: 'focused'
};

interface UpdateVoiceSettingsInput {
  silenceWindowMs?: number;
  voiceLocale?: string;
  autoResumeAfterReply?: boolean;
  transcriptionLanguageCode?: string;
  transcriptionModel?: VoiceSettings['transcriptionModel'];
  qualityProfile?: VoiceQualityProfile;
  noiseMode?: VoiceNoiseMode;
}

export class VoiceSettingsService {
  constructor(
    private readonly repository: VoiceSettingsRepository = new VoiceSettingsRepository()
  ) {}

  async getSettings() {
    const [persisted, transcriptionModels] = await Promise.all([
      this.repository.get(),
      getTranscriptionModelOptions()
    ]);
    const settings = mergeVoiceSettings(persisted);

    return {
      settings,
      capabilities: buildCapabilities(),
      options: {
        transcriptionModels,
        transcriptionLanguages: getTranscriptionLanguageOptions()
      }
    };
  }

  async updateSettings(input: UpdateVoiceSettingsInput) {
    const [persisted, transcriptionModels] = await Promise.all([
      this.repository.get(),
      getTranscriptionModelOptions()
    ]);
    const current = mergeVoiceSettings(persisted);
    const draft = {
      ...current,
      ...input
    };

    if (input.qualityProfile) {
      const profileDefaults = getVoiceProfileDefaults(input.qualityProfile);
      if (input.silenceWindowMs === undefined) {
        draft.silenceWindowMs = profileDefaults.silenceWindowMs;
      }
      if (input.transcriptionLanguageCode === undefined) {
        draft.transcriptionLanguageCode = profileDefaults.transcriptionLanguageCode;
      }
      if (input.transcriptionModel === undefined) {
        draft.transcriptionModel = profileDefaults.transcriptionModel;
      }
    }

    const nextSettings = sanitizeVoiceSettings(draft);

    await this.repository.save(nextSettings);

    return {
      settings: nextSettings,
      capabilities: buildCapabilities(),
      options: {
        transcriptionModels,
        transcriptionLanguages: getTranscriptionLanguageOptions()
      }
    };
  }

  async getResolvedSettings() {
    const persisted = await this.repository.get();
    return mergeVoiceSettings(persisted);
  }

  async buildSettingsPayload(audio: AudioBridgeState) {
    const payload = await this.getSettings();

    return {
      ...payload,
      currentDevices: {
        inputLabel: audio.inputDeviceLabel,
        outputLabel: audio.outputDeviceLabel
      }
    };
  }

  async getResolvedTranscriptionConfig(): Promise<TranscriptionRuntimeConfig> {
    const settings = await this.getResolvedSettings();

    return {
      provider: 'parakeet-local',
      speechModelVersion: env.speechModelVersion,
      languageCode: settings.transcriptionLanguageCode
    };
  }
}

function mergeVoiceSettings(persisted: Partial<VoiceSettings> | null | undefined): VoiceSettings {
  return sanitizeVoiceSettings({
    ...defaultVoiceSettings,
    ...persisted
  });
}

function sanitizeVoiceSettings(settings: Partial<VoiceSettings>): VoiceSettings {
  const qualityProfile = sanitizeQualityProfile(settings.qualityProfile);
  const noiseMode = sanitizeNoiseMode(settings.noiseMode);
  const profileDefaults = getVoiceProfileDefaults(qualityProfile);
  const silenceWindowMs = clampNumber(
    settings.silenceWindowMs,
    700,
    5000,
    profileDefaults.silenceWindowMs
  );
  const voiceLocale =
    typeof settings.voiceLocale === 'string' && settings.voiceLocale.trim()
      ? settings.voiceLocale.trim()
      : defaultVoiceSettings.voiceLocale;
  const transcriptionLanguageCode = sanitizeTranscriptionLanguageCode(
    settings.transcriptionLanguageCode,
    profileDefaults.transcriptionLanguageCode
  );
  const transcriptionModel = sanitizeTranscriptionModel(
    settings.transcriptionModel,
    profileDefaults.transcriptionModel
  );

  return {
    silenceWindowMs,
    voiceLocale,
    autoResumeAfterReply:
      settings.autoResumeAfterReply ?? defaultVoiceSettings.autoResumeAfterReply,
    transcriptionLanguageCode,
    transcriptionModel,
    qualityProfile,
    noiseMode
  };
}

function buildCapabilities(): VoiceSettingsCapabilities {
  return {
    deviceSelection: false,
    interruption: true
  };
}

function clampNumber(value: number | undefined, min: number, max: number, fallback: number) {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(Math.max(Math.round(value), min), max);
}

function sanitizeTranscriptionLanguageCode(value: unknown, fallback: string) {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }

  return normalized;
}

function sanitizeTranscriptionModel(
  _value: unknown,
  _fallback: VoiceSettings['transcriptionModel']
): VoiceSettings['transcriptionModel'] {
  // Oplyr ships a single local STT model (Parakeet). Any persisted legacy value
  // (e.g. an old Moonshine/Whisper selection) is normalized to 'parakeet'.
  return 'parakeet';
}

function sanitizeQualityProfile(value: unknown): VoiceQualityProfile {
  if (value === 'low_memory' || value === 'balanced') {
    return value;
  }

  return 'demo';
}

function sanitizeNoiseMode(value: unknown): VoiceNoiseMode {
  if (value === 'normal' || value === 'noisy_room') {
    return value;
  }

  return 'focused';
}

function getVoiceProfileDefaults(qualityProfile: VoiceQualityProfile) {
  if (qualityProfile === 'low_memory') {
    return {
      silenceWindowMs: 1500,
      transcriptionLanguageCode: 'en',
      transcriptionModel: 'parakeet' as const
    };
  }

  if (qualityProfile === 'balanced') {
    return {
      silenceWindowMs: 1800,
      transcriptionLanguageCode: 'en',
      transcriptionModel: 'parakeet' as const
    };
  }

  return {
    silenceWindowMs: 2200,
    transcriptionLanguageCode: 'en',
    transcriptionModel: 'parakeet' as const
  };
}

function getTranscriptionModelOptions(): TranscriptionModelOption[] {
  return [
    {
      id: 'parakeet',
      label: 'Parakeet (local)',
      description:
        'NVIDIA Parakeet multilingual speech recognition running locally on Apple Silicon via MLX.',
      available: true
    }
  ];
}

function getTranscriptionLanguageOptions(): TranscriptionLanguageOption[] {
  // Languages supported by parakeet-tdt-0.6b-v3 (subset surfaced in the UI).
  return [
    { code: 'auto', label: 'Auto detect' },
    { code: 'en', label: 'English' },
    { code: 'es', label: 'Spanish' },
    { code: 'fr', label: 'French' },
    { code: 'de', label: 'German' },
    { code: 'it', label: 'Italian' },
    { code: 'pt', label: 'Portuguese' }
  ];
}

function getInitialTranscriptionModel(): VoiceSettings['transcriptionModel'] {
  return 'parakeet';
}
