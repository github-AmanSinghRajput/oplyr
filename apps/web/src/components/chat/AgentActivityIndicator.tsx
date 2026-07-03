import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { TypingDots } from '@/components/voice/TypingDots';
import { cn } from '@/lib/cn';
import { getFallbackPhrase } from '@/containers/voice-console/lib/agent-phrases';

interface AgentActivityIndicatorProps {
  /** The agent's current concrete action (e.g. "Reading page.tsx"). When absent, a rotating
   *  engagement phrase is shown instead so the user always sees the agent is alive. */
  activity?: string | null;
  size?: 'sm' | 'md';
  className?: string;
}

const ROTATE_MS = 2400;

/**
 * A single-line "the agent is working" status. Prefers the real streamed activity; falls back to a
 * gently rotating playful phrase during quiet stretches. Used by both the chat and voice surfaces.
 */
export function AgentActivityIndicator({
  activity,
  size = 'md',
  className
}: AgentActivityIndicatorProps) {
  const [tick, setTick] = useState(0);
  const trimmed = activity?.trim() ?? '';

  useEffect(() => {
    // Only rotate phrases while there's no concrete activity to show.
    if (trimmed) return;
    const id = window.setInterval(() => setTick((value) => value + 1), ROTATE_MS);
    return () => window.clearInterval(id);
  }, [trimmed]);

  const label = trimmed || getFallbackPhrase(tick);

  return (
    <span
      role="status"
      aria-label={label}
      className={cn(
        'inline-flex items-center gap-2 text-text-tertiary',
        size === 'sm' ? 'text-xs' : 'text-sm',
        className
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={label}
          initial={{ opacity: 0, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -3 }}
          transition={{ duration: 0.24, ease: 'easeOut' }}
          className="truncate"
        >
          {label}
        </motion.span>
      </AnimatePresence>
      <TypingDots size="sm" />
    </span>
  );
}
