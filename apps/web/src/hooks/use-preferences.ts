import { useCallback, useEffect, useState } from 'react';
import type { ConsolePreferences } from '@/containers/voice-console/lib/types';

const STORAGE_KEY = 'oplyr.console-preferences';

/** Bump when a default changes in a way that must reach existing installs. */
const PREFS_VERSION = 2;

const defaults: ConsolePreferences = {
  defaultScreen: 'voice',
  // OFF by default: auto-send fires a possibly-misheard sentence straight at a coding agent with no
  // chance to read it first. Speaking now lands the transcript in the composer to check and send.
  autoSendVoice: false
};

interface StoredPreferences extends Partial<ConsolePreferences> {
  version?: number;
}

function load(): ConsolePreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return defaults;
    }

    const { version, ...stored } = JSON.parse(raw) as StoredPreferences;
    const merged: ConsolePreferences = { ...defaults, ...stored };

    // Every change persisted the WHOLE blob, so every existing install carries
    // `autoSendVoice: true` — not because anyone chose it, but because it used to be the default.
    // Merging would therefore keep the unsafe value forever. Apply the new default once, then stamp
    // the version so anyone who deliberately switches it back on keeps their choice.
    if ((version ?? 1) < PREFS_VERSION) {
      merged.autoSendVoice = defaults.autoSendVoice;
    }

    return merged;
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...preferences, version: PREFS_VERSION }));
  }, [preferences]);

  return { preferences, setPreference };
}
