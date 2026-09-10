import { useState } from 'react';
import { Mic, Send, Square, StopCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { VoiceOrbs } from '@/components/voice/VoiceOrbs';
import { VoiceLevelRing } from '@/components/voice/VoiceLevelRing';
import { VoiceElapsed } from '@/components/voice/VoiceElapsed';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { AgentActivityTimeline } from '@/components/chat/AgentActivityTimeline';
import { ProviderLogo } from '@/components/providers/ProviderLogo';
import { AGENTS } from '@/lib/agents';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';
import { getGreeting } from '@/containers/voice-console/lib/helpers';
import type {
  AssistantProviderId,
  AudioState,
  MessageEntry,
  VoiceSessionState,
  VoiceState
} from '@/containers/voice-console/lib/types';

export interface VoiceAssistantInfo {
  id: AssistantProviderId;
  name: string;
  model: string | null;
}

interface VoiceScreenProps {
  audio: AudioState | null;
  voiceSession: VoiceSessionState | null;
  voiceState: VoiceState;
  isRecording: boolean;
  micAnalyserRef: React.RefObject<AnalyserNode | null>;
  userTranscript: string;
  aiReply: MessageEntry | null;
  voiceActivity: string | null;
  voiceActivities: string[];
  /** Shared turn state (chat + voice). True whenever the agent is processing any request. */
  agentWorking: boolean;
  assistant: VoiceAssistantInfo | null;
  audioAvailable: boolean;
  userName?: string | null;
  onStart: () => void;
  onStopAndSend: () => void;
  /** Abort the agent while it's working on a voice turn (the "stop" the mic can't do once recording ends). */
  onStopResponse: () => void;
  autoSend: boolean;
  onToggleAutoSend: () => void;
  pendingTranscript: string;
  onSendPendingTranscript: (text: string) => void;
  onDiscardPendingTranscript: () => void;
}

const STATUS: Record<VoiceState, string> = {
  idle: 'Tap to speak',
  listening: 'Listening…',
  thinking: 'Transcribing…',
  speaking: 'Speaking…',
  error: 'Something went wrong'
};

/**
 * The voice console, laid out for a desktop window.
 *
 * This was a single centred column: a tower of full-width blocks in the middle of a wide screen,
 * with the mic pushed further down every time the agent said something longer. It is now two panes
 * that fill the window and never scroll the page — your side on the left (meter, mic, the
 * transcript you are reviewing), the agent's side on the right (its reply, scrolling in place).
 * The control stays exactly where you left it no matter how long the answer runs.
 */
export function VoiceScreen({
  audio,
  voiceSession,
  voiceState,
  isRecording,
  micAnalyserRef,
  userTranscript,
  aiReply,
  voiceActivity,
  voiceActivities,
  agentWorking,
  assistant,
  audioAvailable,
  userName,
  onStart,
  onStopAndSend,
  onStopResponse,
  autoSend,
  onToggleAutoSend,
  pendingTranscript,
  onSendPendingTranscript,
  onDiscardPendingTranscript
}: VoiceScreenProps) {
  const [draft, setDraft] = useState(pendingTranscript);
  const [syncedPending, setSyncedPending] = useState(pendingTranscript);
  if (pendingTranscript !== syncedPending) {
    setSyncedPending(pendingTranscript);
    setDraft(pendingTranscript);
  }
  const reviewing = pendingTranscript.length > 0;

  const mode = isRecording ? 'recording' : voiceState === 'speaking' ? 'speaking' : 'idle';
  // The agent turn (shared with chat) is the real "working" signal — a turn started from chat also
  // lights up voice. While a turn runs the mic becomes a Stop button so you can abort the response.
  const isWorking = agentWorking;
  const replyText = aiReply?.text?.trim() ?? '';
  // Attribute a COMPLETED reply to the agent that actually produced it. `assistant` is the LIVE
  // active provider, so using it here relabelled past answers the moment the user switched agents.
  const replyAuthorId = aiReply?.authorProviderId ?? null;
  const authorId = replyAuthorId ?? assistant?.id ?? null;
  const authorName = replyAuthorId
    ? (AGENTS[replyAuthorId]?.label ?? assistant?.name ?? 'Assistant')
    : (assistant?.name ?? 'Assistant');
  const showModel = !replyAuthorId || replyAuthorId === assistant?.id;
  const showResponseBlock = Boolean(aiReply && replyText) || isWorking;

  const turnInFlight = isRecording || isWorking;
  const showGreeting = voiceState === 'idle' && Boolean(userName?.trim()) && !isWorking;

  const headline =
    voiceState === 'error'
      ? STATUS.error
      : isRecording
        ? STATUS.listening
        : agentWorking
          ? 'Working…'
          : reviewing
            ? 'Review what I heard'
            : voiceState === 'speaking'
              ? STATUS.speaking
              : STATUS.idle;

  // What a tap does right now, and — when it can do nothing — why. A dead control with no
  // explanation is what made this screen feel broken.
  const micLabel = isRecording
    ? 'Stop and send'
    : agentWorking
      ? 'Stop the agent'
      : audioAvailable
        ? 'Tap to speak'
        : 'Microphone unavailable';
  const micHint = isRecording
    ? 'Finish speaking and send the transcript'
    : agentWorking
      ? 'Cancel this turn and get the mic back'
      : audioAvailable
        ? autoSend
          ? 'Records, then sends as soon as you stop'
          : 'Records, then lets you review before sending'
        : (audio?.error ?? 'On-device speech needs an Apple Silicon Mac running macOS 14 or later');

  return (
    <div className="flex h-[calc(100vh-var(--topbar-height)-3rem)] min-h-[520px] gap-4">
      {/* ── Your side: the meter, the control, and anything awaiting your approval ── */}
      <section className="flex w-[min(30rem,38%)] shrink-0 flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="truncate font-serif text-lg text-text-primary">
            {showGreeting ? getGreeting(userName ?? '') : headline}
          </h2>
          <span className="shrink-0 text-[11px] text-text-tertiary">
            {audio?.transcriptionEngine ?? 'On-device speech'}
          </span>
        </div>

        {/* The meter takes the leftover height instead of a fixed 96px strip, so on a tall window
            it reads as an instrument rather than a scrap. */}
        <div className="relative min-h-[120px] flex-1 overflow-hidden rounded-[var(--radius-panel)] border border-border bg-background">
          <VoiceOrbs mode={mode} analyserRef={micAnalyserRef} />
          <AnimatePresence>
            {isRecording ? (
              <motion.span
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                className="absolute bottom-2.5 left-1/2 -translate-x-1/2 rounded-pill bg-surface-1/90 px-2.5 py-1 text-[11px] text-text-secondary backdrop-blur"
              >
                Listening
              </motion.span>
            ) : null}
          </AnimatePresence>
        </div>

        {/* ── The console ──
            One surface rather than a bare circle floating beside a checkbox, which is what made
            this corner read as unfinished. The mic carries a live level ring so the first question
            anyone has of a microphone — is it hearing me? — is answered without reading a graph. */}
        <div className="flex items-center gap-3 rounded-[var(--radius-panel)] border border-border bg-surface-1 p-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <motion.div
                whileTap={{ scale: 0.94 }}
                data-tour="voice-mic"
                className="relative shrink-0"
              >
                <VoiceLevelRing analyserRef={micAnalyserRef} active={isRecording} size={72} />
                <Button
                  size="lg"
                  className={cn(
                    'm-2 h-14 w-14 cursor-pointer rounded-full p-0 transition-colors',
                    isRecording || agentWorking
                      ? 'bg-danger hover:bg-danger/90'
                      : 'bg-accent hover:bg-accent/90',
                    'text-background'
                  )}
                  // Enabled while the agent works so you can STOP it; only needs the mic to START.
                  disabled={!isRecording && !agentWorking && !audioAvailable}
                  onClick={isRecording ? onStopAndSend : agentWorking ? onStopResponse : onStart}
                  aria-label={micLabel}
                >
                  {isRecording ? (
                    <Square size={20} />
                  ) : agentWorking ? (
                    <StopCircle size={20} />
                  ) : (
                    <Mic size={20} />
                  )}
                </Button>
              </motion.div>
            </TooltipTrigger>
            <TooltipContent>{micHint}</TooltipContent>
          </Tooltip>

          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <p className="truncate text-sm font-medium text-text-primary">{micLabel}</p>
              <VoiceElapsed key={isWorking ? 'working' : 'idle'} running={isWorking} />
            </div>
            <p className="mt-0.5 truncate text-xs text-text-tertiary">
              {isRecording
                ? autoSend
                  ? 'Sends as soon as you stop'
                  : 'You will review it before it sends'
                : agentWorking
                  ? 'Working on your request'
                  : audioAvailable
                    ? `${assistant?.name ?? 'Your agent'} is listening on this project`
                    : 'Voice is unavailable on this machine'}
            </p>

            {/* Auto-send as two explicit choices. A lone checkbox left the row looking empty and
                made the off state read as a disabled feature rather than a deliberate mode. */}
            <div
              className="mt-2 inline-flex rounded-pill border border-border p-0.5"
              role="group"
              aria-label="What happens when you stop speaking"
            >
              {(
                [
                  { on: false, label: 'Review first' },
                  { on: true, label: 'Send instantly' }
                ] as const
              ).map((option) => (
                <Tooltip key={option.label}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      data-tour={option.on ? 'voice-autosend' : undefined}
                      onClick={() => {
                        if (option.on !== autoSend) onToggleAutoSend();
                      }}
                      disabled={turnInFlight}
                      aria-pressed={autoSend === option.on}
                      className={cn(
                        'rounded-pill px-2.5 py-0.5 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                        autoSend === option.on
                          ? 'bg-accent-muted text-accent'
                          : 'text-text-tertiary hover:text-text-secondary'
                      )}
                    >
                      {option.label}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {turnInFlight
                      ? 'Finish this turn to change this'
                      : option.on
                        ? 'Your words go straight to the agent'
                        : 'You get to read and edit the transcript first'}
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          </div>

          {isRecording ? (
            <Button variant="outline" className="shrink-0 self-start" onClick={onStopAndSend}>
              Send
            </Button>
          ) : agentWorking ? (
            <Button variant="outline" className="shrink-0 self-start" onClick={onStopResponse}>
              Stop
            </Button>
          ) : null}
        </div>

        {/* A session error belongs beside the control it blocks. */}
        <AnimatePresence>
          {voiceSession?.error ? (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <p className="rounded-[var(--radius-control)] border border-danger/30 bg-danger-muted px-3 py-2 text-xs text-text-primary">
                {voiceSession.error}
              </p>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* Review sits on your side of the screen, because it is your text until you send it. */}
        <AnimatePresence>
          {reviewing ? (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="rounded-[var(--radius-panel)] border border-accent-border bg-surface-1 p-3"
            >
              <p className="mb-1.5 text-[11px] font-medium tracking-wider text-text-tertiary uppercase">
                Review before sending
              </p>
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  // Cmd/Ctrl+Enter sends; plain Enter adds a newline (it's an editable message).
                  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && draft.trim()) {
                    event.preventDefault();
                    onSendPendingTranscript(draft);
                  }
                }}
                rows={3}
                autoFocus
                className="w-full resize-none rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:ring-1 focus:ring-accent focus:outline-none"
                placeholder="What the AI heard — fix anything off, then send."
              />
              <div className="mt-2 flex items-center justify-end gap-2">
                <Button variant="ghost" onClick={onDiscardPendingTranscript}>
                  Discard
                </Button>
                <Button disabled={!draft.trim()} onClick={() => onSendPendingTranscript(draft)}>
                  <Send size={13} className="mr-1.5" /> Send
                </Button>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </section>

      {/* ── The agent's side: what it heard, and what it said. Scrolls in place. ── */}
      <section className="flex min-w-0 flex-1 flex-col rounded-[var(--radius-panel)] border border-border bg-surface-1">
        <div className="flex items-center gap-2 border-b border-border/60 px-4 py-2.5">
          {authorId ? (
            <>
              <ProviderLogo providerId={authorId} size="sm" />
              <span className="truncate text-xs font-semibold text-text-primary">{authorName}</span>
              {showModel && assistant?.model ? (
                <span className="truncate text-[11px] text-text-tertiary">{assistant.model}</span>
              ) : null}
            </>
          ) : (
            <span className="text-xs font-medium tracking-wider text-text-tertiary uppercase">
              Conversation
            </span>
          )}
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {userTranscript && !reviewing ? (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            >
              <p className="mb-1 text-[11px] font-medium tracking-wider text-text-tertiary uppercase">
                You
              </p>
              <p className="rounded-[var(--radius-control)] border border-accent-border bg-accent-muted px-3 py-2 text-sm whitespace-pre-wrap text-text-primary">
                {userTranscript}
              </p>
            </motion.div>
          ) : null}

          {showResponseBlock ? (
            aiReply && replyText ? (
              <MessageBubble
                message={aiReply}
                isStreaming={isWorking}
                liveActivity={voiceActivity}
                activityLog={voiceActivities}
              />
            ) : (
              <AgentActivityTimeline
                activities={voiceActivities}
                working={isWorking}
                current={voiceActivity}
              />
            )
          ) : null}

          {!showResponseBlock && !userTranscript ? (
            <div className="flex h-full items-center justify-center px-6 text-center">
              <p className="max-w-xs text-sm text-text-tertiary">
                Speak, and what you say and what comes back will appear here.
              </p>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
