import test from 'node:test';
import assert from 'node:assert/strict';
import { GeminiSettingsService } from './gemini-settings.service.js';

class GeminiSettingsRepositoryStub {
  state: Record<string, unknown> | null = null;

  async get() {
    return this.state as {
      model?: string | null;
      voiceModelMode?: 'auto' | 'fast' | 'inherit';
    } | null;
  }

  async save(settings: Record<string, unknown>) {
    this.state = { ...settings };
  }
}

test('GeminiSettingsService returns sensible defaults when nothing is configured', async () => {
  const service = new GeminiSettingsService(new GeminiSettingsRepositoryStub() as never);
  const result = await service.getSettings();

  assert.equal(result.source, 'default');
  assert.equal(result.settings.voiceModelMode, 'auto');
  assert.equal(result.options.models.length > 0, true);
});

test('GeminiSettingsService prefers a faster model for voice discussion in auto mode', async () => {
  const repository = new GeminiSettingsRepositoryStub();
  repository.state = {
    model: 'gemini-2.5-pro',
    voiceModelMode: 'auto'
  };

  const service = new GeminiSettingsService(repository as never);
  const result = await service.getExecutionOverrides({
    surface: 'voice',
    intent: 'discussion'
  });

  assert.equal(result.model, 'gemini-2.5-flash');
});
