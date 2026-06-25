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
import { useNavigation } from '@/providers/NavigationProvider';
import { useStatus } from '@/providers/StatusProvider';
import { useToast } from '@/providers/ToastProvider';
import { useTheme } from '@/providers/ThemeProvider';
import { useApproval } from '@/providers/ApprovalProvider';
import { useApi } from '@/providers/ApiProvider';
import { useChatStream } from '@/hooks/use-chat-stream';
import { useVoiceSession } from '@/hooks/use-voice-session';
import { useAppSettings, type AppSettingsHandle } from '@/hooks/use-app-settings';
import { useNotes } from '@/hooks/use-notes';
import { usePreferences } from '@/hooks/use-preferences';
import { Skeleton } from '@/components/ui/skeleton';
import { OplyrLogoMark } from '@/components/branding/OplyrLogoMark';
import { cn } from '@/lib/cn';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { formatReasoningEffort, getVoiceState } from '@/containers/voice-console/lib/helpers';
import type { VoiceAssistantInfo } from '@/components/screens/VoiceScreen';
import type { StatusResponse, VoiceBootstrapStatus } from '@/containers/voice-console/lib/types';

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
const MemoryScreen = lazy(() =>
  import('@/components/screens/MemoryScreen').then((m) => ({ default: m.MemoryScreen }))
);
const CodebaseMapScreen = lazy(() =>
  import('@/components/screens/CodebaseMapScreen').then((m) => ({ default: m.CodebaseMapScreen }))
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
  const { status, system, refreshStatus, assistantReady } = useStatus();
  const { theme } = useTheme();
  const { toasts } = useToast();
  const { baseUrl, service } = useApi();
  const { approvals, handleApprove, handleReject, isApproving, isRejecting } = useApproval();
  const chat = useChatStream();
  const { loadLogs } = chat;
  const settings = useAppSettings();
  const notes = useNotes();
  const { preferences, setPreference } = usePreferences();
  const voice = useVoiceSession({
    chat,
    voiceSettings: settings.voiceSettings
  });

  const handleReviewApprove = useCallback(async () => {
    const approved = await handleApprove();
    if (!approved) return;
    await loadLogs();
    startTransition(() => setActiveScreen('voice'));
  }, [handleApprove, loadLogs, setActiveScreen]);

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
  const lastAssistant = [...chat.messages].reverse().find((m) => m.role === 'assistant') ?? null;
  const lastUser = [...chat.messages].reverse().find((m) => m.role === 'user') ?? null;
  const [projectInput, setProjectInput] = useState(status?.workspace.projectRoot ?? '');
  const [voiceBootstrap, setVoiceBootstrap] = useState<VoiceBootstrapStatus | null>(null);
  const bootstrapRequestedRef = useRef(false);
  const statusRefreshedAfterBootstrapRef = useRef(false);
  const onboardingRequired = !displayName?.trim() || !assistantReady;

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
    if (chat.isSubmittingTurn) return;

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
            onResetApp={() => void settings.handleResetApp()}
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
            userTranscript={
              voice.streamedTranscriptOverride ||
              lastUser?.text ||
              status?.voiceSession?.lastTranscript ||
              ''
            }
            aiReply={lastAssistant}
            assistant={getVoiceAssistant(status, settings)}
            audioAvailable={status?.audio.available ?? false}
            onStart={voice.onStart}
            onStopAndSend={voice.onStopAndSend}
          />
        );
      case 'terminal':
        return (
          <ChatScreen
            apiBaseUrl={baseUrl}
            messages={chat.messages}
            textInput={chat.textInput}
            draftAttachments={chat.draftAttachments}
            isStreaming={chat.isStreaming}
            streamingMessageId={chat.activeChatStreamMessageId}
            typedMessages={chat.typedMessageText}
            disabled={chat.isSubmittingTurn}
            onTextInputChange={chat.setTextInput}
            onSubmit={handleTextSubmit}
            onAttachFiles={(files) => void chat.handleAttachFiles(files)}
            onRemoveAttachment={chat.handleRemoveDraftAttachment}
            onStartVoice={() => setActiveScreen('voice')}
            onCancelStreaming={chat.abortActiveChatStream}
          />
        );
      case 'shell':
        return <ShellScreen cwd={status?.workspace.projectRoot ?? null} theme={theme} />;
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
            system={system}
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
            onProviderDisconnect={(id) => void settings.handleProviderDisconnect(id)}
            onProviderSwitch={(id) => void settings.handleProviderSwitch(id)}
            onRefreshProviderUsage={() => void settings.loadProviderUsage()}
            onSaveCodexSettings={() => void settings.handleSaveCodexSettings()}
            onSaveClaudeSettings={() => void settings.handleSaveClaudeSettings()}
            onSaveGeminiSettings={() => void settings.handleSaveGeminiSettings()}
            codexSettingsDirty={settings.codexSettingsDirty}
            claudeSettingsDirty={settings.claudeSettingsDirty}
            geminiSettingsDirty={settings.geminiSettingsDirty}
          />
        );
      case 'memory':
        return (
          <MemoryScreen
            editingNoteId={notes.editingNoteId}
            noteBody={notes.noteBody}
            noteSource={notes.noteSource}
            noteTitle={notes.noteTitle}
            notes={notes.notes}
            trackedSessions={system?.auth.trackedSessions ?? []}
            system={system}
            onCreateNote={notes.onCreateNote}
            onDeleteNote={notes.onDeleteNote}
            onEditNote={notes.onEditNote}
            onNoteBodyChange={notes.onNoteBodyChange}
            onNoteSourceChange={notes.onNoteSourceChange}
            onNoteTitleChange={notes.onNoteTitleChange}
            onResetComposer={notes.onResetComposer}
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
            onRefresh={() => void refreshStatus()}
            onDisconnect={() => {
              const providerId = status?.assistantProviders.activeProviderId;
              if (providerId) {
                void settings.handleProviderDisconnect(providerId);
              }
            }}
            onProviderSwitch={(id) => void settings.handleProviderSwitch(id)}
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
          </ContentFrame>
        </>
      )}

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
