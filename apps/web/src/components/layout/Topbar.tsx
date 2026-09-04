import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Sun, Moon, RefreshCw, Unplug, ChevronDown, Plus, Check } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useTheme } from '@/providers/ThemeProvider';
import { useNavigation } from '@/providers/NavigationProvider';
import { useStatus } from '@/providers/StatusProvider';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ProviderLogo } from '@/components/providers/ProviderLogo';
import { ModelPicker, EffortPicker } from '@/components/providers/ModelPicker';
import { TopbarUsageMeters } from '@/components/providers/TopbarUsageMeters';
import { ConnectAgentModal } from '@/components/providers/ConnectAgentModal';
import { PetCompanion } from '@/components/pets/PetCompanion';
import { MemoryImportPill } from '@/components/layout/MemoryImportPill';
import type {
  AssistantProviderId,
  ClaudeSettingsResponse,
  CodexSettingsResponse,
  GeminiSettingsResponse,
  ProviderUsageSnapshot
} from '@/containers/voice-console/lib/types';

interface TopbarProps {
  displayName: string | null;
  onRefresh: () => void;
  refreshing?: boolean;
  onDisconnect: () => void;
  onProviderSwitch: (providerId: AssistantProviderId) => void;
  onProviderConnect: (providerId: AssistantProviderId) => void;
  codexSettings: CodexSettingsResponse | null;
  claudeSettings: ClaudeSettingsResponse | null;
  geminiSettings: GeminiSettingsResponse | null;
  onSelectModel: (providerId: AssistantProviderId, slug: string) => void;
  onSelectReasoningEffort: (providerId: AssistantProviderId, effort: string | null) => void;
  onRefreshModels: (providerId: AssistantProviderId) => void;
  refreshingModels: boolean;
  providerUsage: ProviderUsageSnapshot | null;
  providerUsageLoading: boolean;
  agentBusy: boolean;
  busyLabel?: string;
  error?: string;
}

