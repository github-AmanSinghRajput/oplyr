import { useState } from 'react';
import { Mic, Square, Send, Check, StopCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { VoiceWaveform } from '@/components/voice/VoiceWaveform';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { AgentActivityTimeline } from '@/components/chat/AgentActivityTimeline';
import { ProviderLogo } from '@/components/providers/ProviderLogo';
import { Button } from '@/components/ui/button';
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
  thinking: 'Thinking…',
  speaking: 'Speaking…',
  error: 'Something went wrong — tap to try again'
};

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
  // Editable draft of the transcript awaiting review (auto-send off). Synced render-phase when the
  // pending transcript changes (https://react.dev/learn/you-might-not-need-an-effect).
  const [draft, setDraft] = useState('');
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
  const showResponseBlock = Boolean(aiReply && replyText) || isWorking;

  // A turn is "in flight" from the moment the mic opens until the agent finishes. The send mode is
  // locked for that window so it can't change out from under an in-flight transcript.
  const turnInFlight = isRecording || isWorking;

  // The headline must describe what Oplyr is ACTUALLY doing. `voiceSession.phase` stays 'listening'
  // while the session is merely open, so keying the label off it announced "Listening…" with a cold
  // mic — misleading, and a privacy smell (it reads as "always listening"). `isRecording` is the real
  // mic-capture signal, so only that may claim we're listening.
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

  return (
    <div className="flex w-full flex-col items-center gap-6 py-8">
      <div className="text-center">
        {voiceState === 'idle' && userName?.trim() ? (
          <p className="mb-1 text-sm font-medium text-text-secondary">{getGreeting(userName)}</p>
        ) : null}
        <p className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-1">
          Voice · {audio?.transcriptionEngine ?? 'On-device speech'}
        </p>
        <h2 className="text-xl font-semibold text-text-primary">{headline}</h2>
      </div>

      {/* The send mode is locked for the duration of a turn: flipping it mid-utterance changed how the
          in-flight transcript was handled and could strand the turn in a transcription error. The mode
          a turn started with is the mode it finishes with. */}
      <button
        type="button"
        data-tour="voice-autosend"
        onClick={onToggleAutoSend}
        disabled={turnInFlight}
        aria-pressed={autoSend}
        title={
          turnInFlight
            ? 'Finish this turn to change auto-send'
            : autoSend
              ? 'Auto-send on — your transcript is sent immediately'
              : 'Auto-send off — review and edit your transcript before sending'
        }
        className="flex items-center gap-2 rounded-pill border border-border bg-surface-1 px-3 py-1.5 text-xs text-text-secondary transition-colors hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:text-text-secondary"
      >
        <span
          className={cn(
            'flex h-4 w-4 items-center justify-center rounded-[5px] border transition-colors',
            autoSend ? 'border-accent bg-accent text-background' : 'border-border'
          )}
        >
          {autoSend && <Check size={11} />}
        </span>
        Auto-send {autoSend ? 'on' : 'off'}
      </button>

      <div className="w-full rounded-[var(--radius-panel)] border border-border bg-surface-1 px-4 py-4">
        <VoiceWaveform mode={mode} analyserRef={micAnalyserRef} />
      </div>

      <div className="flex items-center gap-3">
        <motion.div whileTap={{ scale: 0.95 }} data-tour="voice-mic">
          <Button
            size="lg"
            className={cn(
              'rounded-full h-16 w-16 p-0 cursor-pointer',
              isRecording || agentWorking
                ? 'bg-danger hover:bg-danger/90'
                : 'bg-accent hover:bg-accent/90',
              'text-background'
            )}
            // Enabled while the agent works so you can STOP it; only needs the mic to START a turn.
            disabled={!isRecording && !agentWorking && !audioAvailable}
            onClick={isRecording ? onStopAndSend : agentWorking ? onStopResponse : onStart}
            aria-label={
              isRecording ? 'Stop and send' : agentWorking ? 'Stop response' : 'Tap to speak'
            }
          >
            {isRecording ? (
              <Square size={22} />
            ) : agentWorking ? (
              <StopCircle size={22} />
            ) : (
              <Mic size={22} />
            )}
          </Button>
        </motion.div>
        {isRecording ? (
          <Button
            variant="outline"
            className="rounded-full h-10 cursor-pointer"
            onClick={onStopAndSend}
          >
            Stop &amp; send
          </Button>
        ) : agentWorking ? (
          <Button
            variant="outline"
            className="rounded-full h-10 cursor-pointer"
            onClick={onStopResponse}
          >
            Stop
          </Button>
        ) : null}
      </div>

      {reviewing ? (
        <div className="w-full">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-text-tertiary">
            Review &amp; edit before sending
          </p>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Cmd/Ctrl+Enter sends; plain Enter adds a newline (it's an editable message).
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && draft.trim()) {
                e.preventDefault();
                onSendPendingTranscript(draft);
              }
            }}
            rows={3}
            autoFocus
            className="w-full resize-none rounded-[var(--radius-panel)] border border-accent-border bg-surface-1 px-4 py-3 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent"
            placeholder="What the AI heard — fix anything off, then send."
          />
          <div className="mt-2 flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={onDiscardPendingTranscript}>
              Discard
            </Button>
            <Button disabled={!draft.trim()} onClick={() => onSendPendingTranscript(draft)}>
              <Send size={14} className="mr-1.5" /> Send
            </Button>
          </div>
        </div>
      ) : userTranscript ? (
        <div className="w-full">
          <p className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-1">
            You
          </p>
          <div className="rounded-[var(--radius-panel)] border border-accent-border bg-accent-muted px-4 py-3">
            <p className="text-sm text-text-primary whitespace-pre-wrap">{userTranscript}</p>
          </div>
        </div>
      ) : null}

      {showResponseBlock && (
        <div className="w-full">
          <div className="flex items-center gap-2 mb-2">
            {assistant ? (
              <>
                <ProviderLogo providerId={assistant.id} size="sm" />
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-semibold text-text-primary truncate">
                    {assistant.name}
                  </span>
                  {assistant.model && (
                    <span className="text-[11px] text-text-tertiary truncate">
                      {assistant.model}
                    </span>
                  )}
                </div>
              </>
            ) : (
              <span className="text-xs font-medium text-text-tertiary uppercase tracking-wider">
                Assistant
              </span>
            )}
            {/* No dots here: the AgentActivityTimeline below already renders the live indicator (the
                action label + its own dots). Showing both played the same animation twice. */}
          </div>
          {aiReply && replyText ? (
            <MessageBubble
              message={aiReply}
              isStreaming={isWorking}
              liveActivity={voiceActivity}
              activityLog={voiceActivities}
            />
          ) : (
            <div className="rounded-[var(--radius-panel)] border border-border bg-surface-1 px-4 py-5">
              <AgentActivityTimeline
                activities={voiceActivities}
                working={isWorking}
                current={voiceActivity}
              />
            </div>
          )}
        </div>
      )}

      {voiceSession?.error && (
        <div className="w-full rounded-[var(--radius-panel)] border border-danger/30 bg-danger-muted p-4">
          <p className="text-sm text-text-primary font-medium">{voiceSession.error}</p>
        </div>
      )}
    </div>
  );
}
