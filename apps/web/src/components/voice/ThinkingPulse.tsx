import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';

interface ThinkingPulseProps {
  size?: 'sm' | 'md';
  /** Any CSS color. Callers pass the active agent's accent so the indicator reads as *that* agent. */
  accent?: string;
  className?: string;
}

const NODES = [5, 17, 29];
const LOOP_SECONDS = 1.45;
const SIZES = {
  sm: { width: 26, height: 10 },
  md: { width: 38, height: 14 }
};

/**
 * Oplyr's "working" indicator: a signal travelling across three linked nodes.
 *
 * Replaces the generic bouncing three dots. The motion is the product's own idea — a thought moving
 * through the brain — rather than the chat-bubble ellipsis every assistant ships.
 */
export function ThinkingPulse({
  size = 'md',
  accent = 'var(--color-accent)',
  className
}: ThinkingPulseProps) {
  const { width, height } = SIZES[size];

  return (
    <span
      className={cn('inline-flex items-center', className)}
      role="status"
      aria-label="Assistant is working"
    >
      <svg
        width={width}
        height={height}
        viewBox="0 0 34 12"
        fill="none"
        aria-hidden
        focusable="false"
      >
        <line
          x1={NODES[0]}
          y1="6"
          x2={NODES[NODES.length - 1]}
          y2="6"
          stroke={accent}
          strokeWidth="1"
          strokeLinecap="round"
          opacity="0.22"
        />
        {NODES.map((cx, index) => (
          <motion.circle
            key={cx}
            cx={cx}
            cy="6"
            fill={accent}
            initial={false}
            animate={{ r: [1.6, 2.6, 1.6], opacity: [0.3, 1, 0.3] }}
            transition={{
              duration: LOOP_SECONDS,
              ease: 'easeInOut',
              repeat: Infinity,
              // Stagger so each node lights as the travelling spark reaches it.
              delay: index * (LOOP_SECONDS / NODES.length / 2)
            }}
          />
        ))}
        <motion.circle
          cy="6"
          r="1.5"
          fill={accent}
          initial={false}
          animate={{ cx: NODES, opacity: [0, 0.9, 0] }}
          transition={{ duration: LOOP_SECONDS, ease: 'easeInOut', repeat: Infinity }}
        />
      </svg>
    </span>
  );
}
