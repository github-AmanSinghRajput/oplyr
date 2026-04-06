import { useCallback, useEffect, useState } from 'react';
import type { ConsolePreferences } from '@/containers/voice-console/lib/types';

const STORAGE_KEY = 'voice-codex-local.console-preferences';

const defaults: ConsolePreferences = {
  defaultScreen: 'voice',
  transcriptDensity: 'comfortable',
  motionMode: 'full'
};

function load(): ConsolePreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch {
    /* localStorage unavailable */
  }
  return defaults;
}

export function usePreferences() {
  const [preferences, setPreferencesState] = useState<ConsolePreferences>(load);

  const setPreference = useCallback(
    <K extends keyof ConsolePreferences>(key: K, value: ConsolePreferences[K]) => {
      setPreferencesState((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  }, [preferences]);

  return { preferences, setPreference };
}
