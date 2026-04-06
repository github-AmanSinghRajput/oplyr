import { Suspense, lazy, startTransition, type FormEvent } from 'react';
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
import { useAppSettings } from '@/hooks/use-app-settings';
import { useNotes } from '@/hooks/use-notes';
import { usePreferences } from '@/hooks/use-preferences';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/cn';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { getVoiceState } from '@/containers/voice-console/lib/helpers';
import type { StatusResponse } from '@/containers/voice-console/lib/types';

const ChatScreen = lazy(() => import('@/components/screens/ChatScreen').then(m => ({ default: m.ChatScreen })));
const VoiceScreen = lazy(() => import('@/components/screens/VoiceScreen').then(m => ({ default: m.VoiceScreen })));
const ReviewScreen = lazy(() => import('@/components/screens/ReviewScreen').then(m => ({ default: m.ReviewScreen })));
const WorkspaceScreen = lazy(() => import('@/components/screens/WorkspaceScreen').then(m => ({ default: m.WorkspaceScreen })));
const ShellScreen = lazy(() => import('@/components/screens/ShellScreen').then(m => ({ default: m.ShellScreen })));
const SettingsScreen = lazy(() => import('@/components/screens/SettingsScreen').then(m => ({ default: m.SettingsScreen })));
const OnboardingScreen = lazy(() => import('@/components/screens/OnboardingScreen').then(m => ({ default: m.OnboardingScreen })));
const MemoryScreen = lazy(() => import('@/components/screens/MemoryScreen').then(m => ({ default: m.MemoryScreen })));

function ScreenFallback() {
  return (
    <div className="flex flex-col gap-4 p-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full rounded-[var(--radius-panel)]" />
    </div>
  );
}

function getProviderName(status: StatusResponse | null) {
  return status?.assistantProviders.activeProvider?.name ?? 'Assistant';
}

export function AppShell() {
  const { activeScreen, setActiveScreen } = useNavigation();
  const { status, system, refreshStatus, assistantReady } = useStatus();
  const { theme } = useTheme();
  const { toasts } = useToast();
  const { baseUrl } = useApi();
  const { approvals, handleApprove, handleReject } = useApproval();
  const chat = useChatStream();
  const settings = useAppSettings();
  const notes = useNotes();
  const { preferences, setPreference } = usePreferences();

  useKeyboardShortcuts(setActiveScreen);

  const displayName = status?.appSettings.displayName ?? null;
  const voiceState = getVoiceState(status);

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
          attachmentIds: previousAttachments.map((a) => a.id),
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
    if (!assistantReady) {
      return (
        <OnboardingScreen
          appSettings={status?.appSettings ?? null}
          step={settings.onboardingStep}
          selectedProviderId={settings.onboardingSelectedProviderId}
          providers={status?.assistantProviders.providers ?? []}
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
            projectInput={status?.workspace.projectRoot ?? ''}
            workspace={status?.workspace ?? null}
            canBrowseProjectFolder={Boolean(window.desktopShell?.pickProjectFolder)}
            isResetting={settings.busyLabel === 'Resetting VOCOD...'}
            onProjectInputChange={() => {/* controlled by WorkspaceScreen internally */}}
            onBrowseProjectFolder={() => {
              if (window.desktopShell?.pickProjectFolder) {
                void window.desktopShell.pickProjectFolder().then((folder: string | null) => {
                  if (folder) void settings.handleSaveProject(folder);
                });
              }
            }}
            onSaveProject={() => void settings.handleSaveProject(status?.workspace.projectRoot ?? '')}
            onToggleWriteAccess={(enabled) => void settings.handleToggleWriteAccess(enabled)}
            onResetApp={() => void settings.handleResetApp()}
          />
        );
      case 'voice':
        return (
          <VoiceScreen
            audio={status?.audio ?? null}
            busyLabel={settings.busyLabel}
            voiceSession={status?.voiceSession ?? null}
            voiceState={voiceState}
            voiceActivity={null}
            recentVoiceActivities={[]}
            narrationMode={settings.voiceSettings?.settings.narrationMode ?? 'narrated'}
            pendingCommandTitle={null}
            pendingCommandPrompt={null}
            pendingCommandOptions={[]}
            onApplyCommandOption={() => {/* voice session hook needed */}}
            onDismissCommandOptions={() => {/* voice session hook needed */}}
            onToggleMute={() => {/* voice session hook needed */}}
            onStart={() => {/* voice session hook needed */}}
            onStop={() => {/* voice session hook needed */}}
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
        return (
          <ShellScreen
            cwd={status?.workspace.projectRoot ?? null}
            theme={theme}
          />
        );
      case 'review':
        return (
          <ReviewScreen
            assistantLabel={getProviderName(status)}
            pendingApproval={status?.pendingApproval ?? null}
            lastDiff={status?.lastDiff ?? null}
            approvalHistory={approvals}
            onApprove={() => void handleApprove()}
            onReject={() => void handleReject()}
          />
        );
      case 'settings':
        return (
          <SettingsScreen
            appSettings={status?.appSettings ?? null}
            preferences={preferences}
            codexSettings={settings.codexSettings}
            claudeSettings={settings.claudeSettings}
            status={status}
            system={system}
            voiceSettings={settings.voiceSettings}
            onAppSettingChange={(key, value) => void settings.handleAppSettingChange(key, value)}
            onPreferenceChange={setPreference}
            onVoiceSettingChange={(key, value) => void settings.handleVoiceSettingChange(key, value)}
            onCodexSettingChange={(key, value) => void settings.handleCodexSettingChange(key, value)}
            onClaudeSettingChange={(key, value) => void settings.handleClaudeSettingChange(key, value)}
            onProviderChange={(id) => void settings.handleProviderChange(id)}
            onProviderDisconnect={(id) => void settings.handleProviderDisconnect(id)}
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
            <div className="w-16 h-16 rounded-2xl bg-accent-muted flex items-center justify-center">
              <span className="text-accent font-bold text-2xl">V</span>
            </div>
            <p className="text-sm text-text-tertiary">Screen not found.</p>
          </div>
        );
    }
  }

  return (
    <div className="h-full w-full bg-background text-text-primary">
      <Sidebar />
      <Topbar
        displayName={displayName}
        onRefresh={() => void refreshStatus()}
        onDisconnect={() => {/* wired when voice session hook is available */}}
      />
      <ContentFrame>
        <AnimatePresence mode="wait">
          <motion.div
            key={activeScreen}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <Suspense fallback={<ScreenFallback />}>
              {renderScreen()}
            </Suspense>
          </motion.div>
        </AnimatePresence>
      </ContentFrame>

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
                toast.tone === 'success' && 'border-success/30 bg-success-muted',
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