export function Topbar({
  displayName,
  onRefresh,
  refreshing,
  onDisconnect,
  onProviderSwitch,
  onProviderConnect,
  codexSettings,
  claudeSettings,
  geminiSettings,
  onSelectModel,
  onSelectReasoningEffort,
  onRefreshModels,
  refreshingModels,
  providerUsage,
  providerUsageLoading,
  agentBusy,
  busyLabel,
  error
}: TopbarProps) {
  const { theme, toggleTheme } = useTheme();
  const { sidebarPinned, setActiveScreen } = useNavigation();
  const { status, desktopRuntime, assistantReady } = useStatus();
  const [connectOpen, setConnectOpen] = useState(false);

  const workspaceLabel = status?.workspace.projectName ?? 'No project selected';
  const writeMode = status?.workspace.writeAccessEnabled ? 'Approval-gated' : 'Advisory';
  const activeProvider = status?.assistantProviders.activeProvider;
  const activeProviderId = activeProvider?.id ?? null;
  const authLabel = activeProvider?.accountLabel ?? activeProvider?.name ?? 'Not connected';
  const connectedProviders =
    status?.assistantProviders.providers.filter((provider) => provider.appConnected) ?? [];
  const sidebarLeft = sidebarPinned ? 240 : 56;
  const showDeskPet = status?.appSettings?.showDeskPet ?? true;
  const deskPet = status?.appSettings?.deskPet ?? 'duck';

  return (
    <TooltipProvider delayDuration={300}>
      <header
        className={cn(
          'fixed top-0 right-0 z-10 h-[var(--topbar-height)]',
          'flex items-center justify-between px-4',
          'bg-background/80 backdrop-blur-xl border-b border-border',
          'transition-[left] duration-300 ease-out'
        )}
        style={{ left: sidebarLeft, '--sidebar-left': `${sidebarLeft}px` } as CSSProperties}
      >
        {/* Desk pet waddling on the bottom border (behind everything, click-through). */}
        {showDeskPet && <PetCompanion pet={deskPet} reservedRight={540} />}

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

        {/* Center: live provider usage limits (hidden on narrow windows to avoid crowding the
            workspace label / action cluster; the full breakdown lives in Settings → Agents). In-flow
            + flex-1 so it centers between the left/right groups without overlapping the provider
            dropdown. */}
        {assistantReady && (
          <div className="hidden min-w-0 flex-1 items-center justify-center px-3 xl:flex">
            <TopbarUsageMeters usage={providerUsage} loading={providerUsageLoading} />
          </div>
        )}

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

          {/* Persistent import progress — follows the user across screens while a run is active. */}
          <MemoryImportPill />

          {assistantReady && (
            <span data-tour="topbar-provider" className="inline-flex">
              <ProviderSwitcher
                providers={connectedProviders}
                activeProviderId={activeProviderId}
                authLabel={authLabel}
                reachable={desktopRuntime ? desktopRuntime.apiReachable : true}
                onSwitch={onProviderSwitch}
                onConnectNew={() => setConnectOpen(true)}
                disabled={agentBusy}
              />
            </span>
          )}

          {assistantReady && (
            <ModelPicker
              activeProviderId={activeProviderId}
              codexSettings={codexSettings}
              claudeSettings={claudeSettings}
              geminiSettings={geminiSettings}
              onSelectModel={onSelectModel}
              onRefreshModels={onRefreshModels}
              refreshing={refreshingModels}
              disabled={agentBusy}
            />
          )}

          {assistantReady && (
            <EffortPicker
              activeProviderId={activeProviderId}
              codexSettings={codexSettings}
              claudeSettings={claudeSettings}
              onSelectReasoningEffort={onSelectReasoningEffort}
              disabled={agentBusy}
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
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={onRefresh}
                    disabled={refreshing}
                  >
                    <RefreshCw size={14} className={cn(refreshing && 'animate-spin')} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {refreshing
                    ? 'Refreshing everything…'
                    : 'Refresh everything (status, chat, memory, usage)'}
                </TooltipContent>
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

      <ConnectAgentModal
        open={connectOpen}
        onClose={() => setConnectOpen(false)}
        providers={status?.assistantProviders.providers ?? []}
        activeProviderId={activeProviderId}
        onConnect={onProviderConnect}
        onSwitch={onProviderSwitch}
        onRefresh={onRefresh}
        onOpenSettings={() => {
          setConnectOpen(false);
          setActiveScreen('settings');
        }}
        busy={agentBusy}
      />
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
  onConnectNew,
  disabled
}: {
  providers: SwitchProvider[];
  activeProviderId: AssistantProviderId | null;
  authLabel: string;
  reachable: boolean;
  onSwitch: (id: AssistantProviderId) => void;
  onConnectNew: () => void;
  disabled?: boolean;
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
        disabled={disabled}
        title={disabled ? 'Finish the current turn before switching agent' : undefined}
        onClick={() => setOpen((value) => !value)}
        className="flex h-7 items-center gap-1.5 rounded-[var(--radius-control)] border border-border bg-surface-2 pl-1.5 pr-2 text-xs text-text-secondary transition-colors hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:text-text-secondary"
      >
        {active ? (
          <ProviderLogo
            providerId={active.id}
            size="sm"
            className="h-4 w-4 rounded-sm border-0 p-0.5 shadow-none"
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
                  'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs transition-colors',
                  isActive
                    ? 'bg-accent-muted text-accent'
                    : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary'
                )}
              >
                <ProviderLogo
                  providerId={provider.id}
                  size="sm"
                  className="h-4 w-4 rounded-sm border-0 p-0.5 shadow-none"
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
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary"
          >
            <Plus size={13} />
            <span className="flex-1 text-left font-medium">Connect new agent</span>
          </button>
        </div>
      )}
    </div>
  );
}
