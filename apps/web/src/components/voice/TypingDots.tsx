import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';

interface TypingDotsProps {
  size?: 'sm' | 'md';
  className?: string;
}

const DOTS = [0, 1, 2];

export function TypingDots({ size = 'md', className }: TypingDotsProps) {
  const dotClass = size === 'sm' ? 'h-1.5 w-1.5' : 'h-2.5 w-2.5';
  const travel = size === 'sm' ? 3 : 5;

  return (
    <span
      className={cn('inline-flex items-center', size === 'sm' ? 'gap-1' : 'gap-1.5', className)}
      role="status"
      aria-label="Assistant is working"
    >
      {DOTS.map((index) => (
        <motion.span
          key={index}
          className={cn('inline-block rounded-full bg-accent', dotClass)}
          animate={{ y: [0, -travel, 0], opacity: [0.45, 1, 0.45] }}
          transition={{
            duration: 0.9,
            ease: 'easeInOut',
            repeat: Infinity,
            delay: index * 0.15
          }}
        />
      ))}
    </span>
  );
}
