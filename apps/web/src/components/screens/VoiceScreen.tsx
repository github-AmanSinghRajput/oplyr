import { AgentOrb } from '@/components/voice/AgentOrb';
import { VoiceControls } from '@/components/voice/VoiceControls';
import { TranscriptCard } from '@/components/voice/TranscriptCard';
import { ActivityFeed } from '@/components/voice/ActivityFeed';
import { CommandPicker } from '@/components/voice/CommandPicker';
import type {
  AudioState,
  VoiceCommandOption,
  VoiceNarrationMode,
  VoiceSessionState,
  VoiceState
} from '@/containers/voice-console/lib/types';
import { getVoiceHeadline, getVoiceSubline } from '@/containers/voice-console/lib/helpers';

interface VoiceScreenProps {
  audio: AudioState | null;
  busyLabel: string;
  spokenReplyPreview?: string;
  streamedTranscriptOverride?: string;
  voiceSession: VoiceSessionState | null;
  voiceState: VoiceState;
  voiceActivity: string | null;
  recentVoiceActivities: string[];
  narrationMode: VoiceNarrationMode;
  pendingCommandTitle: string | null;
  pendingCommandPrompt: string | null;
  pendingCommandOptions: VoiceCommandOption[];
  onApplyCommandOption: (option: VoiceCommandOption) => void;
  onDismissCommandOptions: () => void;
  onToggleMute: () => void;
  onStart: () => void;
  onStop: () => void;
}

const fallbackAudio: AudioState = {
  platform: 'browser',
  available: false,
  inputDeviceLabel: null,
  outputDeviceLabel: null,
  transcriptionEngine: 'Unavailable',
  speechEngine: 'Unavailable',
  lastCheckedAt: null,
  error: null
};

export function VoiceScreen({
  audio,
  busyLabel: _busyLabel,
  spokenReplyPreview,
  streamedTranscriptOverride,
  voiceSession,
  voiceState,
  voiceActivity,
  recentVoiceActivities,
  narrationMode,
  pendingCommandTitle,
  pendingCommandPrompt,
  pendingCommandOptions,
  onApplyCommandOption,
  onDismissCommandOptions,
  onToggleMute,
  onStart,
  onStop
}: VoiceScreenProps) {
  const currentTranscriptLabel =
    voiceSession?.phase === 'thinking' || voiceSession?.phase === 'speaking'
      ? 'AI response'
      : 'Your voice';
  const currentTranscript =
    (voiceSession?.phase === 'speaking' && spokenReplyPreview
      ? spokenReplyPreview
      : streamedTranscriptOverride || voiceSession?.liveTranscript) || 'Waiting for live speech...';
  const lastTranscript = voiceSession?.lastTranscript || 'No completed voice turn yet.';

  return (
    <div className="flex flex-col items-center gap-8 py-8 max-w-3xl mx-auto">
      {/* Headline */}
      <div className="text-center">
        <p className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-2">
          Voice session
        </p>
        <h2 className="text-2xl font-semibold text-text-primary">{getVoiceHeadline(voiceState)}</h2>
        <p className="text-sm text-text-secondary mt-1">
          {getVoiceSubline(
            audio ?? fallbackAudio,
            voiceState,
            streamedTranscriptOverride ?? voiceSession?.liveTranscript ?? '',
            voiceSession?.error
          )}
        </p>
      </div>

      {/* Agent Orb — center stage */}
      <AgentOrb voiceState={voiceState} size={200} />

      {/* Controls */}
      <VoiceControls
        voiceState={voiceState}
        voiceActive={Boolean(voiceSession?.active)}
        audioAvailable={audio?.available ?? false}
        narrationMode={narrationMode}
        onStart={onStart}
        onStop={onStop}
        onToggleMute={onToggleMute}
      />

      {/* Live transcript (full width) */}
      <div className="w-full">
        <TranscriptCard
          label={currentTranscriptLabel}
          text={currentTranscript}
          variant="primary"
          badge={voiceSession?.active ? 'Live' : 'Standby'}
          badgeActive={voiceSession?.active ?? false}
        />
      </div>

      {/* Activity + Last message (2 columns) */}
      <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4">
        <ActivityFeed currentActivity={voiceActivity} recentActivities={recentVoiceActivities} />
        <TranscriptCard label="Last message" text={lastTranscript} />
      </div>

      {/* Voice error */}
      {voiceSession?.error && (
        <div className="w-full rounded-[var(--radius-panel)] border border-danger/30 bg-danger-muted p-4">
          <span className="text-xs font-medium text-danger uppercase tracking-wider">
            Voice issue
          </span>
          <p className="text-sm text-text-primary font-medium mt-1">{voiceSession.error}</p>
        </div>
      )}

      {/* Command picker */}
      <div className="w-full">
        <CommandPicker
          title={pendingCommandTitle}
          prompt={pendingCommandPrompt}
          options={pendingCommandOptions}
          onApply={onApplyCommandOption}
          onDismiss={onDismissCommandOptions}
        />
      </div>
    </div>
  );
}
