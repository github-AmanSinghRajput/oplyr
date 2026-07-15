import { env } from '../../config/env.js';
import type {
  AudioBridgeState,
  TranscriptionModelOption,
  TranscriptionRuntimeConfig,
  VoiceSettings
} from '../../types.js';
import { VoiceSettingsRepository } from './voice-settings.repository.js';

const defaultVoiceSettings: VoiceSettings = {
  silenceWindowMs: 1800,
  autoResumeAfterReply: true,
  transcriptionModel: getInitialTranscriptionModel()
};

interface UpdateVoiceSettingsInput {
  silenceWindowMs?: number;
  autoResumeAfterReply?: boolean;
  transcriptionModel?: VoiceSettings['transcriptionModel'];
}

export class VoiceSettingsService {
  constructor(
    private readonly repository: VoiceSettingsRepository = new VoiceSettingsRepository()
  ) {}

  async getSettings() {
    const persisted = await this.repository.get();
    return {
      settings: mergeVoiceSettings(persisted),
      options: {
        transcriptionModels: getTranscriptionModelOptions()
      }
    };
  }

  async updateSettings(input: UpdateVoiceSettingsInput) {
    const persisted = await this.repository.get();
    const current = mergeVoiceSettings(persisted);
    const nextSettings = sanitizeVoiceSettings({ ...current, ...input });

    await this.repository.save(nextSettings);

    return {
      settings: nextSettings,
      options: {
        transcriptionModels: getTranscriptionModelOptions()
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
    // Language/version are operator-fixed via env — the STT worker reads them from the
    // environment, so they are not exposed as per-user settings.
    return {
      provider: 'parakeet-local',
      speechModelVersion: env.speechModelVersion,
      languageCode: env.transcriptionLanguageCode
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
  return {
    silenceWindowMs: clampNumber(
      settings.silenceWindowMs,
      700,
      5000,
      defaultVoiceSettings.silenceWindowMs
    ),
    autoResumeAfterReply:
      settings.autoResumeAfterReply ?? defaultVoiceSettings.autoResumeAfterReply,
    transcriptionModel: sanitizeTranscriptionModel(settings.transcriptionModel)
  };
}

function clampNumber(value: number | undefined, min: number, max: number, fallback: number) {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(Math.max(Math.round(value), min), max);
}

function sanitizeTranscriptionModel(_value: unknown): VoiceSettings['transcriptionModel'] {
  // Oplyr ships a single local STT model (Parakeet). Any persisted legacy value
  // (e.g. an old Moonshine/Whisper selection) is normalized to 'parakeet'.
  return 'parakeet';
}

function getTranscriptionModelOptions(): TranscriptionModelOption[] {
  // User-facing label/description: describe the BENEFIT (private, on-device), not the internal engine
  // (`id` stays the internal identifier; it isn't shown to the user).
  return [
    {
      id: 'parakeet',
      label: 'On-device (private)',
      description:
        'Speech-to-text runs locally on your Mac. Your audio never leaves the device — nothing is uploaded.',
      available: true
    }
  ];
}

function getInitialTranscriptionModel(): VoiceSettings['transcriptionModel'] {
  return 'parakeet';
}
