import { useState, type ComponentType } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronRight,
  FileText,
  Pencil,
  TerminalSquare,
  Search,
  FolderSearch,
  Sparkles,
  Globe,
  CheckCircle2,
  type LucideProps
} from 'lucide-react';
import { AgentActivityIndicator } from './AgentActivityIndicator';
import { cn } from '@/lib/cn';

interface AgentActivityTimelineProps {
  /** Chronological list of the turn's actions (oldest → newest). */
  activities: string[];
  /** True while the agent is still working — keeps the live rotating line + auto-shows latest. */
  working: boolean;
  /** The current/most-recent action, shown on the collapsed line while working. */
  current?: string | null;
  className?: string;
}

/** Map an activity string's leading verb to an icon, CLI-style. */
function iconFor(activity: string): ComponentType<LucideProps> {
  const a = activity.toLowerCase();
  if (a.startsWith('read')) return FileText;
  if (a.startsWith('edit') || a.startsWith('writ') || a.startsWith('making the change'))
    return Pencil;
  if (a.startsWith('run')) return TerminalSquare;
  if (a.startsWith('scan')) return FolderSearch;
  if (a.startsWith('search')) return Search;
  if (a.startsWith('fetch') || a.includes('web')) return Globe;
  if (
    a.startsWith('think') ||
    a.startsWith('review') ||
    a.startsWith('plan') ||
    a.startsWith('prepar')
  )
    return Sparkles;
  return CheckCircle2;
}

/**
 * A CLI-style, expandable log of the agent's real actions ("Read page.tsx", "Edited hero.css",
 * "Ran npm run typecheck"). Collapsed by default to the current action; expands to the full list.
 * Shared by the chat and voice surfaces so both show the agent working the same way.
 */
export function AgentActivityTimeline({
  activities,
  working,
  current,
  className
}: AgentActivityTimelineProps) {
  const [expanded, setExpanded] = useState(false);

  // Nothing concrete yet — just show the live rotating indicator.
  if (activities.length === 0) {
    return working ? <AgentActivityIndicator activity={current} className={className} /> : null;
  }

  const stepCount = activities.length;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1.5 text-left text-text-tertiary hover:text-text-secondary transition-colors"
        aria-expanded={expanded}
      >
        <motion.span animate={{ rotate: expanded ? 90 : 0 }} transition={{ duration: 0.15 }}>
          <ChevronRight size={14} />
        </motion.span>
        <span className="text-xs font-medium">
          {working ? 'Working' : 'Worked'} · {stepCount} {stepCount === 1 ? 'step' : 'steps'}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden flex flex-col gap-1 border-l border-border/60 pl-3 ml-1.5"
          >
            {activities.map((activity, i) => {
              const Icon = iconFor(activity);
              const isLast = i === activities.length - 1;
              return (
                <li
                  key={`${i}-${activity}`}
                  className={cn(
                    'flex items-center gap-2 text-xs',
                    working && isLast ? 'text-text-primary' : 'text-text-tertiary'
                  )}
                >
                  <Icon size={13} className={cn(working && isLast ? 'text-accent' : '')} />
                  <span className="truncate">{activity}</span>
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>

      {/* Collapsed: show the live line so the user always sees the latest action + animation. */}
      {!expanded && working && (
        <AgentActivityIndicator activity={current ?? activities[activities.length - 1]} size="sm" />
      )}
    </div>
  );
}
