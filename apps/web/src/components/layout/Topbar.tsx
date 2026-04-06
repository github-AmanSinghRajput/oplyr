import { Sun, Moon, RefreshCw, Settings, Unplug } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useTheme } from '@/providers/ThemeProvider';
import { useNavigation } from '@/providers/NavigationProvider';
import { useStatus } from '@/providers/StatusProvider';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface TopbarProps {
  displayName: string | null;
  onRefresh: () => void;
  onDisconnect: () => void;
  busyLabel?: string;
  error?: string;
}

export function Topbar({ displayName, onRefresh, onDisconnect, busyLabel, error }: TopbarProps) {
  const { theme, toggleTheme } = useTheme();
  const { sidebarExpanded, setActiveScreen } = useNavigation();
  const { status, desktopRuntime, assistantReady } = useStatus();

  const workspaceLabel = status?.workspace.projectName ?? 'No project selected';
  const writeMode = status?.workspace.writeAccessEnabled ? 'Approval-gated' : 'Advisory';
  const activeProvider = status?.assistantProviders.activeProvider;
  const authLabel = activeProvider?.name ?? 'Not connected';

  return (
    <TooltipProvider delayDuration={300}>
      <header
        className={cn(
          'fixed top-0 right-0 z-10 h-[var(--topbar-height)]',
          'flex items-center justify-between px-4',
          'bg-background/80 backdrop-blur-xl border-b border-border',
          'transition-[left] duration-300 ease-out'
        )}
        style={{ left: sidebarExpanded ? 240 : 56 }}
      >
        {/* Left: workspace info */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0">
            <p className="text-sm font-medium text-text-primary truncate">
              {displayName ? `${displayName} — ${workspaceLabel}` : workspaceLabel}
            </p>
          </div>
          {assistantReady && (
            <Badge variant="outline" className="text-xs shrink-0">
              {writeMode}
            </Badge>
          )}
        </div>

        {/* Right: status + actions */}
        <div className="flex items-center gap-2">
          {busyLabel && (
            <Badge variant="secondary" className="text-xs">
              {busyLabel}
            </Badge>
          )}
          {error && (
            <Badge variant="destructive" className="text-xs">
              {error}
            </Badge>
          )}

          {assistantReady && desktopRuntime && (
            <Badge
              variant={desktopRuntime.apiReachable ? 'outline' : 'destructive'}
              className="text-xs"
            >
              <span
                className={cn(
                  'w-1.5 h-1.5 rounded-full mr-1.5',
                  desktopRuntime.apiReachable ? 'bg-success' : 'bg-danger'
                )}
              />
              {authLabel}
            </Badge>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleTheme}>
                {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Toggle theme</TooltipContent>
          </Tooltip>

          {assistantReady && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onRefresh}>
                    <RefreshCw size={14} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Refresh</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setActiveScreen('settings')}
                  >
                    <Settings size={14} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Settings</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-danger hover:text-danger"
                    onClick={onDisconnect}
                  >
                    <Unplug size={14} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Disconnect</TooltipContent>
              </Tooltip>
            </>
          )}
        </div>
      </header>
    </TooltipProvider>
  );
}
