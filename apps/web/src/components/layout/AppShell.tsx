import {
  Suspense,
  lazy,
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { ContentFrame } from './ContentFrame';
import { ProductTourOverlay } from '@/components/tour/ProductTourOverlay';
import { useNavigation } from '@/providers/NavigationProvider';
import { useStatus } from '@/providers/StatusProvider';
import { useToast } from '@/providers/ToastProvider';
import { useTheme } from '@/providers/ThemeProvider';
import { useApproval } from '@/providers/ApprovalProvider';
import { useApi } from '@/providers/ApiProvider';
import { useChatStream } from '@/hooks/use-chat-stream';
import { useVoiceSession } from '@/hooks/use-voice-session';
import { useAppSettings, type AppSettingsHandle } from '@/hooks/use-app-settings';
import { usePreferences } from '@/hooks/use-preferences';
import { Music } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { StandbyScreen } from '@/components/screens/StandbyScreen';
import { OplyrLogoMark } from '@/components/branding/OplyrLogoMark';
import { UpdateBanner } from '@/components/layout/UpdateBanner';
import { cn } from '@/lib/cn';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { formatReasoningEffort, getVoiceState } from '@/containers/voice-console/lib/helpers';
import type { VoiceAssistantInfo } from '@/components/screens/VoiceScreen';
import type {
  MessageEntry,
  StatusResponse,
  VoiceBootstrapStatus
} from '@/containers/voice-console/lib/types';

const ChatScreen = lazy(() =>
  import('@/components/screens/ChatScreen').then((m) => ({ default: m.ChatScreen }))
);
const VoiceScreen = lazy(() =>
  import('@/components/screens/VoiceScreen').then((m) => ({ default: m.VoiceScreen }))
);
const ReviewScreen = lazy(() =>
  import('@/components/screens/ReviewScreen').then((m) => ({ default: m.ReviewScreen }))
);
const WorkspaceScreen = lazy(() =>
  import('@/components/screens/WorkspaceScreen').then((m) => ({ default: m.WorkspaceScreen }))
);
const ShellScreen = lazy(() =>
  import('@/components/screens/ShellScreen').then((m) => ({ default: m.ShellScreen }))
);
const SettingsScreen = lazy(() =>
  import('@/components/screens/SettingsScreen').then((m) => ({ default: m.SettingsScreen }))
);
const OnboardingScreen = lazy(() =>
  import('@/components/screens/OnboardingScreen').then((m) => ({ default: m.OnboardingScreen }))
);
const MeetingsScreen = lazy(() =>
  import('@/components/screens/MeetingsScreen').then((m) => ({ default: m.MeetingsScreen }))
);
const MarkdownScreen = lazy(() =>
  import('@/components/screens/MarkdownScreen').then((m) => ({ default: m.MarkdownScreen }))
);
const CodebaseMapScreen = lazy(() =>
  import('@/components/screens/CodebaseMapScreen').then((m) => ({ default: m.CodebaseMapScreen }))
);
const MemoryScreen = lazy(() =>
  import('@/components/screens/MemoryScreen').then((m) => ({ default: m.MemoryScreen }))
);

function shouldPollVoiceBootstrap(status: VoiceBootstrapStatus | null) {
  if (!status) {
    return true;
  }

  return !['ready', 'failed'].includes(status.phase);
}

function ScreenFallback() {
  return (
    <div className="flex flex-col gap-4 p-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full rounded-[var(--radius-panel)]" />
    </div>
  );
}

function VoiceBootstrapScreen({
  status,
  onRetry
}: {
  status: VoiceBootstrapStatus | null;
  onRetry: () => void;
}) {
  const phase = status?.phase ?? 'idle';

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-3xl rounded-[calc(var(--radius-panel)+8px)] border border-border bg-surface-1 p-10">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-[24px] bg-surface-2 ring-1 ring-border">
          <OplyrLogoMark className="h-12 w-12" />
        </div>
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="mb-2 text-2xl font-semibold text-text-primary">
            {phase === 'failed'
              ? 'Local voice setup needs attention'
              : 'Warming up the speech models'}
          </h1>
          <p className="mb-6 text-sm text-text-secondary">
            {status?.message ??
              'Warming up the speech models Oplyr needs before onboarding becomes interactive.'}
          </p>
        </div>

        <div className="mx-auto mb-8 max-w-2xl">
          <div className="mb-3 flex items-center justify-between text-xs uppercase tracking-[0.2em] text-text-tertiary">
            <span>
              {phase === 'installing' ? 'Installing speech models' : 'Warming up speech models'}
            </span>
            <span>{status?.progressPercent ?? 0}%</span>
          </div>
          <div className="overflow-hidden rounded-full border border-border bg-surface-2">
            <motion.div
              animate={{ width: `${status?.progressPercent ?? 0}%` }}
              className="h-3 rounded-full bg-accent"
              transition={{ duration: 0.35, ease: 'easeOut' }}
            />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {(status?.steps ?? []).map((step) => (
            <div
              key={step.id}
              className={cn(
                'rounded-[calc(var(--radius-panel)-2px)] border px-4 py-4 text-left transition-colors',
                step.state === 'completed' && 'border-success/30 bg-success-muted/40',
                step.state === 'running' && 'border-accent-border bg-accent-muted/40',
                step.state === 'failed' && 'border-danger/30 bg-danger-muted/40',
                step.state === 'pending' && 'border-border bg-surface-2',
                step.state === 'skipped' && 'border-border/60 bg-surface-2/50 opacity-75'
              )}
            >
              <div className="mb-2 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-text-primary">{step.label}</p>
                  <p className="text-xs text-text-secondary">{step.description}</p>
                </div>
                <span
                  className={cn(
                    'inline-flex min-w-[5.5rem] justify-center rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.16em]',
                    step.state === 'completed' && 'bg-success-muted text-success',
                    step.state === 'running' && 'bg-accent-muted text-accent',
                    step.state === 'failed' && 'bg-danger-muted text-danger',
                    (step.state === 'pending' || step.state === 'skipped') &&
                      'bg-surface-3 text-text-tertiary'
                  )}
                >
                  {step.state.replace('_', ' ')}
                </span>
              </div>
              {step.detail && <p className="text-sm text-text-secondary">{step.detail}</p>}
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-[var(--radius-control)] border border-border bg-surface-2 px-4 py-3 text-sm text-text-secondary">
          <p className="font-medium text-text-primary">Voice assets location</p>
          <p className="mt-1 break-all">
            {status?.installRoot || 'Waiting for the Oplyr user data directory.'}
          </p>
        </div>

        {status?.error && (
          <div className="mt-6 rounded-[var(--radius-control)] border border-danger/30 bg-danger-muted p-4 text-sm text-danger">
            {status.error}
          </div>
        )}

        {phase === 'failed' && (
          <button
            className="mt-6 inline-flex h-10 items-center justify-center rounded-radius-control bg-accent px-5 py-2 text-sm font-medium text-background transition-colors hover:bg-accent/90"
            onClick={onRetry}
            type="button"
          >
            Retry voice setup
          </button>
        )}
      </div>
    </div>
  );
}

function getProviderName(status: StatusResponse | null) {
  return status?.assistantProviders.activeProvider?.name ?? 'Assistant';
}

function getVoiceAssistant(
  status: StatusResponse | null,
  settings: AppSettingsHandle
): VoiceAssistantInfo | null {
  const provider = status?.assistantProviders.activeProvider;
  if (!provider) {
    return null;
  }

  let model: string | null = null;

  if (provider.id === 'codex') {
    const codex = settings.codexSettings?.settings;
    if (codex?.model) {
      model = codex.reasoningEffort
        ? `${codex.model} (${formatReasoningEffort(codex.reasoningEffort).toLowerCase()})`
        : codex.model;
    }
  } else if (provider.id === 'claude') {
    model = settings.claudeSettings?.settings.model ?? null;
  } else if (provider.id === 'gemini') {
    model = settings.geminiSettings?.settings.model ?? null;
  }

  if (!model) {
    model = settings.providerUsage?.model ?? null;
  }

  return { id: provider.id, name: provider.name, model };
}

export function AppShell() {
  const { activeScreen, setActiveScreen } = useNavigation();
  // The integrated shell is mounted once (on first open) and then kept alive — hidden, not
  // unmounted — when you navigate away, so its pty/process survives page switches.
  const [shellEverOpened, setShellEverOpened] = useState(false);
  useEffect(() => {
    if (activeScreen === 'shell') setShellEverOpened(true);
  }, [activeScreen]);
  const { status, refreshStatus, assistantReady } = useStatus();
  const { theme } = useTheme();
  const { toasts, pushToast } = useToast();
  const { baseUrl, service } = useApi();
  const { approvals, handleApprove, handleReject, isApproving, isRejecting } = useApproval();
  const chat = useChatStream();
  const { loadLogs } = chat;
  const settings = useAppSettings();
  const { preferences, setPreference } = usePreferences();
  const voice = useVoiceSession({
    chat,
    voiceSettings: settings.voiceSettings,
    autoSend: preferences.autoSendVoice
  });

  // Full app refresh (topbar refresh button): re-pull everything live in parallel — status,
  // workspace, chat history, the active agent's model/effort settings, usage, voice settings — and
  // bump a nonce the Memory screen watches to re-fetch the brain graph. Best-effort (allSettled) so
  // one slow/failing fetch (e.g. the ~15s Codex usage scrape) never blocks the rest.
  const [fullRefreshing, setFullRefreshing] = useState(false);
  const [brainRefreshNonce, setBrainRefreshNonce] = useState(0);
  const handleFullRefresh = useCallback(async () => {
    if (fullRefreshing) return;
    setFullRefreshing(true);
    const activeId = status?.assistantProviders.activeProviderId ?? null;
    try {
      await Promise.allSettled([
        refreshStatus(),
        loadLogs(),
        settings.loadVoiceSettings(),
        settings.loadProviderUsage(),
        activeId === 'codex'
          ? settings.loadCodexSettings()
          : activeId === 'claude'
            ? settings.loadClaudeSettings()
            : activeId === 'gemini'
              ? settings.loadGeminiSettings()
              : Promise.resolve()
      ]);
      setBrainRefreshNonce((nonce) => nonce + 1);
    } finally {
      setFullRefreshing(false);
    }
  }, [
    fullRefreshing,
    status?.assistantProviders.activeProviderId,
    refreshStatus,
    loadLogs,
    settings
  ]);

  const handleResetApp = useCallback(async () => {
    const didReset = await settings.handleResetApp();
    if (!didReset) return;

    chat.resetChatState();
    startTransition(() => setActiveScreen('workspace'));
  }, [chat, settings, setActiveScreen]);

  const handleReviewApprove = useCallback(async () => {
    const approved = await handleApprove();
    if (!approved) return;
    // In 'auto' model mode the backend runs edits on the strongest model — surface which one, so the
    // automatic upgrade is transparent (the frontend knows the top model from the provider's options).
    const providerId = status?.assistantProviders.activeProviderId ?? null;
    let modelNote: string | null = null;
    if (providerId === 'codex' && settings.codexSettings?.settings.voiceModelMode === 'auto') {
      const opts = settings.codexSettings.options.models;
      const strong =
        opts.find(
          (o) => !/\b(mini|nano|small|flash|fast|lite)\b/i.test(`${o.slug} ${o.displayName}`)
        ) ?? opts[0];
      if (strong) modelNote = `Used ${strong.displayName} for this edit.`;
    } else if (
      providerId === 'claude' &&
      settings.claudeSettings?.settings.voiceModelMode === 'auto'
    ) {
      const opus = settings.claudeSettings.options.models.find((o) => o.slug === 'opus');
      if (opus) modelNote = `Used ${opus.displayName} for this edit.`;
    }
    if (modelNote) pushToast('info', 'Top model for this edit', modelNote);
    await loadLogs();
    startTransition(() => setActiveScreen('voice'));
  }, [handleApprove, loadLogs, setActiveScreen, status, settings, pushToast]);

  const handleReviewReject = useCallback(
    async (feedback?: string) => {
      const rejected = await handleReject(feedback);
      if (!rejected) return;
      await loadLogs();
      if (!feedback?.trim()) {
        startTransition(() => setActiveScreen('voice'));
      }
    },
    [handleReject, loadLogs, setActiveScreen]
  );

  useKeyboardShortcuts(setActiveScreen);

  const chatHistoryLoadedRef = useRef(false);
  useEffect(() => {
    if (chatHistoryLoadedRef.current) return;
    chatHistoryLoadedRef.current = true;
    void chat.loadLogs();
  }, [chat]);

  const displayName = status?.appSettings.displayName ?? null;
  const voiceState = getVoiceState(status);
  // "Agent busy" = a turn is in flight: a chat reply is streaming, or the voice session is
  // thinking/responding. While busy we block switching the active agent, model, or reasoning effort
  // — changing any of those mid-turn would apply to a request already running and corrupt it.
  const agentBusy = chat.isStreaming || voiceState === 'thinking' || voiceState === 'speaking';
  const guardWhileBusy = useCallback(
    (what: 'agent' | 'model' | 'reasoning effort', run: () => void) => {
      if (agentBusy) {
        pushToast(
          'info',
          'Agent is working',
          `Wait for the current turn to finish before changing the ${what}.`
        );
        return;
      }
      run();
    },
    [agentBusy, pushToast]
  );
  const lastAssistant = [...chat.messages].reverse().find((m) => m.role === 'assistant') ?? null;
  const lastUser = [...chat.messages].reverse().find((m) => m.role === 'user') ?? null;
  // Transcript shown on the voice screen. While a voice turn is live (recording, or the voice session
  // is mid-flight), show the streaming/just-spoken transcript. Otherwise fall back to the latest user
  // message from the shared chat history, so the voice view stays in sync with the chat — including
  // typed messages — instead of lingering on a stale earlier voice transcript.
  const voiceTurnLive = voice.isRecording || status?.voiceSession?.active === true;
  const voiceUserTranscript =
    (voiceTurnLive ? voice.streamedTranscriptOverride : '') ||
    lastUser?.text ||
    voice.streamedTranscriptOverride ||
    status?.voiceSession?.lastTranscript ||
    '';
  // Chat + voice share ONE turn state (the chat hook). The voice view reflects the same turn no
  // matter where it was started: while a turn is active, show the streaming assistant message (empty
  // until text arrives → the working timeline shows); otherwise the last completed reply. Hidden
  // while recording a new command so the previous answer never lingers.
  const streamingAssistant = chat.activeChatStreamMessageId
    ? (chat.messages.find((m) => m.id === chat.activeChatStreamMessageId) ?? null)
    : null;
  const voiceReply: MessageEntry | null = voice.isRecording
    ? null
    : chat.isTurnActive
      ? streamingAssistant
      : lastAssistant;
  const [projectInput, setProjectInput] = useState(status?.workspace.projectRoot ?? '');
  const [voiceBootstrap, setVoiceBootstrap] = useState<VoiceBootstrapStatus | null>(null);
  const bootstrapRequestedRef = useRef(false);
  const statusRefreshedAfterBootstrapRef = useRef(false);
  // Onboarding runs until: name set + an agent connected + the first-project step resolved
  // (a project is connected, OR the user skipped it). The project step is the final, skippable nudge.
  const projectConnected = Boolean(status?.workspace.projectRoot);
  const onboardingRequired =
    !displayName?.trim() ||
    !assistantReady ||
    (!projectConnected && !settings.onboardingProjectDismissed);

  useEffect(() => {
    setProjectInput(status?.workspace.projectRoot ?? '');
  }, [status?.workspace.projectRoot]);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: number | null = null;

    const pollStatus = async () => {
      try {
        const next = await service.getVoiceBootstrapStatus();
        if (cancelled) return;
        setVoiceBootstrap(next.bootstrap);

        if (next.bootstrap.phase === 'ready' && !statusRefreshedAfterBootstrapRef.current) {
          statusRefreshedAfterBootstrapRef.current = true;
          await refreshStatus();
          return;
        }

        if (shouldPollVoiceBootstrap(next.bootstrap)) {
          timeoutId = window.setTimeout(() => {
            void pollStatus();
          }, 900);
        }
      } catch (error) {
        if (cancelled) return;
        setVoiceBootstrap((current) => ({
          phase: 'failed',
          progressPercent: current?.progressPercent ?? 0,
          message: 'Oplyr could not read the voice bootstrap status.',
          error: error instanceof Error ? error.message : 'Unable to inspect local voice setup.',
          installRoot: current?.installRoot ?? '',
          seedRoot: current?.seedRoot ?? null,
          steps: current?.steps ?? [],
          updatedAt: new Date().toISOString()
        }));
      }
    };

    const startBootstrap = async () => {
      if (!bootstrapRequestedRef.current) {
        bootstrapRequestedRef.current = true;
        statusRefreshedAfterBootstrapRef.current = false;

        try {
          const started = await service.startVoiceBootstrap();
          if (!cancelled) {
            setVoiceBootstrap(started.bootstrap);
          }
        } catch (error) {
          if (!cancelled) {
            setVoiceBootstrap((current) => ({
              phase: 'failed',
              progressPercent: current?.progressPercent ?? 0,
              message: 'Oplyr could not start local voice setup.',
              error:
                error instanceof Error
                  ? error.message
                  : 'Unable to start the voice bootstrap flow.',
              installRoot: current?.installRoot ?? '',
              seedRoot: current?.seedRoot ?? null,
              steps: current?.steps ?? [],
              updatedAt: new Date().toISOString()
            }));
          }
        }
      }

      await pollStatus();
    };

    void startBootstrap();

    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [refreshStatus, service]);

  useEffect(() => {
    if (
      activeScreen === 'settings' &&
      status?.assistantProviders.activeProviderId &&
      !settings.providerUsage &&
      !settings.providerUsageLoading
    ) {
      void settings.loadProviderUsage();
    }
  }, [activeScreen, settings, status?.assistantProviders.activeProviderId]);

  function handleTextSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Single-flight: one agent turn at a time (chat OR voice) so history never interleaves.
    if (chat.isSubmittingTurn || chat.isTurnActive) return;

    const nextMessage = chat.textInput.trim();
    if (!nextMessage && chat.draftAttachments.length === 0) return;

    const previousText = chat.textInput;
    const previousAttachments = chat.draftAttachments;
    chat.setTextInput('');
    chat.setDraftAttachments([]);

    const doSubmit = async () => {
      try {
        const result = await chat.streamChatMessage(nextMessage, 'text', {
          attachmentIds: previousAttachments.map((a) => a.id)
        });
        await refreshStatus();
        startTransition(() => {
          setActiveScreen(result.type === 'approval_required' ? 'review' : 'terminal');
        });
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          chat.setTextInput(previousText);
          chat.setDraftAttachments(previousAttachments);
          return;
        }
        chat.setTextInput(previousText);
        chat.setDraftAttachments(previousAttachments);
      }
    };
    void doSubmit();
  }

  function renderScreen() {
    // Onboarding gate
    if (onboardingRequired) {
      return (
        <OnboardingScreen
          appSettings={status?.appSettings ?? null}
          error={settings.error}
          isSavingDisplayName={settings.onboardingSavingDisplayName}
          step={settings.onboardingStep}
          selectedProviderId={settings.onboardingSelectedProviderId}
          providers={(status?.assistantProviders.providers ?? []).filter((p) => p.id !== 'gemini')}
          onConnectProvider={(id) => void settings.handleProviderConnect(id)}
          onRefresh={() => void refreshStatus()}
          onSaveDisplayName={(name) => void settings.handleOnboardingDisplayNameSubmit(name)}
          onSelectProvider={(id) => settings.setOnboardingSelectedProviderId(id)}
          onContinueToInstructions={() => {
            if (settings.onboardingSelectedProviderId) settings.setOnboardingStep(3);
          }}
          onBackToProviderChoice={() => settings.setOnboardingStep(2)}
          onBackToName={() => settings.setOnboardingStep(1)}
          canBrowseProjectFolder={Boolean(window.desktopShell?.pickProjectFolder)}
          onBrowseProjectFolder={async () => {
            const folder = await window.desktopShell?.pickProjectFolder?.();
            return folder ?? null;
          }}
          onConnectProject={(path) => void settings.handleSaveProject(path)}
          onSkipProject={() => settings.dismissOnboardingProject()}
        />
      );
    }

    switch (activeScreen) {
      case 'workspace':
        return (
          <WorkspaceScreen
            activeProviderName={getProviderName(status)}
            projectInput={projectInput}
            workspace={status?.workspace ?? null}
            canBrowseProjectFolder={Boolean(window.desktopShell?.pickProjectFolder)}
            isResetting={settings.busyLabel === 'Resetting Oplyr...'}
            onProjectInputChange={setProjectInput}
            onBrowseProjectFolder={() => {
              if (window.desktopShell?.pickProjectFolder) {
                void window.desktopShell.pickProjectFolder().then((folder: string | null) => {
                  if (folder) {
                    setProjectInput(folder);
                  }
                });
              }
            }}
            onSaveProject={() => void settings.handleSaveProject(projectInput)}
            onToggleWriteAccess={(enabled) => void settings.handleToggleWriteAccess(enabled)}
            onResetApp={() => void handleResetApp()}
          />
        );
      case 'voice':
        return (
          <VoiceScreen
            audio={status?.audio ?? null}
            voiceSession={status?.voiceSession ?? null}
            voiceState={voiceState}
            isRecording={voice.isRecording}
            micAnalyserRef={voice.micAnalyserRef}
            userTranscript={voiceUserTranscript}
            aiReply={voiceReply}
            voiceActivity={chat.liveActivity}
            voiceActivities={chat.activityLog}
            agentWorking={chat.isTurnActive}
            assistant={getVoiceAssistant(status, settings)}
            audioAvailable={status?.audio.available ?? false}
            userName={displayName}
            onStart={voice.onStart}
            onStopAndSend={voice.onStopAndSend}
            autoSend={preferences.autoSendVoice}
            onToggleAutoSend={() => setPreference('autoSendVoice', !preferences.autoSendVoice)}
            pendingTranscript={voice.pendingTranscript}
            onSendPendingTranscript={voice.sendPendingTranscript}
            onDiscardPendingTranscript={voice.clearPendingTranscript}
          />
        );
      case 'terminal':
        return (
          <ChatScreen
            apiBaseUrl={baseUrl}
            messages={chat.messages}
            textInput={chat.textInput}
            draftAttachments={chat.draftAttachments}
            isStreaming={chat.isTurnActive}
            streamingMessageId={chat.activeChatStreamMessageId}
            typedMessages={chat.typedMessageText}
            liveActivity={chat.liveActivity}
            activityLog={chat.activityLog}
            disabled={chat.isSubmittingTurn || chat.isTurnActive}
            onTextInputChange={chat.setTextInput}
            onSubmit={handleTextSubmit}
            onAttachFiles={(files) => void chat.handleAttachFiles(files)}
            onRemoveAttachment={chat.handleRemoveDraftAttachment}
            onStartVoice={() => setActiveScreen('voice')}
            onCancelStreaming={chat.abortActiveChatStream}
          />
        );
      case 'shell':
        // The shell is NOT rendered here — it's kept mounted (hidden) below so switching pages never
        // unmounts it and kills the pty. Its running processes + scrollback survive navigation; only
        // app shutdown (before-quit → killAllPtySessions) stops them.
        return null;
      case 'codebase-map':
        return <CodebaseMapScreen projectRoot={status?.workspace.projectRoot ?? null} />;
      case 'review':
        return (
          <ReviewScreen
            assistantLabel={getProviderName(status)}
            pendingApproval={status?.pendingApproval ?? null}
            lastDiff={status?.lastDiff ?? null}
            approvalHistory={approvals}
            isApproving={isApproving}
            isRejecting={isRejecting}
            onApprove={() => void handleReviewApprove()}
            onReject={(feedback) => void handleReviewReject(feedback)}
          />
        );
      case 'settings':
        return (
          <SettingsScreen
            appSettings={status?.appSettings ?? null}
            preferences={preferences}
            codexSettings={settings.codexSettings}
            claudeSettings={settings.claudeSettings}
            geminiSettings={settings.geminiSettings}
            providerUsage={settings.providerUsage}
            providerUsageLoading={settings.providerUsageLoading}
            status={status}
            voiceSettings={settings.voiceSettings}
            onAppSettingChange={(key, value) => void settings.handleAppSettingChange(key, value)}
            onPreferenceChange={setPreference}
            onVoiceSettingChange={(key, value) =>
              void settings.handleVoiceSettingChange(key, value)
            }
            onCodexSettingChange={(key, value) =>
              void settings.handleCodexSettingChange(key, value)
            }
            onClaudeSettingChange={(key, value) =>
              void settings.handleClaudeSettingChange(key, value)
            }
            onGeminiSettingChange={(key, value) =>
              void settings.handleGeminiSettingChange(key, value)
            }
            onProviderConnect={(id) => void settings.handleProviderConnect(id)}
            onProviderDisconnect={(id) => void settings.handleProviderDisconnect(id)}
            onProviderSwitch={(id) =>
              guardWhileBusy('agent', () => void settings.handleProviderSwitch(id))
            }
            onUpdateCli={(id) => void settings.handleUpdateCli(id)}
            onRefreshProviderUsage={() => void settings.loadProviderUsage()}
            onSaveCodexSettings={() => void settings.handleSaveCodexSettings()}
            onSaveClaudeSettings={() => void settings.handleSaveClaudeSettings()}
            onSaveGeminiSettings={() => void settings.handleSaveGeminiSettings()}
            codexSettingsDirty={settings.codexSettingsDirty}
            claudeSettingsDirty={settings.claudeSettingsDirty}
            geminiSettingsDirty={settings.geminiSettingsDirty}
            agentBusy={agentBusy}
          />
        );
      case 'meetings':
        return <MeetingsScreen />;
      case 'markdown':
        return <MarkdownScreen projectRoot={status?.workspace.projectRoot ?? null} />;
      case 'memory':
        return <MemoryScreen refreshNonce={brainRefreshNonce} />;
      case 'music':
        return (
          <StandbyScreen
            icon={Music}
            title="Music"
            description="Focus audio while you build — coming to a future Oplyr release."
            footnote="Coming soon"
          />
        );
      default:
        return (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-16 h-16 rounded-2xl bg-surface-2 flex items-center justify-center ring-1 ring-border">
              <OplyrLogoMark className="h-12 w-12" />
            </div>
            <p className="text-sm text-text-tertiary">Screen not found.</p>
          </div>
        );
    }
  }

  return (
    <div className="h-full w-full bg-background text-text-primary">
      {voiceBootstrap?.phase !== 'ready' ? (
        <VoiceBootstrapScreen
          status={voiceBootstrap}
          onRetry={() => {
            statusRefreshedAfterBootstrapRef.current = false;
            void service
              .startVoiceBootstrap()
              .then(async (response) => {
                setVoiceBootstrap(response.bootstrap);

                const poll = async (): Promise<void> => {
                  const next = await service.getVoiceBootstrapStatus();
                  setVoiceBootstrap(next.bootstrap);

                  if (
                    next.bootstrap.phase === 'ready' &&
                    !statusRefreshedAfterBootstrapRef.current
                  ) {
                    statusRefreshedAfterBootstrapRef.current = true;
                    await refreshStatus();
                    return;
                  }

                  if (shouldPollVoiceBootstrap(next.bootstrap)) {
                    window.setTimeout(() => {
                      void poll();
                    }, 900);
                  }
                };

                await poll();
              })
              .catch((error) => {
                setVoiceBootstrap((current) => ({
                  phase: 'failed',
                  progressPercent: current?.progressPercent ?? 0,
                  message: 'Oplyr could not retry local voice setup.',
                  error:
                    error instanceof Error
                      ? error.message
                      : 'Unable to retry the voice bootstrap flow.',
                  installRoot: current?.installRoot ?? '',
                  seedRoot: current?.seedRoot ?? null,
                  steps: current?.steps ?? [],
                  updatedAt: new Date().toISOString()
                }));
              });
          }}
        />
      ) : onboardingRequired ? (
        <div className="min-h-screen px-6 py-10">
          <div className="mx-auto max-w-4xl">
            <Suspense fallback={<ScreenFallback />}>{renderScreen()}</Suspense>
          </div>
        </div>
      ) : (
        <>
          <Sidebar />
          <Topbar
            displayName={displayName}
            onRefresh={() => void handleFullRefresh()}
            refreshing={fullRefreshing}
            onDisconnect={() => {
              const providerId = status?.assistantProviders.activeProviderId;
              if (providerId) {
                void settings.handleProviderDisconnect(providerId);
              }
            }}
            onProviderSwitch={(id) =>
              guardWhileBusy('agent', () => void settings.handleProviderSwitch(id))
            }
            codexSettings={settings.codexSettings}
            claudeSettings={settings.claudeSettings}
            geminiSettings={settings.geminiSettings}
            onSelectModel={(id, slug) =>
              guardWhileBusy('model', () => void settings.handleSelectModel(id, slug))
            }
            onSelectReasoningEffort={(id, effort) =>
              guardWhileBusy(
                'reasoning effort',
                () => void settings.handleSelectReasoningEffort(id, effort)
              )
            }
            onRefreshModels={(id) => void settings.handleRefreshModels(id)}
            refreshingModels={settings.refreshingModels}
            providerUsage={settings.providerUsage}
            providerUsageLoading={settings.providerUsageLoading}
            agentBusy={agentBusy}
            busyLabel={settings.busyLabel}
            error={settings.error}
          />
          <ContentFrame maxWidth="full">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeScreen}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                <Suspense fallback={<ScreenFallback />}>{renderScreen()}</Suspense>
              </motion.div>
            </AnimatePresence>
            {/* Kept-alive integrated shell: mounted once on first open, then shown/hidden by display
                so navigating away never unmounts it (which would kill the pty and its processes). */}
            {shellEverOpened && (
              <div style={{ display: activeScreen === 'shell' ? undefined : 'none' }}>
                <Suspense fallback={<ScreenFallback />}>
                  <ShellScreen cwd={status?.workspace.projectRoot ?? null} theme={theme} />
                </Suspense>
              </div>
            )}
          </ContentFrame>
          <ProductTourOverlay />
        </>
      )}

      {/* Floating auto-update banner (desktop only; renders nothing in the browser) */}
      <UpdateBanner />

      {/* Toast viewport */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 80 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 80 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className={cn(
                'px-4 py-3 rounded-[var(--radius-control)] border text-sm',
                'bg-surface-1 border-border',
                toast.tone === 'error' && 'border-danger/30 bg-danger-muted',
                toast.tone === 'success' && 'border-success/30 bg-success-muted'
              )}
            >
              <p className="font-medium text-text-primary">{toast.title}</p>
              <p className="text-text-secondary text-xs mt-0.5">{toast.detail}</p>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
