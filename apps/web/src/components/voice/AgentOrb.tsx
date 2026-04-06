import { cn } from '@/lib/cn';
import type { VoiceState } from '@/containers/voice-console/lib/types';

interface AgentOrbProps {
  voiceState: VoiceState;
  size?: number;
}

const stateColors: Record<VoiceState, string> = {
  idle: 'from-accent/20 to-accent/5',
  listening: 'from-accent/40 to-success/20',
  thinking: 'from-warning/30 to-accent/20',
  speaking: 'from-success/40 to-accent/20',
  error: 'from-danger/40 to-danger/10'
};

const stateGlow: Record<VoiceState, string> = {
  idle: 'shadow-[0_0_60px_rgba(0,212,245,0.08)]',
  listening: 'shadow-[0_0_80px_rgba(0,212,245,0.2)]',
  thinking: 'shadow-[0_0_80px_rgba(242,208,112,0.15)]',
  speaking: 'shadow-[0_0_100px_rgba(111,251,190,0.2)]',
  error: 'shadow-[0_0_60px_rgba(255,142,152,0.15)]'
};

export function AgentOrb({ voiceState, size = 200 }: AgentOrbProps) {
  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      {/* Outer glow ring */}
      <div
        className={cn(
          'absolute inset-0 rounded-full bg-gradient-radial',
          stateColors[voiceState],
          stateGlow[voiceState],
          'transition-all duration-700 ease-out',
          voiceState === 'listening' && 'animate-pulse',
          voiceState === 'thinking' && 'animate-spin-slow'
        )}
      />

      {/* Inner orb */}
      <div
        className={cn(
          'relative rounded-full bg-gradient-to-br border border-white/5',
          stateColors[voiceState],
          'backdrop-blur-xl',
          'transition-all duration-500 ease-out'
        )}
        style={{ width: size * 0.6, height: size * 0.6 }}
      >
        {/* Animated wave bars inside orb */}
        <div className="absolute inset-0 flex items-center justify-center gap-1">
          {[0, 0.12, 0.24, 0.36, 0.48].map((delay, i) => (
            <span
              key={i}
              className={cn(
                'w-0.5 rounded-full bg-accent/60 transition-all duration-300',
                voiceState === 'idle' && 'h-1',
                voiceState === 'listening' && 'animate-voice-bar',
                voiceState === 'thinking' && 'h-2 animate-pulse',
                voiceState === 'speaking' && 'animate-voice-bar',
                voiceState === 'error' && 'h-1 bg-danger/60'
              )}
              style={{
                animationDelay: `${delay}s`,
                height: voiceState === 'idle' ? 4 : undefined
              }}
            />
          ))}
        </div>
      </div>

      {/* State label */}
      <span
        className={cn(
          'absolute -bottom-8 text-xs font-medium tracking-wide uppercase',
          voiceState === 'error' ? 'text-danger' : 'text-text-secondary'
        )}
      >
        {voiceState}
      </span>
    </div>
  );
}
