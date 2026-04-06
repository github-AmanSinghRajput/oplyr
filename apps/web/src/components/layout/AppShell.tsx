import { Suspense } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { ContentFrame } from './ContentFrame';
import { useNavigation } from '@/providers/NavigationProvider';
import { useStatus } from '@/providers/StatusProvider';
import { useToast } from '@/providers/ToastProvider';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/cn';

function ScreenFallback() {
  return (
    <div className="flex flex-col gap-4 p-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full rounded-[var(--radius-panel)]" />
    </div>
  );
}

export function AppShell() {
  const { activeScreen } = useNavigation();
  const { status, refreshStatus } = useStatus();
  const { toasts } = useToast();

  const displayName = status?.appSettings.displayName ?? null;

  return (
    <div className="h-full w-full bg-background text-text-primary">
      <Sidebar />
      <Topbar
        displayName={displayName}
        onRefresh={() => void refreshStatus()}
        onDisconnect={() => {/* wired in Phase 2 */}}
      />
      <ContentFrame>
        <AnimatePresence mode="wait">
          <motion.div
            key={activeScreen}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <Suspense fallback={<ScreenFallback />}>
              {/* Screens wired progressively in Phase 2-3 tasks */}
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <div className="w-16 h-16 rounded-2xl bg-accent-muted flex items-center justify-center">
                  <span className="text-accent font-bold text-2xl">V</span>
                </div>
                <div className="text-center">
                  <p className="text-lg font-medium text-text-primary mb-1">
                    {activeScreen.charAt(0).toUpperCase() + activeScreen.slice(1)}
                  </p>
                  <p className="text-sm text-text-tertiary">
                    Screen content will be wired in Phase 2/3
                  </p>
                </div>
              </div>
            </Suspense>
          </motion.div>
        </AnimatePresence>
      </ContentFrame>

      {/* Toast viewport */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 80 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 80 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className={cn(
                'px-4 py-3 rounded-[var(--radius-control)] border text-sm',
                'bg-surface-1 border-border',
                toast.tone === 'error' && 'border-danger/30 bg-danger-muted',
                toast.tone === 'success' && 'border-success/30 bg-success-muted',
              )}
            >
              <p className="font-medium text-text-primary">{toast.title}</p>
              <p className="text-text-secondary text-xs mt-0.5">{toast.detail}</p>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
