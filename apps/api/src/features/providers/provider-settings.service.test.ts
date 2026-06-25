import test from 'node:test';
import assert from 'node:assert/strict';
import { ProviderSettingsService } from './provider-settings.service.js';
import type { ProviderConnectionState } from './provider-settings.repository.js';

class InMemoryProviderSettingsRepository {
  state: ProviderConnectionState = {
    activeProviderId: null,
    connections: {
      codex: {
        connected: false,
        connectedAt: null
      },
      claude: {
        connected: false,
        connectedAt: null
      },
      gemini: {
        connected: false,
        connectedAt: null
      }
    }
  };

  async get() {
    return structuredClone(this.state);
  }

  async save(state: ProviderConnectionState) {
    this.state = structuredClone(state);
  }
}

test('ProviderSettingsService keeps multiple providers connected at once', async () => {
  const repository = new InMemoryProviderSettingsRepository();
  const service = new ProviderSettingsService(repository as never);

  const codexState = await service.connectProvider('codex');
  assert.equal(codexState.activeProviderId, 'codex');
  assert.equal(codexState.connections.codex.connected, true);
  assert.equal(codexState.connections.claude.connected, false);

  const claudeState = await service.connectProvider('claude');
  // Newly connected provider becomes active, but Codex stays connected.
  assert.equal(claudeState.activeProviderId, 'claude');
  assert.equal(claudeState.connections.codex.connected, true);
  assert.ok(claudeState.connections.codex.connectedAt);
  assert.equal(claudeState.connections.claude.connected, true);
});

test('ProviderSettingsService disconnects the active provider and repoints to a still-connected one', async () => {
  const repository = new InMemoryProviderSettingsRepository();
  const service = new ProviderSettingsService(repository as never);

  await service.connectProvider('codex');
  await service.connectProvider('claude');
  const next = await service.disconnectProvider('claude');

  // Active falls back to the other connected provider.
  assert.equal(next.activeProviderId, 'codex');
  assert.equal(next.connections.claude.connected, false);
  assert.equal(next.connections.codex.connected, true);
});

test('ProviderSettingsService clears active when the last provider disconnects', async () => {
  const repository = new InMemoryProviderSettingsRepository();
  const service = new ProviderSettingsService(repository as never);

  await service.connectProvider('codex');
  const next = await service.disconnectProvider('codex');

  assert.equal(next.activeProviderId, null);
  assert.equal(next.connections.codex.connected, false);
});

test('ProviderSettingsService flips active without disconnecting others', async () => {
  const repository = new InMemoryProviderSettingsRepository();
  const service = new ProviderSettingsService(repository as never);

  // Cannot make an unconnected provider active.
  let activeProviderId = await service.setActiveProviderPreference('codex');
  assert.equal(activeProviderId, null);

  await service.connectProvider('codex');
  await service.connectProvider('claude');

  // Switch the active pointer back to Codex; Claude stays connected.
  activeProviderId = await service.setActiveProviderPreference('codex');
  assert.equal(activeProviderId, 'codex');
  const state = await repository.get();
  assert.equal(state.connections.codex.connected, true);
  assert.equal(state.connections.claude.connected, true);
});

test('multi-connect flow: connect A, connect B, set active B, disconnect B falls back to A', async () => {
  const repository = new InMemoryProviderSettingsRepository();
  const service = new ProviderSettingsService(repository as never);

  await service.connectProvider('codex');
  const bothConnected = await service.connectProvider('claude');
  assert.equal(bothConnected.connections.codex.connected, true);
  assert.equal(bothConnected.connections.claude.connected, true);

  const activeB = await service.setActiveProviderPreference('claude');
  assert.equal(activeB, 'claude');

  const afterDisconnect = await service.disconnectProvider('claude');
  assert.equal(afterDisconnect.activeProviderId, 'codex');
  assert.equal(afterDisconnect.connections.codex.connected, true);
  assert.equal(afterDisconnect.connections.claude.connected, false);
});
