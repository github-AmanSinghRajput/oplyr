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
// How long a freshly-arrived real activity is held before we resume rotating engagement phrases.
// This keeps the indicator alive during long non-streamed work (e.g. edit tasks that plan-then-write
// for a minute or more with no intermediate events) instead of freezing on one static line.
const REAL_HOLD_MS = 3600;

/**
 * A single-line "the agent is working" status. Surfaces the real streamed activity when one arrives
 * (held briefly), and otherwise continuously rotates a gentle engagement phrase so the user always
 * sees the agent is alive — even across long stretches with no events. Shared by chat + voice.
 */
export function AgentActivityIndicator({
  activity,
  size = 'md',
  className
}: AgentActivityIndicatorProps) {
  const [tick, setTick] = useState(0);
  const [showReal, setShowReal] = useState(false);
  const trimmed = activity?.trim() ?? '';

  // Always rotate the fallback phrases on a steady cadence.
  useEffect(() => {
    const id = window.setInterval(() => setTick((value) => value + 1), ROTATE_MS);
    return () => window.clearInterval(id);
  }, []);

  // When a new concrete activity arrives, show it and hold briefly, then fall back to rotation.
  useEffect(() => {
    if (!trimmed) {
      setShowReal(false);
      return;
    }
    setShowReal(true);
    const id = window.setTimeout(() => setShowReal(false), REAL_HOLD_MS);
    return () => window.clearTimeout(id);
  }, [trimmed]);

  const label = showReal && trimmed ? trimmed : getFallbackPhrase(tick);

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
