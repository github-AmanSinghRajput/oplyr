import { useCallback, useEffect, useState } from 'react';
import { useApi } from '@/providers/ApiProvider';
import { useStatus } from '@/providers/StatusProvider';
import { useToast } from '@/providers/ToastProvider';
import type {
  AppSettings,
  AssistantProviderId,
  ClaudeSettingsResponse,
  CodexSettingsResponse,
  VoiceSettings,
  VoiceSettingsResponse
} from '@/containers/voice-console/lib/types';

export interface AppSettingsHandle {
  codexSettings: CodexSettingsResponse | null;
  claudeSettings: ClaudeSettingsResponse | null;
  voiceSettings: VoiceSettingsResponse | null;
  busyLabel: string;
  error: string;
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
  ) => Promise<void>;
  handleClaudeSettingChange: (
    key: keyof ClaudeSettingsResponse['settings'],
    value: ClaudeSettingsResponse['settings'][keyof ClaudeSettingsResponse['settings']]
  ) => Promise<void>;
  handleProviderChange: (providerId: AssistantProviderId) => Promise<void>;
  handleProviderConnect: (providerId: AssistantProviderId) => Promise<void>;
  handleProviderDisconnect: (providerId: AssistantProviderId) => Promise<void>;
  handleSaveProject: (projectRoot: string) => Promise<void>;
  handleToggleWriteAccess: (enabled: boolean) => Promise<void>;
  handleResetApp: () => Promise<void>;
  handleOnboardingDisplayNameSubmit: (displayName: string) => Promise<void>;
  initialize: () => Promise<void>;
  loadCodexSettings: () => Promise<void>;
  loadClaudeSettings: () => Promise<void>;
  loadVoiceSettings: () => Promise<void>;
}

