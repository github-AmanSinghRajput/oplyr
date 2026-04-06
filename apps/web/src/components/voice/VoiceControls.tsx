import { Mic, MicOff, Square, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { VoiceNarrationMode, VoiceState } from '@/containers/voice-console/lib/types';

interface VoiceControlsProps {
  voiceState: VoiceState;
  voiceActive: boolean;
  audioAvailable: boolean;
  narrationMode: VoiceNarrationMode;
  onStart: () => void;
  onStop: () => void;
  onToggleMute: () => void;
}

export function VoiceControls({
  voiceState,
  voiceActive,
  audioAvailable,
  narrationMode,
  onStart,
  onStop,
  onToggleMute,
}: VoiceControlsProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex items-center justify-center gap-3">
        {/* Start / Retry */}
        <Tooltip>
          <TooltipTrigger asChild>
            <motion.div whileTap={{ scale: 0.95 }}>
              <Button
                size="lg"
                className={cn(
                  'rounded-full h-12 px-6',
                  'bg-accent hover:bg-accent/90 text-background font-medium',
                )}
                disabled={voiceActive || !audioAvailable}
                onClick={onStart}
              >
                {voiceState === 'error' ? <RotateCcw size={18} className="mr-2" /> : <Mic size={18} className="mr-2" />}
                {voiceState === 'error' ? 'Retry' : 'Start voice'}
              </Button>
            </motion.div>
          </TooltipTrigger>
          <TooltipContent>Start voice session</TooltipContent>
        </Tooltip>

        {/* Stop */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="rounded-full h-10 w-10"
              disabled={!voiceActive}
              onClick={onStop}
            >
              <Square size={16} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>End session</TooltipContent>
        </Tooltip>

        {/* Mute toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className={cn(
                'rounded-full h-10 w-10',
                narrationMode === 'muted' && 'border-danger/30 text-danger',
              )}
              onClick={onToggleMute}
            >
              {narrationMode === 'muted' ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{narrationMode === 'muted' ? 'Unmute' : 'Mute'}</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
