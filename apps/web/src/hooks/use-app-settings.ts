import { useCallback, useEffect, useRef, useState } from 'react';
import { useApi } from '@/providers/ApiProvider';
import { useStatus } from '@/providers/StatusProvider';
import { useToast } from '@/providers/ToastProvider';
import type {
  AppSettings,
  AssistantProviderId,
  ClaudeSettingsResponse,
  CodexSettingsResponse,
  GeminiSettingsResponse,
  ProviderUsageSnapshot,
  VoiceSettings,
  VoiceSettingsResponse
} from '@/containers/voice-console/lib/types';

export interface AppSettingsHandle {
  codexSettings: CodexSettingsResponse | null;
  claudeSettings: ClaudeSettingsResponse | null;
  geminiSettings: GeminiSettingsResponse | null;
  providerUsage: ProviderUsageSnapshot | null;
  providerUsageLoading: boolean;
  voiceSettings: VoiceSettingsResponse | null;
  busyLabel: string;
  error: string;
  onboardingSavingDisplayName: boolean;
  onboardingStep: 1 | 2 | 3 | 4 | 5;
  onboardingSelectedProviderId: AssistantProviderId | null;
  onboardingProjectDismissed: boolean;
  dismissOnboardingProject: () => void;
  restoreOnboardingProject: () => void;
  onboardingPetChosen: boolean;
  dismissOnboardingPet: () => void;
  setOnboardingStep: (step: 1 | 2 | 3 | 4 | 5) => void;
  setOnboardingSelectedProviderId: (id: AssistantProviderId | null) => void;
  handleAppSettingChange: <Key extends keyof AppSettings>(
    key: Key,
    value: AppSettings[Key]
  ) => Promise<void>;
  handleVoiceSettingChange: (
    key: keyof VoiceSettings,
    value: VoiceSettings[keyof VoiceSettings]
  ) => Promise<void>;
  handleCodexSettingChange: (
    key: keyof CodexSettingsResponse['settings'],
    value: CodexSettingsResponse['settings'][keyof CodexSettingsResponse['settings']]
  ) => void;
  handleClaudeSettingChange: (
    key: keyof ClaudeSettingsResponse['settings'],
    value: ClaudeSettingsResponse['settings'][keyof ClaudeSettingsResponse['settings']]
  ) => void;
  handleGeminiSettingChange: (
    key: keyof GeminiSettingsResponse['settings'],
    value: GeminiSettingsResponse['settings'][keyof GeminiSettingsResponse['settings']]
  ) => void;
  handleSaveCodexSettings: () => Promise<void>;
  handleSaveClaudeSettings: () => Promise<void>;
  handleSaveGeminiSettings: () => Promise<void>;
  codexSettingsDirty: boolean;
  claudeSettingsDirty: boolean;
  geminiSettingsDirty: boolean;
  handleSelectModel: (providerId: AssistantProviderId, slug: string) => Promise<void>;
  handleSelectReasoningEffort: (
    providerId: AssistantProviderId,
    effort: string | null
  ) => Promise<void>;
  refreshingModels: boolean;
  handleRefreshModels: (
    providerId: AssistantProviderId,
    options?: { silent?: boolean }
  ) => Promise<void>;
  handleUpdateCli: (providerId: AssistantProviderId) => Promise<void>;
  handleProviderSwitch: (providerId: AssistantProviderId) => Promise<void>;
  handleProviderConnect: (providerId: AssistantProviderId) => Promise<void>;
  handleProviderDisconnect: (providerId: AssistantProviderId) => Promise<void>;
  handleSaveProject: (projectRoot: string) => Promise<void>;
  handleToggleWriteAccess: (enabled: boolean) => Promise<void>;
  handleResetApp: () => Promise<boolean>;
  handleOnboardingDisplayNameSubmit: (displayName: string) => Promise<void>;
  initialize: () => Promise<void>;
  loadCodexSettings: () => Promise<void>;
  loadClaudeSettings: () => Promise<void>;
  loadGeminiSettings: () => Promise<void>;
  loadProviderUsage: (options?: { force?: boolean }) => Promise<void>;
  loadVoiceSettings: () => Promise<void>;
}

