import { Suspense, lazy } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { ContentFrame } from './ContentFrame';
import { useNavigation } from '@/providers/NavigationProvider';
import { useStatus } from '@/providers/StatusProvider';
import { useToast } from '@/providers/ToastProvider';
import { useTheme } from '@/providers/ThemeProvider';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/cn';

// Lazy-load screens to keep initial bundle small.
// Phase 4 will wire remaining props (voice session, chat stream, approval) via hooks/providers.
const ChatScreen = lazy(() => import('@/components/screens/ChatScreen').then(m => ({ default: m.ChatScreen })));
const VoiceScreen = lazy(() => import('@/components/screens/VoiceScreen').then(m => ({ default: m.VoiceScreen })));
const ReviewScreen = lazy(() => import('@/components/screens/ReviewScreen').then(m => ({ default: m.ReviewScreen })));
const WorkspaceScreen = lazy(() => import('@/components/screens/WorkspaceScreen').then(m => ({ default: m.WorkspaceScreen })));
const ShellScreen = lazy(() => import('@/components/screens/ShellScreen').then(m => ({ default: m.ShellScreen })));
const SettingsScreen = lazy(() => import('@/components/screens/SettingsScreen').then(m => ({ default: m.SettingsScreen })));
const OnboardingScreen = lazy(() => import('@/components/screens/OnboardingScreen').then(m => ({ default: m.OnboardingScreen })));
const MemoryScreen = lazy(() => import('@/components/screens/MemoryScreen').then(m => ({ default: m.MemoryScreen })));

function ScreenFallback() {
  return (
    <div className="flex flex-col gap-4 p-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full rounded-[var(--radius-panel)]" />
    </div>
  );
}

/** Placeholder screen for screens that need Phase 4 hooks to be fully wired. */
function PlaceholderScreen({ screenId }: { screenId: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <div className="w-16 h-16 rounded-2xl bg-accent-muted flex items-center justify-center">
        <span className="text-accent font-bold text-2xl">V</span>
      </div>
      <div className="text-center">
        <p className="text-lg font-medium text-text-primary mb-1">
          {screenId.charAt(0).toUpperCase() + screenId.slice(1)}
        </p>
        <p className="text-sm text-text-tertiary">
          This screen is built and ready. It will be fully wired once voice/chat hooks are extracted in Phase 4.
        </p>
      </div>
    </div>
  );
}

export function AppShell() {
  const { activeScreen } = useNavigation();
  const { status, refreshStatus } = useStatus();
  const { theme } = useTheme();
  const { toasts } = useToast();

  const displayName = status?.appSettings.displayName ?? null;

  function renderScreen() {
    switch (activeScreen) {
      case 'workspace':
        return (
          <WorkspaceScreen
            activeProviderName={status?.assistantProviders.activeProvider?.name ?? 'Assistant'}
            projectInput={status?.workspace.projectRoot ?? ''}
            workspace={status?.workspace ?? null}
            canBrowseProjectFolder={Boolean(window.desktopShell?.browseForFolder)}
            isResetting={false}
            onProjectInputChange={() => {/* Phase 4: wire to state */}}
            onBrowseProjectFolder={() => {/* Phase 4: wire to desktop bridge */}}
            onSaveProject={() => {/* Phase 4: wire to API */}}
            onToggleWriteAccess={() => {/* Phase 4: wire to API */}}
            onResetApp={() => {/* Phase 4: wire to API */}}
          />
        );
      case 'shell':
        return (
          <ShellScreen
            cwd={status?.workspace.projectRoot ?? null}
            theme={theme}
          />
        );
      // Voice, Chat, Review, Settings, Memory, Onboarding need more state from Phase 4 hooks.
      // For now, render placeholder. The component code is built and ready.
      case 'voice':
      case 'terminal':
      case 'review':
      case 'settings':
      case 'memory':
      case 'notes':
        return <PlaceholderScreen screenId={activeScreen} />;
      default:
        return <PlaceholderScreen screenId={activeScreen} />;
    }
  }

  return (
    <div className="h-full w-full bg-background text-text-primary">
      <Sidebar />
      <Topbar
        displayName={displayName}
        onRefresh={() => void refreshStatus()}
        onDisconnect={() => {/* wired in Phase 4 */}}
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
              {renderScreen()}
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
