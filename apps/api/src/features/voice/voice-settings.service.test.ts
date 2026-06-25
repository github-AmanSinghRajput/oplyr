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

test('voice settings expose only the Parakeet model and v3-supported languages', async () => {
  const service = new VoiceSettingsService();
  const { options } = await service.getSettings();

  assert.deepEqual(
    options.transcriptionModels.map((model) => model.id),
    ['parakeet']
  );

  const languageCodes = options.transcriptionLanguages.map((language) => language.code);
  assert.equal(languageCodes.includes('en'), true);
  assert.equal(languageCodes.includes('hi'), false);
  assert.equal(languageCodes.includes('ja'), false);
});
