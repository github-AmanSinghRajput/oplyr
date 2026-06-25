import { useCallback, useEffect, useState } from 'react';
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
  onboardingStep: 1 | 2 | 3;
  onboardingSelectedProviderId: AssistantProviderId | null;
  setOnboardingStep: (step: 1 | 2 | 3) => void;
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
  handleProviderSwitch: (providerId: AssistantProviderId) => Promise<void>;
  handleProviderConnect: (providerId: AssistantProviderId) => Promise<void>;
  handleProviderDisconnect: (providerId: AssistantProviderId) => Promise<void>;
  handleSaveProject: (projectRoot: string) => Promise<void>;
  handleToggleWriteAccess: (enabled: boolean) => Promise<void>;
  handleResetApp: () => Promise<void>;
  handleOnboardingDisplayNameSubmit: (displayName: string) => Promise<void>;
  initialize: () => Promise<void>;
  loadCodexSettings: () => Promise<void>;
  loadClaudeSettings: () => Promise<void>;
  loadGeminiSettings: () => Promise<void>;
  loadProviderUsage: () => Promise<void>;
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
  const [onboardingStep, setOnboardingStep] = useState<1 | 2 | 3>(1);
  const [onboardingSelectedProviderId, setOnboardingSelectedProviderId] =
    useState<AssistantProviderId | null>(null);
  const activeProviderId = status?.assistantProviders.activeProviderId ?? null;

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

  const loadProviderUsage = useCallback(async () => {
    if (!activeProviderId) {
      setProviderUsage(null);
      setProviderUsageLoading(false);
      return;
    }

    setProviderUsageLoading(true);
    try {
      const next = await service.getAssistantUsage();
      setProviderUsage(next.usage);
    } catch {
      setProviderUsage(null);
    } finally {
      setProviderUsageLoading(false);
    }
  }, [activeProviderId, service]);

  const initialize = useCallback(async () => {
    await Promise.allSettled([refreshStatus(), loadVoiceSettings()]);
  }, [refreshStatus, loadVoiceSettings]);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  useEffect(() => {
    const hasDisplayName = Boolean(status?.appSettings.displayName?.trim());

    if (!hasDisplayName) {
      setOnboardingStep(1);
      setOnboardingSelectedProviderId(null);
      return;
    }

    if (!activeProviderId) {
      setOnboardingStep(2);
      setOnboardingSelectedProviderId(null);
      return;
    }

    setOnboardingStep((current) => (current === 1 ? 2 : current));
    setOnboardingSelectedProviderId(activeProviderId);
  }, [activeProviderId, status?.appSettings.displayName]);

  useEffect(() => {
    if (activeProviderId === 'codex') {
      setClaudeSettings(null);
      setGeminiSettings(null);
      void loadCodexSettings();
      setProviderUsage(null);
      setProviderUsageLoading(false);
      return;
    }

    if (activeProviderId === 'claude') {
      setCodexSettings(null);
      setGeminiSettings(null);
      void loadClaudeSettings();
      setProviderUsage(null);
      setProviderUsageLoading(false);
      return;
    }

    if (activeProviderId === 'gemini') {
      setCodexSettings(null);
      setClaudeSettings(null);
      void loadGeminiSettings();
      setProviderUsage(null);
      setProviderUsageLoading(false);
      return;
    }

    setCodexSettings(null);
    setClaudeSettings(null);
    setGeminiSettings(null);
    setProviderUsage(null);
    setProviderUsageLoading(false);
  }, [activeProviderId, loadClaudeSettings, loadCodexSettings, loadGeminiSettings]);

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
          `${getProviderLabel(providerId)} is now active in Oplyr.`
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
        'Reset Oplyr completely?\n\nThis clears workspace data, chat history, notes, approvals, settings, and app-connected providers.'
      )
    ) {
      return;
    }

    setBusyLabel('Resetting Oplyr...');
    setError('');
    try {
      await service.resetApp();
      setOnboardingStep(1);
      setOnboardingSelectedProviderId(null);
      await initialize();
      pushToast('info', 'Oplyr reset', 'All local app data has been cleared.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reset Oplyr.');
      pushToast('error', 'Reset failed', err instanceof Error ? err.message : 'Unable to reset.');
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
    setOnboardingStep,
    setOnboardingSelectedProviderId,
    handleAppSettingChange,
    handleVoiceSettingChange,
    handleCodexSettingChange,
    handleClaudeSettingChange,
    handleGeminiSettingChange,
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
