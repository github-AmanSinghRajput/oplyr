import { Sun, Moon, RefreshCw, Unplug } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useTheme } from '@/providers/ThemeProvider';
import { useNavigation } from '@/providers/NavigationProvider';
import { useStatus } from '@/providers/StatusProvider';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ProviderLogo } from '@/components/providers/ProviderLogo';
import type { AssistantProviderId } from '@/containers/voice-console/lib/types';

interface TopbarProps {
  displayName: string | null;
  onRefresh: () => void;
  onDisconnect: () => void;
  onProviderSwitch: (providerId: AssistantProviderId) => void;
  busyLabel?: string;
  error?: string;
}

export function Topbar({
  displayName,
  onRefresh,
  onDisconnect,
  onProviderSwitch,
  busyLabel,
  error
}: TopbarProps) {
  const { theme, toggleTheme } = useTheme();
  const { sidebarExpanded, setActiveScreen } = useNavigation();
  const { status, desktopRuntime, assistantReady } = useStatus();

  const workspaceLabel = status?.workspace.projectName ?? 'No project selected';
  const writeMode = status?.workspace.writeAccessEnabled ? 'Approval-gated' : 'Advisory';
  const activeProvider = status?.assistantProviders.activeProvider;
  const activeProviderId = activeProvider?.id ?? null;
  const authLabel = activeProvider?.accountLabel ?? activeProvider?.name ?? 'Not connected';
  const connectedProviders =
    status?.assistantProviders.providers.filter((provider) => provider.appConnected) ?? [];
  const showSwitcher = connectedProviders.length > 1;

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

          {assistantReady && showSwitcher && (
            <div
              role="radiogroup"
              aria-label="Active assistant provider"
              className="flex items-center gap-0.5 rounded-[var(--radius-control)] border border-border bg-surface-2 p-0.5"
            >
              {connectedProviders.map((provider) => {
                const isActive = provider.id === activeProviderId;
                return (
                  <Tooltip key={provider.id}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={isActive}
                        aria-label={`Switch to ${provider.name}`}
                        onClick={() => {
                          if (!isActive) {
                            onProviderSwitch(provider.id);
                          }
                        }}
                        className={cn(
                          'flex items-center gap-1.5 rounded-[calc(var(--radius-control)-2px)] px-2 h-7 text-xs transition-colors',
                          isActive
                            ? 'bg-surface-1 text-text-primary shadow-sm'
                            : 'text-text-secondary hover:text-text-primary'
                        )}
                      >
                        <ProviderLogo
                          providerId={provider.id}
                          size="sm"
                          className="h-4 w-4 rounded p-0.5 border-0 shadow-none"
                        />
                        {isActive && <span className="font-medium">{provider.name}</span>}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {isActive ? `${provider.name} (active)` : `Switch to ${provider.name}`}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          )}

          {assistantReady && desktopRuntime && !showSwitcher && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setActiveScreen('settings')}
                  className={cn(
                    'flex items-center gap-1.5 rounded-[var(--radius-control)] border pl-1.5 pr-2 h-7 text-xs transition-colors cursor-pointer hover:bg-surface-2',
                    desktopRuntime.apiReachable
                      ? 'border-border text-text-secondary'
                      : 'border-danger/40 text-danger'
                  )}
                >
                  {activeProvider && (
                    <ProviderLogo
                      providerId={activeProvider.id}
                      size="sm"
                      className="h-5 w-5 rounded-md p-1 border-0 shadow-none"
                    />
                  )}
                  <span
                    className={cn(
                      'w-1.5 h-1.5 rounded-full',
                      desktopRuntime.apiReachable ? 'bg-success' : 'bg-danger'
                    )}
                  />
                  <span>{authLabel}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent>Manage providers</TooltipContent>
            </Tooltip>
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
