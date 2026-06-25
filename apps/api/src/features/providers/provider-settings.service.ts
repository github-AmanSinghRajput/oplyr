import type { AssistantProviderId } from '../../types.js';
import {
  ProviderSettingsRepository,
  type ProviderConnectionState
} from './provider-settings.repository.js';

export class ProviderSettingsService {
  constructor(
    private readonly repository: ProviderSettingsRepository = new ProviderSettingsRepository()
  ) {}

  getState() {
    return this.repository.get();
  }

  async connectProvider(providerId: AssistantProviderId) {
    const current = await this.repository.get();
    const connectedAt = new Date().toISOString();
    // Connecting a provider must NOT disconnect any other connected provider.
    // Newly connected providers become active; existing connections stay intact.
    const next: ProviderConnectionState = {
      ...current,
      activeProviderId: providerId,
      connections: {
        ...current.connections,
        [providerId]: {
          connected: true,
          connectedAt
        }
      }
    };
    await this.repository.save(next);
    return next;
  }

  async disconnectProvider(providerId: AssistantProviderId) {
    const current = await this.repository.get();
    const connections: ProviderConnectionState['connections'] = {
      ...current.connections,
      [providerId]: {
        connected: false,
        connectedAt: null
      }
    };

    let activeProviderId = current.activeProviderId;
    if (activeProviderId === providerId) {
      // Repoint the active pointer to another still-connected provider, or null.
      const fallback = (Object.keys(connections) as AssistantProviderId[]).find(
        (id) => connections[id].connected
      );
      activeProviderId = fallback ?? null;
    }

    const next: ProviderConnectionState = {
      ...current,
      activeProviderId,
      connections
    };
    await this.repository.save(next);
    return next;
  }

  async setActiveProviderPreference(providerId: AssistantProviderId | null) {
    const current = await this.repository.get();
    // Only flip the active pointer; never disconnect other providers.
    // The target must be connected to become active.
    const next: ProviderConnectionState = {
      ...current,
      activeProviderId: providerId && current.connections[providerId].connected ? providerId : null
    };
    await this.repository.save(next);
    return next.activeProviderId;
  }
}
