import test from 'node:test';
import assert from 'node:assert/strict';
import { getDefaultBrainSettings } from './brain-settings.repository.js';
import { BrainSettingsService } from './brain-settings.service.js';
import type { BrainProjectSettings, BrainSettings } from './brain.types.js';

class InMemoryBrainSettingsRepository {
  settings: BrainSettings = getDefaultBrainSettings();
  projects: Record<string, BrainProjectSettings> = {};

  async get() {
    return structuredClone(this.settings);
  }

  async save(settings: BrainSettings) {
    this.settings = structuredClone(settings);
  }

  async getAllProjectSettings() {
    return structuredClone(this.projects);
  }

  async saveProjectSettings(projectKey: string, settings: BrainProjectSettings) {
    this.projects[projectKey] = structuredClone(settings);
  }
}

test('BrainSettingsService defaults: standard mode, capture + cross-project on, agents writable', async () => {
  const service = new BrainSettingsService(new InMemoryBrainSettingsRepository() as never);
  const settings = await service.getSettings();

  assert.equal(settings.mode, 'standard');
  assert.equal(settings.enabled, true);
  assert.equal(settings.recallEnabled, true);
  assert.equal(settings.captureEnabled, true);
  assert.equal(settings.crossProjectEnabled, true);
  assert.equal(settings.rawArchiveEnabled, false);
  assert.equal(settings.allowSensitiveCapture, false);
  assert.equal(settings.allowSensitiveInjection, false);
  assert.equal(settings.agentWritePermissions.codex.writeEnabled, true);
  assert.equal(settings.agentWritePermissions.claude.writeEnabled, true);
  assert.equal(settings.agentWritePermissions.gemini.writeEnabled, true);
});

test('BrainSettingsService updates per-agent write permission with timestamp', async () => {
  const service = new BrainSettingsService(new InMemoryBrainSettingsRepository() as never);
  const settings = await service.updateSettings({ agentWritePermissions: { claude: false } });

  assert.equal(settings.agentWritePermissions.claude.writeEnabled, false);
  assert.ok(settings.agentWritePermissions.claude.updatedAt);
  assert.equal(settings.agentWritePermissions.codex.writeEnabled, true);
});

test('BrainSettingsService clamps recall caps', async () => {
  const service = new BrainSettingsService(new InMemoryBrainSettingsRepository() as never);
  const settings = await service.updateSettings({
    maxRecallAtoms: 200,
    maxRecallCharacters: 20,
    maxGraphHops: 9
  });

  assert.equal(settings.maxRecallAtoms, 20);
  assert.equal(settings.maxRecallCharacters, 400);
  assert.equal(settings.maxGraphHops, 3);
});

test('BrainSettingsService gates sensitive handling behind local_god', async () => {
  const service = new BrainSettingsService(new InMemoryBrainSettingsRepository() as never);

  // In standard mode, sensitive flags are forced off no matter what is requested.
  const standard = await service.updateSettings({
    mode: 'standard',
    allowSensitiveCapture: true,
    allowSensitiveInjection: true
  });
  assert.equal(standard.allowSensitiveCapture, false);
  assert.equal(standard.allowSensitiveInjection, false);

  // In local_god they can be turned on explicitly.
  const god = await service.updateSettings({
    mode: 'local_god',
    allowSensitiveCapture: true,
    allowSensitiveInjection: true
  });
  assert.equal(god.mode, 'local_god');
  assert.equal(god.allowSensitiveCapture, true);
  assert.equal(god.allowSensitiveInjection, true);

  // Leaving local_god forces them back off.
  const back = await service.updateSettings({ mode: 'standard' });
  assert.equal(back.allowSensitiveCapture, false);
  assert.equal(back.allowSensitiveInjection, false);
});

test('BrainSettingsService toggles cross-project recall', async () => {
  const service = new BrainSettingsService(new InMemoryBrainSettingsRepository() as never);
  const settings = await service.updateSettings({ crossProjectEnabled: false });
  assert.equal(settings.crossProjectEnabled, false);
});

test('BrainSettingsService manages per-project isolate + capture overrides', async () => {
  const service = new BrainSettingsService(new InMemoryBrainSettingsRepository() as never);

  assert.deepEqual(await service.getProjectSettings('proj-1'), {
    isolate: false,
    captureEnabled: true
  });

  const updated = await service.updateProjectSettings('proj-1', { isolate: true });
  assert.equal(updated.isolate, true);
  assert.equal(updated.captureEnabled, true);

  assert.deepEqual(await service.getIsolatedProjectKeys(), ['proj-1']);
});