export function useAppSettings(): AppSettingsHandle {
  const { service } = useApi();
  const { status, setStatus, refreshStatus } = useStatus();
  const { pushToast } = useToast();

  const [codexSettings, setCodexSettings] = useState<CodexSettingsResponse | null>(null);
  const [claudeSettings, setClaudeSettings] = useState<ClaudeSettingsResponse | null>(null);
  const [geminiSettings, setGeminiSettings] = useState<GeminiSettingsResponse | null>(null);
  const [codexSettingsDirty, setCodexSettingsDirty] = useState(false);
  const [claudeSettingsDirty, setClaudeSettingsDirty] = useState(false);
  const [geminiSettingsDirty, setGeminiSettingsDirty] = useState(false);
  const [providerUsage, setProviderUsage] = useState<ProviderUsageSnapshot | null>(null);
  const [providerUsageLoading, setProviderUsageLoading] = useState(false);
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettingsResponse | null>(null);
  const [busyLabel, setBusyLabel] = useState('');
  const [error, setError] = useState('');
  const [onboardingSavingDisplayName, setOnboardingSavingDisplayName] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  // Whether the user has resolved the first-run "connect a project" step (connected one or skipped).
  // Persisted so the step doesn't reappear after they've dealt with it once.
  const [onboardingProjectDismissed, setOnboardingProjectDismissed] = useState(
    () => localStorage.getItem('oplyr.onboarding.projectDismissed') === 'true'
  );
  const dismissOnboardingProject = useCallback(() => {
    localStorage.setItem('oplyr.onboarding.projectDismissed', 'true');
    setOnboardingProjectDismissed(true);
  }, []);
  /** Undo the skip so the derived step machine lands back on the project + memory-import step.
   *  Used by "Back" on the pet step — skipping past the import is easy to do by accident. */
  const restoreOnboardingProject = useCallback(() => {
    localStorage.removeItem('oplyr.onboarding.projectDismissed');
    setOnboardingProjectDismissed(false);
  }, []);
  // Whether the user has resolved the first-run "pick your desk pet" step (chose one or skipped).
  // Persisted so it shows once. Existing (already-named) users are auto-marked so the new step never
  // pulls them back into onboarding (see the migration effect below).
  const [onboardingPetChosen, setOnboardingPetChosen] = useState(
    () => localStorage.getItem('oplyr.onboarding.petChosen') === 'true'
  );
  const dismissOnboardingPet = useCallback(() => {
    localStorage.setItem('oplyr.onboarding.petChosen', 'true');
    setOnboardingPetChosen(true);
  }, []);
  const [onboardingSelectedProviderId, setOnboardingSelectedProviderId] =
    useState<AssistantProviderId | null>(null);
  const activeProviderId = status?.assistantProviders.activeProviderId ?? null;
  const [refreshingModels, setRefreshingModels] = useState(false);
  // Monotonic tag for provider-usage reads so a stale in-flight fetch can't overwrite a newer one.
  const usageRequestSeq = useRef(0);
  // Providers whose model list we've already auto-refreshed this session. Landing on / switching to
  // a provider triggers one live CLI model scrape so the picker shows the latest models without the
  // user having to click "Refresh models" — but only once per provider per session (the scrape is a
  // real CLI spawn worth seconds), after which the freshly-scraped cache serves subsequent switches.
  const autoRefreshedModelsRef = useRef<Set<AssistantProviderId>>(new Set());

  // Clear error after 6s
  useEffect(() => {
    if (!error) return;
    const timeout = window.setTimeout(() => setError(''), 6000);
    return () => window.clearTimeout(timeout);
  }, [error]);

  const loadCodexSettings = useCallback(async () => {
    try {
      const next = await service.getCodexSettings();
      setCodexSettings(next);
      setCodexSettingsDirty(false);
    } catch {
      // non-critical
    }
  }, [service]);

  const loadClaudeSettings = useCallback(async () => {
    try {
      const next = await service.getClaudeSettings();
      setClaudeSettings(next);
      setClaudeSettingsDirty(false);
    } catch {
      // non-critical
    }
  }, [service]);

  const loadGeminiSettings = useCallback(async () => {
    try {
      const next = await service.getGeminiSettings();
      setGeminiSettings(next);
      setGeminiSettingsDirty(false);
    } catch {
      // non-critical
    }
  }, [service]);

  const loadVoiceSettings = useCallback(async () => {
    try {
      const next = await service.getVoiceSettings();
      setVoiceSettings(next);
    } catch {
      // non-critical
    }
  }, [service]);

  const loadProviderUsage = useCallback(
    async (options?: { force?: boolean }) => {
      if (!activeProviderId) {
        setProviderUsage(null);
        setProviderUsageLoading(false);
        return;
      }

      // Each usage read runs a live CLI capture (seconds). If the user switches A→B→A mid-flight, a
      // slow earlier response must not clobber the latest one — tag every request and only the newest
      // (seq === latest) is allowed to commit state ("latest wins").
      const seq = ++usageRequestSeq.current;
      setProviderUsageLoading(true);

      // The first Codex read is a ~20s cold CLI scrape; if that request drops ("Failed to fetch"), the
      // server still finishes it and caches the result — so a short retry lands on the warm cache. This
      // lets a single connected agent (e.g. Codex only) show usage without connecting a second one. A
      // warm cache resolves on the first try; the gaps sum past a cold scrape.
      const retryGapsMs = [0, 8000, 8000, 8000];
      for (let attempt = 0; attempt < retryGapsMs.length; attempt++) {
        if (retryGapsMs[attempt] > 0) {
          await new Promise((resolve) => setTimeout(resolve, retryGapsMs[attempt]));
        }
        if (seq !== usageRequestSeq.current) return;
        try {
          // Force only the first attempt: it kicks off a fresh capture, and the retries then ride the
          // server's in-flight/warm cache instead of starting redundant CLI scrapes.
          const next = await service.getAssistantUsage(attempt === 0 && options?.force === true);
          if (seq !== usageRequestSeq.current) return;
          setProviderUsage(next.usage);
          setProviderUsageLoading(false);
          return;
        } catch {
          if (seq !== usageRequestSeq.current) return;
          // Transient — usually a dropped connection during a cold capture. Fall through and retry.
        }
      }

      if (seq !== usageRequestSeq.current) return;
      setProviderUsage(null);
      setProviderUsageLoading(false);
    },
    [activeProviderId, service]
  );

  const initialize = useCallback(async () => {
    await Promise.allSettled([refreshStatus(), loadVoiceSettings()]);
  }, [refreshStatus, loadVoiceSettings]);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  // One-time migration: if the app is already onboarded (a display name is present on the FIRST status
  // load) and the user has never seen the pet step, mark it chosen — so adding the step never yanks
  // an existing user back into onboarding just to pick a pet.
  const petMigrationRef = useRef(false);
  useEffect(() => {
    if (petMigrationRef.current || !status) return;
    petMigrationRef.current = true;
    if (
      localStorage.getItem('oplyr.onboarding.petChosen') === null &&
      status.appSettings.displayName?.trim()
    ) {
      localStorage.setItem('oplyr.onboarding.petChosen', 'true');
      setOnboardingPetChosen(true);
    }
  }, [status]);

  useEffect(() => {
    const hasDisplayName = Boolean(status?.appSettings.displayName?.trim());

    if (!hasDisplayName) {
      setOnboardingStep(1);
      setOnboardingSelectedProviderId(null);
      // Fresh onboarding (no name yet): clear any stale "skipped" flags left over from a prior run so
      // the connect-workspace + pet steps reliably reappear instead of staying hidden.
      if (onboardingProjectDismissed) {
        localStorage.removeItem('oplyr.onboarding.projectDismissed');
        setOnboardingProjectDismissed(false);
      }
      if (onboardingPetChosen) {
        localStorage.removeItem('oplyr.onboarding.petChosen');
        setOnboardingPetChosen(false);
      }
      return;
    }

    if (!activeProviderId) {
      setOnboardingStep(2);
      setOnboardingSelectedProviderId(null);
      return;
    }

    // Name + an active provider are set. If no project is connected yet and the user hasn't skipped,
    // advance to the final "connect your first project" step so they finish on a usable workspace.
    setOnboardingSelectedProviderId(activeProviderId);
    const projectPending = !status?.workspace.projectRoot && !onboardingProjectDismissed;
    if (projectPending) {
      setOnboardingStep(4);
      return;
    }
    // Project resolved — the final onboarding beat is picking a desk pet (once per fresh install).
    if (!onboardingPetChosen) {
      setOnboardingStep(5);
      return;
    }
    setOnboardingStep((current) => (current === 1 || current === 2 || current === 4 ? 3 : current));
  }, [
    activeProviderId,
    status?.appSettings.displayName,
    status?.workspace.projectRoot,
    onboardingProjectDismissed,
    onboardingPetChosen
  ]);

  useEffect(() => {
    // On provider switch: drop the other providers' settings, load the active one's, and refresh its
    // usage. Usage is captured live from the CLI (node-pty) and TTL-cached server-side, so this is
    // cheap on a cache hit; the first fetch per provider spawns the CLI (~a few seconds) and the
    // meters appear when it lands. Providers without live usage return "unavailable" (UI hides them).
    if (activeProviderId === 'codex') {
      setClaudeSettings(null);
      setGeminiSettings(null);
      void loadCodexSettings();
      void loadProviderUsage();
      return;
    }

    if (activeProviderId === 'claude') {
      setCodexSettings(null);
      setGeminiSettings(null);
      void loadClaudeSettings();
      void loadProviderUsage();
      return;
    }

    if (activeProviderId === 'gemini') {
      setCodexSettings(null);
      setClaudeSettings(null);
      void loadGeminiSettings();
      void loadProviderUsage();
      return;
    }

    setCodexSettings(null);
    setClaudeSettings(null);
    setGeminiSettings(null);
    setProviderUsage(null);
    setProviderUsageLoading(false);
  }, [
    activeProviderId,
    loadClaudeSettings,
    loadCodexSettings,
    loadGeminiSettings,
    loadProviderUsage
  ]);

  const handleAppSettingChange = useCallback(
    async <Key extends keyof AppSettings>(key: Key, value: AppSettings[Key]) => {
      try {
        const nextSettings = await service.updateAppSettings({
          [key]: value
        } as Partial<AppSettings>);
        setStatus((current) => (current ? { ...current, appSettings: nextSettings } : current));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to save app settings.');
        pushToast('error', 'Settings not saved', 'Your app preferences could not be updated.');
      }
    },
    [service, setStatus, pushToast]
  );

  const handleVoiceSettingChange = useCallback(
    async (key: keyof VoiceSettings, value: VoiceSettings[keyof VoiceSettings]) => {
      if (!voiceSettings) return;

      const optimistic: VoiceSettingsResponse = {
        ...voiceSettings,
        settings: { ...voiceSettings.settings, [key]: value }
      };
      setVoiceSettings(optimistic);

      try {
        const next = await service.updateVoiceSettings({ [key]: value } as Partial<VoiceSettings>);
        setVoiceSettings(next);
      } catch {
        pushToast('error', 'Settings not saved', 'Voice preferences could not be updated.');
        await loadVoiceSettings();
      }
    },
    [service, voiceSettings, pushToast, loadVoiceSettings]
  );

  const handleCodexSettingChange = useCallback(
    (
      key: keyof CodexSettingsResponse['settings'],
      value: CodexSettingsResponse['settings'][keyof CodexSettingsResponse['settings']]
    ) => {
      // Stage locally only; persisted when the user clicks Save.
      setCodexSettings((current) =>
        current ? { ...current, settings: { ...current.settings, [key]: value } } : current
      );
      setCodexSettingsDirty(true);
    },
    []
  );

  const handleSaveCodexSettings = useCallback(async () => {
    if (!codexSettings) return;
    try {
      const next = await service.updateCodexSettings(codexSettings.settings);
      setCodexSettings(next);
      setCodexSettingsDirty(false);
      pushToast('success', 'Codex settings saved', 'Your model preferences are now in effect.');
    } catch {
      pushToast('error', 'Not saved', 'Codex preferences could not be updated.');
      await loadCodexSettings();
    }
  }, [service, codexSettings, pushToast, loadCodexSettings]);

  const handleClaudeSettingChange = useCallback(
    (
      key: keyof ClaudeSettingsResponse['settings'],
      value: ClaudeSettingsResponse['settings'][keyof ClaudeSettingsResponse['settings']]
    ) => {
      setClaudeSettings((current) =>
        current ? { ...current, settings: { ...current.settings, [key]: value } } : current
      );
      setClaudeSettingsDirty(true);
    },
    []
  );

  const handleSaveClaudeSettings = useCallback(async () => {
    if (!claudeSettings) return;
    try {
      const next = await service.updateClaudeSettings(claudeSettings.settings);
      setClaudeSettings(next);
      setClaudeSettingsDirty(false);
      pushToast('success', 'Claude settings saved', 'Your model preferences are now in effect.');
    } catch {
      pushToast('error', 'Not saved', 'Claude preferences could not be updated.');
      await loadClaudeSettings();
    }
  }, [service, claudeSettings, pushToast, loadClaudeSettings]);

  const handleGeminiSettingChange = useCallback(
    (
      key: keyof GeminiSettingsResponse['settings'],
      value: GeminiSettingsResponse['settings'][keyof GeminiSettingsResponse['settings']]
    ) => {
      setGeminiSettings((current) =>
        current ? { ...current, settings: { ...current.settings, [key]: value } } : current
      );
      setGeminiSettingsDirty(true);
    },
    []
  );

  const handleSaveGeminiSettings = useCallback(async () => {
    if (!geminiSettings) return;
    try {
      const next = await service.updateGeminiSettings(geminiSettings.settings);
      setGeminiSettings(next);
      setGeminiSettingsDirty(false);
      pushToast('success', 'Gemini settings saved', 'Your model preferences are now in effect.');
    } catch {
      pushToast('error', 'Not saved', 'Gemini preferences could not be updated.');
      await loadGeminiSettings();
    }
  }, [service, geminiSettings, pushToast, loadGeminiSettings]);

  // Change the active provider's model and persist immediately (no dirty/save step) — used by the
  // quick model picker in the Topbar so switching a model on the voice/chat screens takes effect now.
  const handleSelectModel = useCallback(
    async (providerId: AssistantProviderId, slug: string) => {
      try {
        if (providerId === 'codex') {
          const next = await service.updateCodexSettings({ model: slug });
          setCodexSettings(next);
        } else if (providerId === 'claude') {
          const next = await service.updateClaudeSettings({ model: slug });
          setClaudeSettings(next);
        } else {
          const next = await service.updateGeminiSettings({ model: slug });
          setGeminiSettings(next);
        }
        pushToast('success', 'Model updated', 'Your model preference is now in effect.');
      } catch {
        pushToast('error', 'Not saved', 'The model could not be updated.');
      }
    },
    [service, pushToast]
  );

  // Set the reasoning effort for the active provider. Codex uses `-c model_reasoning_effort`; Claude
  // uses its `/effort` command (injected server-side). Gemini has no effort control → no-op.
  const handleSelectReasoningEffort = useCallback(
    async (providerId: AssistantProviderId, effort: string | null) => {
      try {
        if (providerId === 'codex') {
          const next = await service.updateCodexSettings({
            reasoningEffort: (effort ??
              undefined) as CodexSettingsResponse['settings']['reasoningEffort']
          });
          setCodexSettings(next);
        } else if (providerId === 'claude') {
          const next = await service.updateClaudeSettings({
            reasoningEffort: (effort ??
              undefined) as ClaudeSettingsResponse['settings']['reasoningEffort']
          });
          setClaudeSettings(next);
        } else {
          return;
        }
        pushToast('success', 'Effort updated', 'Reasoning effort is now in effect.');
      } catch {
        pushToast('error', 'Not saved', 'The reasoning effort could not be updated.');
      }
    },
    [service, pushToast]
  );

  // Refresh the live model list from the provider's own CLI (nothing is hardcoded on the server —
  // Codex republishes its cache; Claude/Gemini report that their aliases already track the latest),
  // then re-read the provider's settings so the picker updates.
  const handleRefreshModels = useCallback(
    async (providerId: AssistantProviderId, options?: { silent?: boolean }) => {
      const silent = options?.silent === true;
      setRefreshingModels(true);
      try {
        const result = await service.refreshProviderModels(providerId);
        if (providerId === 'codex') await loadCodexSettings();
        else if (providerId === 'claude') await loadClaudeSettings();
        else await loadGeminiSettings();
        if (!silent) {
          pushToast(result.refreshed ? 'success' : 'error', 'Models refreshed', result.detail);
        }
      } catch {
        // Auto-refresh failures stay quiet — the cached list is still shown; the manual button
        // (which surfaces errors) remains available.
        if (!silent) {
          pushToast('error', 'Refresh failed', 'Could not refresh the model list.');
        }
      } finally {
        setRefreshingModels(false);
      }
    },
    [service, loadCodexSettings, loadClaudeSettings, loadGeminiSettings, pushToast]
  );

  // Auto-refresh the active provider's model list from its CLI on first activation this session, so
  // landing on / switching to an agent shows its latest models without a manual "Refresh models".
  // Guarded to once per provider per session (see autoRefreshedModelsRef) to avoid re-spawning the
  // CLI on every switch. Gemini is excluded (connect is disabled; its aliases already track latest).
  useEffect(() => {
    if (activeProviderId !== 'codex' && activeProviderId !== 'claude') {
      return;
    }
    if (autoRefreshedModelsRef.current.has(activeProviderId)) {
      return;
    }
    autoRefreshedModelsRef.current.add(activeProviderId);
    void handleRefreshModels(activeProviderId, { silent: true });
  }, [activeProviderId, handleRefreshModels]);

  // Run the provider CLI's own self-update, then refresh its models (a newer CLI may add models).
  const handleUpdateCli = useCallback(
    async (providerId: AssistantProviderId) => {
      setBusyLabel(`Updating ${getProviderLabel(providerId)} CLI...`);
      try {
        const result = await service.updateProviderCli(providerId);
        pushToast(
          result.ok ? 'success' : 'error',
          result.ok ? 'CLI updated' : 'Update finished',
          result.message
        );
        await handleRefreshModels(providerId);
      } catch {
        pushToast('error', 'Update failed', 'Could not run the CLI update.');
      } finally {
        setBusyLabel('');
      }
    },
    [service, pushToast, handleRefreshModels]
  );

  const handleProviderSwitch = useCallback(
    async (providerId: AssistantProviderId) => {
      setBusyLabel(`Switching to ${getProviderLabel(providerId)}...`);
      try {
        const assistantProviders = await service.setActiveProvider(providerId);
        setStatus((current) => (current ? { ...current, assistantProviders } : current));
        await refreshStatus();
        pushToast(
          'success',
          'Provider switched',
          `Switched to ${assistantProviders.activeProvider?.name ?? getProviderLabel(providerId)}.`
        );
      } catch (err) {
        pushToast(
          'error',
          'Provider switch failed',
          err instanceof Error ? err.message : 'Unable to switch provider.'
        );
      } finally {
        setBusyLabel('');
      }
    },
    [service, setStatus, refreshStatus, pushToast]
  );

  const handleProviderConnect = useCallback(
    async (providerId: AssistantProviderId) => {
      setBusyLabel(`Connecting ${getProviderLabel(providerId)}...`);
      try {
        await service.connectProvider(providerId);
        await refreshStatus();
        pushToast(
          'success',
          'Provider connected',
          `${getProviderLabel(providerId)} is connected. Switch to it from the top bar when you want to use it.`
        );
      } catch (err) {
        pushToast(
          'error',
          'Connect failed',
          err instanceof Error ? err.message : 'Login to this provider first.'
        );
      } finally {
        setBusyLabel('');
      }
    },
    [service, refreshStatus, pushToast]
  );

  const handleProviderDisconnect = useCallback(
    async (providerId: AssistantProviderId) => {
      setBusyLabel(`Disconnecting ${getProviderLabel(providerId)}...`);
      try {
        await service.disconnectProvider(providerId);
        await refreshStatus();
        pushToast(
          'info',
          `${getProviderLabel(providerId)} disconnected`,
          'Your local project history is still preserved.'
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to disconnect provider.');
      } finally {
        setBusyLabel('');
      }
    },
    [service, refreshStatus, pushToast]
  );

  const handleSaveProject = useCallback(
    async (projectRoot: string) => {
      if (!projectRoot.trim()) return;
      setBusyLabel('Connecting workspace...');
      try {
        const result = await service.setProjectRoot(projectRoot.trim());
        setStatus((current) => (current ? { ...current, workspace: result.workspace } : current));
        await refreshStatus();
        pushToast(
          'success',
          'Workspace connected',
          `Project set to ${result.workspace.projectRoot ?? projectRoot}.`
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to set project root.');
      } finally {
        setBusyLabel('');
      }
    },
    [service, setStatus, refreshStatus, pushToast]
  );

  const handleToggleWriteAccess = useCallback(
    async (enabled: boolean) => {
      setBusyLabel(enabled ? 'Enabling write access...' : 'Disabling write access...');
      try {
        const result = await service.setWriteAccess(enabled);
        setStatus((current) => (current ? { ...current, workspace: result.workspace } : current));
        pushToast(
          'info',
          enabled ? 'Write access enabled' : 'Write access disabled',
          'Workspace sandbox updated.'
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to change write access.');
      } finally {
        setBusyLabel('');
      }
    },
    [service, setStatus, pushToast]
  );

  const handleResetApp = useCallback(async () => {
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        'Reset Oplyr completely?\n\n' +
          'This permanently erases EVERYTHING on this machine:\n' +
          '• Your Brain — every learned memory and preference\n' +
          '• All chats, voice sessions, approvals, and diffs\n' +
          '• The connected workspace/project and all settings\n' +
          "• Onboarding progress — you'll start over from setup\n\n" +
          'This cannot be undone. Continue?'
      )
    ) {
      return false;
    }

    setBusyLabel('Resetting Oplyr...');
    setError('');
    try {
      await service.resetApp();

      // The server reset clears runtime.db + brain.db, but local UI state (onboarding flags,
      // preferences, tours, theme, nav) lives in localStorage — leaving it behind meant the app
      // never truly started fresh. Wipe every oplyr-* key, then hard-reload so every provider
      // re-reads cleared state and the app boots into onboarding as if freshly installed.
      if (typeof window !== 'undefined') {
        try {
          const staleKeys: string[] = [];
          for (let i = 0; i < window.localStorage.length; i += 1) {
            const key = window.localStorage.key(i);
            if (key && key.toLowerCase().startsWith('oplyr')) staleKeys.push(key);
          }
          staleKeys.forEach((key) => window.localStorage.removeItem(key));
        } catch {
          /* localStorage may be unavailable; the server-side reset still stands */
        }
        window.location.reload();
        return true;
      }

      setOnboardingStep(1);
      setOnboardingSelectedProviderId(null);
      await initialize();
      pushToast('info', 'Oplyr reset', 'All local app data has been cleared.');
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reset Oplyr.');
      pushToast('error', 'Reset failed', err instanceof Error ? err.message : 'Unable to reset.');
      return false;
    } finally {
      setBusyLabel('');
    }
  }, [service, initialize, pushToast]);

  const handleOnboardingDisplayNameSubmit = useCallback(
    async (displayName: string) => {
      const trimmed = displayName.trim();
      if (!trimmed) return;

      const welcomedAt = status?.appSettings?.welcomedAt ?? new Date().toISOString();

      try {
        setOnboardingSavingDisplayName(true);
        setError('');
        const nextSettings = await service.updateAppSettings({
          displayName: trimmed,
          welcomedAt
        });
        setStatus((current) => (current ? { ...current, appSettings: nextSettings } : current));
        setOnboardingStep(2);
      } catch (err) {
        setOnboardingStep(1);
        setError(err instanceof Error ? err.message : 'Unable to save your name.');
        pushToast(
          'error',
          'Welcome setup failed',
          'Oplyr could not save your first-run profile yet.'
        );
      } finally {
        setOnboardingSavingDisplayName(false);
      }
    },
    [service, setStatus, pushToast, status?.appSettings?.welcomedAt]
  );

  return {
    codexSettings,
    claudeSettings,
    geminiSettings,
    providerUsage,
    providerUsageLoading,
    voiceSettings,
    busyLabel,
    error,
    onboardingSavingDisplayName,
    onboardingStep,
    onboardingSelectedProviderId,
    onboardingProjectDismissed,
    dismissOnboardingProject,
    restoreOnboardingProject,
    onboardingPetChosen,
    dismissOnboardingPet,
    setOnboardingStep,
    setOnboardingSelectedProviderId,
    handleAppSettingChange,
    handleVoiceSettingChange,
    handleCodexSettingChange,
    handleClaudeSettingChange,
    handleGeminiSettingChange,
    handleSelectModel,
    handleSelectReasoningEffort,
    refreshingModels,
    handleRefreshModels,
    handleUpdateCli,
    handleSaveCodexSettings,
    handleSaveClaudeSettings,
    handleSaveGeminiSettings,
    codexSettingsDirty,
    claudeSettingsDirty,
    geminiSettingsDirty,
    handleProviderSwitch,
    handleProviderConnect,
    handleProviderDisconnect,
    handleSaveProject,
    handleToggleWriteAccess,
    handleResetApp,
    handleOnboardingDisplayNameSubmit,
    initialize,
    loadCodexSettings,
    loadClaudeSettings,
    loadGeminiSettings,
    loadProviderUsage,
    loadVoiceSettings
  };
}

function getProviderLabel(providerId: AssistantProviderId) {
  if (providerId === 'claude') {
    return 'Claude Code';
  }

  if (providerId === 'gemini') {
    return 'Gemini CLI';
  }

  return 'Codex';
}
