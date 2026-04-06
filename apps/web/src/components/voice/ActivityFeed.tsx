import { motion, AnimatePresence } from 'framer-motion';

interface ActivityFeedProps {
  currentActivity: string | null;
  recentActivities: string[];
}

export function ActivityFeed({ currentActivity, recentActivities }: ActivityFeedProps) {
  if (!currentActivity && recentActivities.length === 0) {
    return (
      <div className="rounded-[var(--radius-panel)] border border-border bg-surface-1/50 p-4">
        <span className="text-xs font-medium text-text-tertiary uppercase tracking-wider">
          Session flow
        </span>
        <p className="text-sm text-text-secondary mt-2">
          Listen, think, speak. You can interrupt while the assistant is talking.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-[var(--radius-panel)] border border-border bg-surface-1/50 p-4">
      <span className="text-xs font-medium text-text-tertiary uppercase tracking-wider">
        What it's doing
      </span>
      <AnimatePresence mode="popLayout">
        {currentActivity && (
          <motion.p
            key={currentActivity}
            className="text-sm text-accent font-medium mt-2"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
          >
            {currentActivity}
          </motion.p>
        )}
      </AnimatePresence>
      {recentActivities.length > 1 && (
        <div className="flex flex-col gap-1 mt-2 pt-2 border-t border-border/50">
          {recentActivities.slice(1, 4).map((activity, i) => (
            <span key={`${activity}-${i}`} className="text-xs text-text-tertiary">
              {activity}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
