import { Mic, Square } from 'lucide-react';
import { motion } from 'framer-motion';
import { VoiceWaveform } from '@/components/voice/VoiceWaveform';
import { VoiceListeningStrip } from '@/components/voice/VoiceListeningStrip';
import { TypingDots } from '@/components/voice/TypingDots';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { ProviderLogo } from '@/components/providers/ProviderLogo';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
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
  assistant: VoiceAssistantInfo | null;
  audioAvailable: boolean;
  onStart: () => void;
  onStopAndSend: () => void;
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
  assistant,
  audioAvailable,
  onStart,
  onStopAndSend
}: VoiceScreenProps) {
  const mode = isRecording ? 'recording' : voiceState === 'speaking' ? 'speaking' : 'idle';
  const busy = voiceState === 'thinking';
  const isWorking = voiceState === 'thinking' || voiceState === 'speaking';
  const replyText = aiReply?.text?.trim() ?? '';
  const showResponseBlock = Boolean(aiReply) || isWorking;

  return (
    <div className="flex flex-col items-center gap-6 py-8 max-w-2xl mx-auto w-full">
      <div className="text-center">
        <p className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-1">
          Voice · {audio?.transcriptionEngine ?? 'On-device speech'}
        </p>
        <h2 className="text-xl font-semibold text-text-primary">{STATUS[voiceState]}</h2>
      </div>

      <div className="w-full rounded-[var(--radius-panel)] border border-border bg-surface-1 px-4 py-4">
        <VoiceWaveform mode={mode} analyserRef={micAnalyserRef} />
      </div>

      <VoiceListeningStrip
        active={isRecording || voiceState === 'listening'}
        analyserRef={micAnalyserRef}
      />

      <div className="flex items-center gap-3">
        <motion.div whileTap={{ scale: 0.95 }}>
          <Button
            size="lg"
            className={cn(
              'rounded-full h-16 w-16 p-0 cursor-pointer',
              isRecording ? 'bg-danger hover:bg-danger/90' : 'bg-accent hover:bg-accent/90',
              'text-background'
            )}
            disabled={busy || !audioAvailable}
            onClick={isRecording ? onStopAndSend : onStart}
            aria-label={isRecording ? 'Stop and send' : 'Tap to speak'}
          >
            {isRecording ? <Square size={22} /> : <Mic size={22} />}
          </Button>
        </motion.div>
        {isRecording && (
          <Button
            variant="outline"
            className="rounded-full h-10 cursor-pointer"
            onClick={onStopAndSend}
          >
            Stop &amp; send
          </Button>
        )}
      </div>

      {userTranscript && (
        <div className="w-full">
          <p className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-1">
            You
          </p>
          <div className="rounded-[var(--radius-panel)] border border-accent-border bg-accent-muted px-4 py-3">
            <p className="text-sm text-text-primary whitespace-pre-wrap">{userTranscript}</p>
          </div>
        </div>
      )}

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
            {isWorking && <TypingDots size="sm" className="ml-1" />}
          </div>
          {aiReply && replyText ? (
            <MessageBubble message={aiReply} />
          ) : (
            <div className="rounded-[var(--radius-panel)] border border-border bg-surface-1 px-4 py-5 flex items-center justify-center">
              <TypingDots />
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
