import assert from 'node:assert/strict';
import test from 'node:test';
import { VoiceSettingsService } from './voice-settings.service.js';

test('getResolvedTranscriptionConfig returns the single Parakeet provider config', async () => {
  const service = new VoiceSettingsService();
  const config = await service.getResolvedTranscriptionConfig();

  assert.equal(config.provider, 'parakeet-local');
  assert.equal(config.speechModelVersion, 'v3');
  assert.equal(typeof config.languageCode, 'string');
});

test('voice settings expose only the Parakeet model option', async () => {
  const service = new VoiceSettingsService();
  const { options } = await service.getSettings();

  assert.deepEqual(
    options.transcriptionModels.map((model) => model.id),
    ['parakeet']
  );
});

test('getSettings returns only the live, user-facing voice settings', async () => {
  const service = new VoiceSettingsService();
  const { settings } = await service.getSettings();

  assert.deepEqual(Object.keys(settings).sort(), [
    'autoResumeAfterReply',
    'silenceWindowMs',
    'transcriptionModel'
  ]);
  assert.equal(settings.transcriptionModel, 'parakeet');
});