export function useAppSettings(): AppSettingsHandle {
  const { service } = useApi();
  const { setStatus, refreshStatus } = useStatus();
  const { pushToast } = useToast();

  const [codexSettings, setCodexSettings] = useState<CodexSettingsResponse | null>(null);
  const [claudeSettings, setClaudeSettings] = useState<ClaudeSettingsResponse | null>(null);
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettingsResponse | null>(null);
  const [busyLabel, setBusyLabel] = useState('');
  const [error, setError] = useState('');
  const [onboardingStep, setOnboardingStep] = useState<1 | 2 | 3>(1);
  const [onboardingSelectedProviderId, setOnboardingSelectedProviderId] =
    useState<AssistantProviderId | null>(null);

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
    } catch {
      // non-critical
    }
  }, [service]);

  const loadClaudeSettings = useCallback(async () => {
    try {
      const next = await service.getClaudeSettings();
      setClaudeSettings(next);
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

  const initialize = useCallback(async () => {
    await Promise.allSettled([
      refreshStatus(),
      loadCodexSettings(),
      loadClaudeSettings(),
      loadVoiceSettings()
    ]);
  }, [refreshStatus, loadCodexSettings, loadClaudeSettings, loadVoiceSettings]);

  useEffect(() => {
    void initialize();
  }, [initialize]);

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
    async (
      key: keyof CodexSettingsResponse['settings'],
      value: CodexSettingsResponse['settings'][keyof CodexSettingsResponse['settings']]
    ) => {
      if (!codexSettings) return;

      setCodexSettings({ ...codexSettings, settings: { ...codexSettings.settings, [key]: value } });
      try {
        const next = await service.updateCodexSettings({ [key]: value });
        setCodexSettings(next);
      } catch {
        pushToast('error', 'Model overrides not saved', 'Codex preferences could not be updated.');
        await loadCodexSettings();
      }
    },
    [service, codexSettings, pushToast, loadCodexSettings]
  );

  const handleClaudeSettingChange = useCallback(
    async (
      key: keyof ClaudeSettingsResponse['settings'],
      value: ClaudeSettingsResponse['settings'][keyof ClaudeSettingsResponse['settings']]
    ) => {
      if (!claudeSettings) return;

      setClaudeSettings({
        ...claudeSettings,
        settings: { ...claudeSettings.settings, [key]: value }
      });
      try {
        const next = await service.updateClaudeSettings({ [key]: value });
        setClaudeSettings(next);
      } catch {
        pushToast('error', 'Claude model not saved', 'Claude preferences could not be updated.');
        await loadClaudeSettings();
      }
    },
    [service, claudeSettings, pushToast, loadClaudeSettings]
  );

  const handleProviderChange = useCallback(
    async (providerId: AssistantProviderId) => {
      setBusyLabel(`Switching to ${providerId === 'claude' ? 'Claude Code' : 'Codex'}...`);
      try {
        const assistantProviders = await service.setActiveProvider(providerId);
        setStatus((current) => (current ? { ...current, assistantProviders } : current));
        await refreshStatus();
        pushToast(
          'success',
          'Provider switched',
          `${assistantProviders.activeProvider?.name ?? 'Assistant'} is now active.`
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
      setBusyLabel(`Connecting ${providerId === 'claude' ? 'Claude Code' : 'Codex'}...`);
      try {
        await service.connectProvider(providerId);
        await refreshStatus();
        pushToast(
          'success',
          'Provider connected',
          `${providerId === 'claude' ? 'Claude Code' : 'Codex'} is now available.`
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
      setBusyLabel(`Disconnecting ${providerId === 'claude' ? 'Claude Code' : 'Codex'}...`);
      try {
        await service.disconnectProvider(providerId);
        await refreshStatus();
        pushToast(
          'info',
          `${providerId === 'claude' ? 'Claude Code' : 'Codex'} disconnected`,
          'The app-level connection has been removed.'
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
        'Reset VOCOD completely?\n\nThis clears workspace data, chat history, notes, approvals, settings, and app-connected providers.'
      )
    ) {
      return;
    }

    setBusyLabel('Resetting VOCOD...');
    setError('');
    try {
      await service.resetApp();
      setOnboardingStep(1);
      setOnboardingSelectedProviderId(null);
      await initialize();
      pushToast('info', 'VOCOD reset', 'All local app data has been cleared.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reset VOCOD.');
      pushToast('error', 'Reset failed', err instanceof Error ? err.message : 'Unable to reset.');
    } finally {
      setBusyLabel('');
    }
  }, [service, initialize, pushToast]);

  const handleOnboardingDisplayNameSubmit = useCallback(
    async (displayName: string) => {
      const trimmed = displayName.trim();
      if (!trimmed) return;

      try {
        setOnboardingStep(2);
        const nextSettings = await service.updateAppSettings({ displayName: trimmed });
        setStatus((current) => (current ? { ...current, appSettings: nextSettings } : current));

        if (!nextSettings.welcomedAt) {
          const welcomed = await service.updateAppSettings({
            welcomedAt: new Date().toISOString()
          });
          setStatus((current) => (current ? { ...current, appSettings: welcomed } : current));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to save your name.');
        pushToast(
          'error',
          'Welcome setup failed',
          'VOCOD could not save your first-run profile yet.'
        );
      }
    },
    [service, setStatus, pushToast]
  );

  return {
    codexSettings,
    claudeSettings,
    voiceSettings,
    busyLabel,
    error,
    onboardingStep,
    onboardingSelectedProviderId,
    setOnboardingStep,
    setOnboardingSelectedProviderId,
    handleAppSettingChange,
    handleVoiceSettingChange,
    handleCodexSettingChange,
    handleClaudeSettingChange,
    handleProviderChange,
    handleProviderConnect,
    handleProviderDisconnect,
    handleSaveProject,
    handleToggleWriteAccess,
    handleResetApp,
    handleOnboardingDisplayNameSubmit,
    initialize,
    loadCodexSettings,
    loadClaudeSettings,
    loadVoiceSettings
  };
}
