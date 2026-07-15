import type { AppSettings } from '../../types.js';
import { AppSettingsRepository } from './app-settings.repository.js';

export class AppSettingsService {
  private readonly repository = new AppSettingsRepository();

  async getSettings() {
    return this.repository.get();
  }

  async updateSettings(input: Partial<AppSettings>) {
    const current = await this.repository.get();
    // Only overlay keys that were actually provided. The update endpoint passes `undefined` for
    // fields not in the request, and a plain spread would clobber e.g. `displayName` with undefined
    // on a theme/desk-pet-only change — wiping the name and (wrongly) re-triggering onboarding.
    const defined = Object.fromEntries(
      Object.entries(input).filter(([, value]) => value !== undefined)
    );
    const next = sanitizeAppSettings({ ...current, ...defined });
    await this.repository.save(next);
    return next;
  }
}

function sanitizeAppSettings(input: Partial<AppSettings>): AppSettings {
  const trimmedName =
    typeof input.displayName === 'string' ? input.displayName.trim().slice(0, 48) : null;

  return {
    displayName: trimmedName || null,
    theme: input.theme === 'light' ? 'light' : 'dark',
    welcomedAt:
      typeof input.welcomedAt === 'string' && input.welcomedAt.trim() ? input.welcomedAt : null,
    // Default on when unset so existing users keep the pet; only an explicit `false` disables it.
    showDeskPet: input.showDeskPet !== false
  };
}
