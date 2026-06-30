import { useEffect, useRef, useState } from 'react';
import { Sun, Moon, RefreshCw, Unplug, ChevronDown, Plus, Check } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useTheme } from '@/providers/ThemeProvider';
import { useNavigation } from '@/providers/NavigationProvider';
import { useStatus } from '@/providers/StatusProvider';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ProviderLogo } from '@/components/providers/ProviderLogo';
import { ModelPicker } from '@/components/providers/ModelPicker';
import type {
  AssistantProviderId,
  ClaudeSettingsResponse,
  CodexSettingsResponse,
  GeminiSettingsResponse
} from '@/containers/voice-console/lib/types';

interface TopbarProps {
  displayName: string | null;
  onRefresh: () => void;
  onDisconnect: () => void;
  onProviderSwitch: (providerId: AssistantProviderId) => void;
  codexSettings: CodexSettingsResponse | null;
  claudeSettings: ClaudeSettingsResponse | null;
  geminiSettings: GeminiSettingsResponse | null;
  onSelectModel: (providerId: AssistantProviderId, slug: string) => void;
  busyLabel?: string;
  error?: string;
}

export function Topbar({
  displayName,
  onRefresh,
  onDisconnect,
  onProviderSwitch,
  codexSettings,
  claudeSettings,
  geminiSettings,
  onSelectModel,
  busyLabel,
  error
}: TopbarProps) {
  const { theme, toggleTheme } = useTheme();
  const { sidebarPinned, setActiveScreen } = useNavigation();
  const { status, desktopRuntime, assistantReady } = useStatus();

  const workspaceLabel = status?.workspace.projectName ?? 'No project selected';
  const writeMode = status?.workspace.writeAccessEnabled ? 'Approval-gated' : 'Advisory';
  const activeProvider = status?.assistantProviders.activeProvider;
  const activeProviderId = activeProvider?.id ?? null;
  const authLabel = activeProvider?.accountLabel ?? activeProvider?.name ?? 'Not connected';
  const connectedProviders =
    status?.assistantProviders.providers.filter((provider) => provider.appConnected) ?? [];

  return (
    <TooltipProvider delayDuration={300}>
      <header
        className={cn(
          'fixed top-0 right-0 z-10 h-[var(--topbar-height)]',
          'flex items-center justify-between px-4',
          'bg-background/80 backdrop-blur-xl border-b border-border',
          'transition-[left] duration-300 ease-out'
        )}
        style={{ left: sidebarPinned ? 240 : 56 }}
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

          {assistantReady && (
            <ProviderSwitcher
              providers={connectedProviders}
              activeProviderId={activeProviderId}
              authLabel={authLabel}
              reachable={desktopRuntime ? desktopRuntime.apiReachable : true}
              onSwitch={onProviderSwitch}
              onConnectNew={() => setActiveScreen('settings')}
            />
          )}

          {assistantReady && (
            <ModelPicker
              activeProviderId={activeProviderId}
              codexSettings={codexSettings}
              claudeSettings={claudeSettings}
              geminiSettings={geminiSettings}
              onSelectModel={onSelectModel}
            />
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

interface SwitchProvider {
  id: AssistantProviderId;
  name: string;
}

/**
 * Topbar dropdown to switch the active agent + a "Connect new agent" action. Lightweight,
 * self-contained (no menu library) — closes on outside click / Escape.
 */
function ProviderSwitcher({
  providers,
  activeProviderId,
  authLabel,
  reachable,
  onSwitch,
  onConnectNew
}: {
  providers: SwitchProvider[];
  activeProviderId: AssistantProviderId | null;
  authLabel: string;
  reachable: boolean;
  onSwitch: (id: AssistantProviderId) => void;
  onConnectNew: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const active = providers.find((provider) => provider.id === activeProviderId) ?? null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex h-7 items-center gap-1.5 rounded-[var(--radius-control)] border border-border bg-surface-2 pl-1.5 pr-2 text-xs text-text-secondary transition-colors hover:text-text-primary"
      >
        {active ? (
          <ProviderLogo
            providerId={active.id}
            size="sm"
            className="h-4 w-4 rounded-radius-sm border-0 p-0.5 shadow-none"
          />
        ) : null}
        <span className={cn('h-1.5 w-1.5 rounded-full', reachable ? 'bg-success' : 'bg-danger')} />
        <span className="font-medium text-text-primary">{active?.name ?? authLabel}</span>
        <ChevronDown size={13} className={cn('transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+6px)] z-30 min-w-[200px] overflow-hidden rounded-[var(--radius-control)] border border-border bg-surface-1 p-1 shadow-lg"
        >
          {providers.map((provider) => {
            const isActive = provider.id === activeProviderId;
            return (
              <button
                key={provider.id}
                type="button"
                role="menuitemradio"
                aria-checked={isActive}
                onClick={() => {
                  if (!isActive) onSwitch(provider.id);
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-radius-sm px-2 py-1.5 text-xs transition-colors',
                  isActive
                    ? 'bg-accent-muted text-accent'
                    : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary'
                )}
              >
                <ProviderLogo
                  providerId={provider.id}
                  size="sm"
                  className="h-4 w-4 rounded-radius-sm border-0 p-0.5 shadow-none"
                />
                <span className="flex-1 text-left font-medium">{provider.name}</span>
                {isActive && <Check size={13} />}
              </button>
            );
          })}
          <div className="my-1 h-px bg-border" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onConnectNew();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-radius-sm px-2 py-1.5 text-xs text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary"
          >
            <Plus size={13} />
            <span className="flex-1 text-left font-medium">Connect new agent</span>
          </button>
        </div>
      )}
    </div>
  );
}
