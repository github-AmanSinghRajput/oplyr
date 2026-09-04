import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ThinkingPulse } from '@/components/voice/ThinkingPulse';
import { useStatus } from '@/providers/StatusProvider';
import { agentAccent } from '@/lib/agents';
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
// How many rotation ticks a freshly-arrived real activity is held before we resume rotating
// engagement phrases (~ROTATE_MS each). Keeps the indicator alive during long non-streamed work
// (e.g. edit tasks that plan-then-write for a minute with no events) instead of freezing on a line.
const REAL_HOLD_TICKS = 2;

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
  const trimmed = activity?.trim() ?? '';
  // Tint the pulse with whichever agent is actually working, so the indicator identifies the agent
  // rather than being one anonymous animation shared by all of them.
  const { status } = useStatus();
  const activeAgent = status?.assistantProviders.activeProviderId ?? null;

  // Adjust state when the activity prop changes — React's recommended render-phase pattern for
  // deriving state from props (no setState-in-effect cascade). When a fresh real activity arrives,
  // hold it for REAL_HOLD_TICKS before rotation resumes.
  const [prevActivity, setPrevActivity] = useState(activity);
  const [realUntilTick, setRealUntilTick] = useState(() => (trimmed ? REAL_HOLD_TICKS : -1));
  if (activity !== prevActivity) {
    setPrevActivity(activity);
    setRealUntilTick(trimmed ? tick + REAL_HOLD_TICKS : -1);
  }

  // Rotate the fallback phrases on a steady cadence (setState in a callback — no effect cascade).
  useEffect(() => {
    const id = window.setInterval(() => setTick((value) => value + 1), ROTATE_MS);
    return () => window.clearInterval(id);
  }, []);

  const showReal = Boolean(trimmed) && tick < realUntilTick;
  const label = showReal ? trimmed : getFallbackPhrase(tick);

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
      <ThinkingPulse size="sm" accent={activeAgent ? agentAccent(activeAgent) : undefined} />
    </span>
  );
}
