import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { AGENTS, agentAccent } from '@/lib/agents';
import { ProviderLogo } from '@/components/providers/ProviderLogo';
import { PET_EMOJI, PET_LABELS } from '@/components/pets/pet-art';
import { useTour } from '@/providers/TourProvider';
import { useTheme } from '@/providers/ThemeProvider';
import { formatReasoningEffort } from '@/containers/voice-console/lib/helpers';
import {
  DESK_PETS,
  type AppSettings,
  type AssistantProviderId,
  type DeskPet,
  type ClaudeSettingsResponse,
  type CodexSettingsResponse,
  type ConsolePreferences,
  type GeminiSettingsResponse,
  type ProviderUsageSnapshot,
  type StatusResponse,
  type VoiceSettingsResponse
} from '@/containers/voice-console/lib/types';

interface SettingsScreenProps {
  appSettings: AppSettings | null;
  preferences: ConsolePreferences;
  codexSettings: CodexSettingsResponse | null;
  claudeSettings: ClaudeSettingsResponse | null;
  geminiSettings: GeminiSettingsResponse | null;
  providerUsage: ProviderUsageSnapshot | null;
  providerUsageLoading: boolean;
  status: StatusResponse | null;
  voiceSettings: VoiceSettingsResponse | null;
  onPreferenceChange: <Key extends keyof ConsolePreferences>(
    key: Key,
    value: ConsolePreferences[Key]
  ) => void;
  onAppSettingChange: <Key extends keyof AppSettings>(key: Key, value: AppSettings[Key]) => void;
  onVoiceSettingChange: (
    key: keyof VoiceSettingsResponse['settings'],
    value: VoiceSettingsResponse['settings'][keyof VoiceSettingsResponse['settings']]
  ) => void;
  onCodexSettingChange: (
    key: keyof CodexSettingsResponse['settings'],
    value: CodexSettingsResponse['settings'][keyof CodexSettingsResponse['settings']]
  ) => void;
  onClaudeSettingChange: (
    key: keyof ClaudeSettingsResponse['settings'],
    value: ClaudeSettingsResponse['settings'][keyof ClaudeSettingsResponse['settings']]
  ) => void;
  onGeminiSettingChange: (
    key: keyof GeminiSettingsResponse['settings'],
    value: GeminiSettingsResponse['settings'][keyof GeminiSettingsResponse['settings']]
  ) => void;
  onProviderConnect: (providerId: AssistantProviderId) => void;
  onProviderDisconnect: (providerId: AssistantProviderId) => void;
  onProviderSwitch: (providerId: AssistantProviderId) => void;
  onUpdateCli: (providerId: AssistantProviderId) => void;
  onRefreshProviderUsage: () => void;
  onSaveCodexSettings: () => void;
  onSaveClaudeSettings: () => void;
  onSaveGeminiSettings: () => void;
  codexSettingsDirty: boolean;
  claudeSettingsDirty: boolean;
  geminiSettingsDirty: boolean;
  agentBusy: boolean;
}

function ActiveStateControl({
  providerId,
  activeProviderId,
  onProviderSwitch,
  disabled
}: {
  providerId: AssistantProviderId;
  activeProviderId: AssistantProviderId | null;
  onProviderSwitch: (providerId: AssistantProviderId) => void;
  disabled?: boolean;
}) {
  if (providerId === activeProviderId) {
    return (
      <Badge variant="outline" className="text-xs">
        Active
      </Badge>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="h-6 text-xs"
      disabled={disabled}
      title={disabled ? 'Finish the current turn before switching agent' : undefined}
      onClick={() => onProviderSwitch(providerId)}
    >
      Make active
    </Button>
  );
}

function SettingRow({
  label,
  hint,
  children
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-center justify-between gap-4 py-2">
      <span className="flex min-w-0 flex-col">
        <span className="text-sm text-text-secondary">{label}</span>
        {hint ? <span className="text-xs text-text-tertiary">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

function SettingInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <span className="text-sm text-text-secondary">{label}</span>
      <span className="text-sm font-medium text-text-primary text-right">{value}</span>
    </div>
  );
}

function SectionCard({
  title,
  subtitle,
  icon,
  accent,
  children
}: {
  title: string;
  subtitle: string;
  /** Optional leading mark — agent cards pass a ProviderLogo so they are identifiable at a glance. */
  icon?: React.ReactNode;
  /** Tints the card's eyebrow and its top hairline to the owning agent's brand color. */
  accent?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius-panel)] border border-border bg-surface-1 overflow-hidden">
      {accent ? <div className="h-0.5 w-full" style={{ backgroundColor: accent }} /> : null}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
        {icon}
        <div className="min-w-0">
          <span
            className={cn(
              'text-xs font-medium uppercase tracking-wider',
              accent ? undefined : 'text-text-tertiary'
            )}
            style={accent ? { color: accent } : undefined}
          >
            {title}
          </span>
          <p className="text-sm font-medium text-text-primary mt-0.5">{subtitle}</p>
        </div>
      </div>
      <div className="px-4 py-2 divide-y divide-border/50">{children}</div>
    </div>
  );
}

function UsageMeter({
  label,
  percentUsed,
  detail,
  resetAt
}: {
  label: string;
  percentUsed: number | null;
  detail: string | null;
  resetAt: string | null;
}) {
  const safePercent = percentUsed === null ? null : Math.min(100, Math.max(0, percentUsed));
  return (
    <div className="py-3">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-text-primary">{label}</span>
        <span className="text-text-secondary">
          {safePercent === null ? 'Unavailable' : `${safePercent}% used`}
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full bg-accent transition-[width]"
          style={{ width: `${safePercent ?? 0}%` }}
        />
      </div>
      {(detail || resetAt) && (
        <p className="mt-2 text-xs text-text-tertiary">
          {[detail, resetAt ? `Resets ${resetAt}` : null].filter(Boolean).join(' · ')}
        </p>
      )}
    </div>
  );
}

function ProviderUsageSection({
  providerId,
  activeProviderId,
  providerUsage,
  loading,
  onRefresh
}: {
  providerId: AssistantProviderId;
  activeProviderId: AssistantProviderId | null;
  providerUsage: ProviderUsageSnapshot | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  // There is ONE live usage snapshot and it belongs to the ACTIVE agent's CLI — not one per agent.
  // Rendering it inside every agent's section meant Claude's card displayed Codex's numbers and
  // Codex's errors ("Claude Code → Could not read Codex usage"). A non-active agent gets an
  // explanation instead of somebody else's data.
  if (providerId !== activeProviderId) {
    return (
      <SectionCard title="Provider usage" subtitle="Live CLI usage and limits">
        <p className="py-3 text-sm text-text-tertiary">
          Usage is read live from whichever agent is active
          {activeProviderId
            ? ` (right now that's ${AGENTS[activeProviderId]?.label ?? activeProviderId})`
            : ''}
          . Make {AGENTS[providerId]?.label ?? providerId} active to see its usage and limits.
        </p>
      </SectionCard>
    );
  }

  // Usage is captured live from the CLI. Always render the section (so it never looks "missing"):
  // it shows a loading state while the scrape runs, the meters when they land, or a hint/error
  // otherwise. Codex's scrape can take ~15–25s cold.
  const hasUsage = Boolean(
    providerUsage?.available &&
    (providerUsage.meters.length > 0 ||
      providerUsage.contextWindow ||
      providerUsage.details.length > 0)
  );

  return (
    <SectionCard title="Provider usage" subtitle="Live CLI usage and limits">
      <div className="flex items-center justify-between gap-4 py-3">
        <div>
          <p className="text-sm font-medium text-text-primary">
            {providerUsage?.providerName ?? 'Active provider'}
          </p>
          <p className="text-xs text-text-tertiary">
            {providerUsage?.command
              ? `Source: ${providerUsage.command}`
              : 'Connect a provider to inspect live usage.'}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          disabled={loading || !providerUsage?.providerId}
          onClick={onRefresh}
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </Button>
      </div>

      {loading && <div className="py-3 text-sm text-text-secondary">Reading live CLI usage…</div>}

      {!loading && providerUsage?.error && (
        <div className="py-3 text-sm text-danger">{providerUsage.error}</div>
      )}

      {!loading && !hasUsage && !providerUsage?.error && (
        <div className="py-3 text-sm text-text-tertiary">
          No usage to show yet — tap Refresh to read it from the CLI.
        </div>
      )}

      {!loading && hasUsage && providerUsage && (
        <>
          {(providerUsage.model || providerUsage.accountLabel || providerUsage.sessionId) && (
            <div className="py-3 space-y-2">
              {providerUsage.model && (
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-text-secondary">Model</span>
                  <span className="font-medium text-text-primary text-right">
                    {providerUsage.model}
                  </span>
                </div>
              )}
              {providerUsage.accountLabel && (
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-text-secondary">Account</span>
                  <span className="font-medium text-text-primary text-right">
                    {providerUsage.accountLabel}
                  </span>
                </div>
              )}
              {providerUsage.sessionId && (
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-text-secondary">Session</span>
                  <span className="font-medium text-text-primary text-right break-all">
                    {providerUsage.sessionId}
                  </span>
                </div>
              )}
            </div>
          )}

          {providerUsage.contextWindow && (
            <div className="py-3">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-text-primary">Context window</span>
                <span className="text-text-secondary">
                  {providerUsage.contextWindow.percentLeft ?? 0}% left
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full bg-accent transition-[width]"
                  style={{ width: `${providerUsage.contextWindow.percentUsed ?? 0}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-text-tertiary">
                {providerUsage.contextWindow.detail}
              </p>
            </div>
          )}

          {providerUsage.meters.length > 0 && (
            <div>
              {providerUsage.meters.map((meter) => (
                <UsageMeter
                  key={meter.id}
                  label={meter.label}
                  percentUsed={meter.percentUsed}
                  detail={meter.detail}
                  resetAt={meter.resetAt}
                />
              ))}
            </div>
          )}

          {providerUsage.details.length > 0 && (
            <div className="py-3 space-y-2">
              {providerUsage.details.map((detail) => (
                <div className="flex items-center justify-between gap-3 text-sm" key={detail.label}>
                  <span className="text-text-secondary">{detail.label}</span>
                  <span className="font-medium text-text-primary text-right break-words">
                    {detail.value}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </SectionCard>
  );
}

export function SettingsScreen({
  appSettings,
  preferences,
  codexSettings,
  claudeSettings,
  geminiSettings,
  providerUsage,
  providerUsageLoading,
  status,
  voiceSettings,
  onAppSettingChange,
  onPreferenceChange,
  onVoiceSettingChange,
  onCodexSettingChange,
  onClaudeSettingChange,
  onGeminiSettingChange,
  onProviderConnect,
  onProviderDisconnect,
  onProviderSwitch,
  onUpdateCli,
  onRefreshProviderUsage,
  onSaveCodexSettings,
  onSaveClaudeSettings,
  onSaveGeminiSettings,
  codexSettingsDirty,
  claudeSettingsDirty,
  geminiSettingsDirty,
  agentBusy
}: SettingsScreenProps) {
  const { resetTours } = useTour();
  const { theme, setTheme } = useTheme();
  const activeProvider = status?.assistantProviders.activeProvider ?? null;
  const activeProviderId = activeProvider?.id ?? null;
  // While a turn is in flight, block switching the active agent (any provider) and block changing
  // the ACTIVE provider's model/effort. Editing an inactive provider's prefs stays allowed (it
  // doesn't touch the running turn). Mirrors the Topbar guard.
  const busyFor = (id: AssistantProviderId) => agentBusy && activeProviderId === id;
  const allProviders = status?.assistantProviders.providers ?? [];
  const connectedProviders = allProviders.filter((p) => p.appConnected);
  // Providers the user can connect right now without leaving Settings: CLI-installed and
  // logged in, but not yet app-connected. (Anything needing CLI install/login is sent to onboarding.)
  const connectableProviders = allProviders.filter(
    (p) => !p.appConnected && p.installed && p.loggedIn
  );
  const hasSetupPending = allProviders.some(
    (p) => !p.appConnected && (!p.installed || !p.loggedIn)
  );
  // Per-provider connection comes from each provider's own `appConnected` flag,
  // not from whichever one happens to be active (multiple may be connected).
  const codexConnected = allProviders.some((p) => p.id === 'codex' && p.appConnected);
  const claudeConnected = allProviders.some((p) => p.id === 'claude' && p.appConnected);
  const geminiConnected = allProviders.some((p) => p.id === 'gemini' && p.appConnected);

  const selectClass = cn(
    'h-8 rounded-[var(--radius-control)] bg-surface-2 border border-border px-2 text-sm text-text-primary',
    'focus:outline-none focus:border-accent-border focus:ring-1 focus:ring-accent-border',
    'disabled:cursor-not-allowed disabled:opacity-50'
  );
  const [displayNameDraft, setDisplayNameDraft] = useState(appSettings?.displayName ?? '');
  // Reset the editable draft when the persisted display name changes, the render-phase way
  // (https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes).
  const [syncedDisplayName, setSyncedDisplayName] = useState(appSettings?.displayName ?? null);
  if ((appSettings?.displayName ?? null) !== syncedDisplayName) {
    setSyncedDisplayName(appSettings?.displayName ?? null);
    setDisplayNameDraft(appSettings?.displayName ?? '');
  }

  return (
    <div>
      <div className="mb-6">
        <p className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-1">
          Settings
        </p>
        <h2 className="text-lg font-semibold text-text-primary">Settings</h2>
      </div>

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="voice">Voice</TabsTrigger>
          <TabsTrigger value="assistant">Agents</TabsTrigger>
        </TabsList>

        {/* General Tab */}
        <TabsContent value="general" className="flex flex-col gap-4">
          <SectionCard title="App profile" subtitle="Identity and appearance">
            <SettingRow label="Display name">
              <Input
                className="w-48"
                maxLength={48}
                value={displayNameDraft}
                onBlur={() => onAppSettingChange('displayName', displayNameDraft)}
                onChange={(e) => setDisplayNameDraft(e.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.currentTarget.blur();
                  }
                }}
                placeholder="Your name"
              />
            </SettingRow>
            <SettingRow label="Theme">
              {/* Drive the real theme (ThemeProvider) so it actually applies AND stays in sync with
                  the topbar sun/moon toggle — the old app-settings path didn't apply the theme. */}
              <select
                className={selectClass}
                value={theme}
                onChange={(e) => setTheme(e.target.value as AppSettings['theme'])}
              >
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
            </SettingRow>
            <SettingRow label="Default screen">
              <select
                className={selectClass}
                value={preferences.defaultScreen}
                onChange={(e) =>
                  onPreferenceChange(
                    'defaultScreen',
                    e.target.value as ConsolePreferences['defaultScreen']
                  )
                }
              >
                <option value="voice">Voice</option>
                <option value="terminal">Agentic Chat</option>
                <option value="workspace">Workspace</option>
              </select>
            </SettingRow>
            <SettingRow
              label="Product tour"
              hint="Replay the guided walkthrough that appears the first time you open each screen."
            >
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => resetTours()}
              >
                Replay tour
              </Button>
            </SettingRow>
            <SettingRow
              label="Desk pet"
              hint="A tiny animated companion that waddles along the top bar. Purely cosmetic — turn it off if you'd rather not have it."
            >
              <input
                type="checkbox"
                className="h-4 w-4 accent-accent"
                checked={appSettings?.showDeskPet ?? true}
                onChange={(e) => onAppSettingChange('showDeskPet', e.target.checked)}
              />
            </SettingRow>
            {appSettings?.showDeskPet !== false && (
              <SettingRow label="Which pet" hint="Pick your companion.">
                <select
                  className="rounded-[var(--radius-control)] border border-border bg-surface-2 px-2 py-1 text-sm text-text-primary"
                  value={appSettings?.deskPet ?? 'duck'}
                  onChange={(e) => onAppSettingChange('deskPet', e.target.value as DeskPet)}
                >
                  {DESK_PETS.map((pet) => (
                    <option key={pet} value={pet}>
                      {PET_EMOJI[pet]} {PET_LABELS[pet]}
                    </option>
                  ))}
                </select>
              </SettingRow>
            )}
          </SectionCard>

          <SectionCard
            title="Assistant providers"
            subtitle="Connect agents and switch the active one on demand"
          >
            <div className="flex items-center justify-between gap-4 py-2">
              <span className="text-sm text-text-secondary">Active agent</span>
              {activeProvider ? (
                <span className="flex min-w-0 items-center gap-2">
                  <ProviderLogo providerId={activeProvider.id} size="sm" />
                  <span className="truncate text-sm font-medium text-text-primary">
                    {activeProvider.name}
                  </span>
                </span>
              ) : (
                <span className="text-sm font-medium text-text-primary">
                  No agent connected yet
                </span>
              )}
            </div>
            {connectedProviders.length > 0 ? (
              connectedProviders.map((provider) => (
                <div key={provider.id} className="flex items-center justify-between gap-4 py-2.5">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <ProviderLogo providerId={provider.id} size="sm" />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium text-text-primary">
                        {provider.name}
                      </span>
                      <span className="text-xs text-text-tertiary">
                        {AGENTS[provider.id]?.vendor ?? 'Agent'}
                      </span>
                    </span>
                  </span>
                  <div className="flex items-center gap-2">
                    <ActiveStateControl
                      providerId={provider.id}
                      activeProviderId={activeProviderId}
                      onProviderSwitch={onProviderSwitch}
                      disabled={agentBusy}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs"
                      onClick={() => onUpdateCli(provider.id)}
                      title={`Run \`${provider.id} update\` to install the latest CLI`}
                    >
                      Update CLI
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs text-danger"
                      onClick={() => onProviderDisconnect(provider.id)}
                    >
                      Disconnect
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-2 text-sm text-text-secondary">
                No agent connected yet. Connect one below to unlock provider-specific controls.
              </div>
            )}

            {connectableProviders.length > 0 &&
              connectableProviders.map((provider) => (
                <div
                  key={provider.id}
                  className="flex items-center justify-between gap-4 border-t border-border/50 py-2"
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <ProviderLogo providerId={provider.id} size="sm" className="opacity-60" />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm text-text-secondary">{provider.name}</span>
                      <span className="text-xs text-text-tertiary">
                        {provider.id === 'gemini' ? 'Coming soon' : 'Signed in to CLI · ready'}
                      </span>
                    </span>
                  </span>
                  {provider.id === 'gemini' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-xs"
                      disabled
                      title="Gemini support is still in testing"
                    >
                      Coming soon
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-xs"
                      onClick={() => onProviderConnect(provider.id)}
                    >
                      Connect
                    </Button>
                  )}
                </div>
              ))}

            {hasSetupPending && (
              <div className="border-t border-border/50 py-2 text-xs text-text-tertiary">
                Another agent needs its CLI installed and signed in before it can connect here.
              </div>
            )}
          </SectionCard>
        </TabsContent>

        {/* Voice Tab */}
        <TabsContent value="voice" className="flex flex-col gap-4">
          <SectionCard title="Voice controls" subtitle="Native session preferences">
            <SettingRow
              label="Auto-send transcripts"
              hint="On: speak and the message sends itself. Off: your words land in the input box to edit before sending."
            >
              <input
                type="checkbox"
                className="h-4 w-4 accent-accent"
                checked={preferences.autoSendVoice}
                onChange={(e) => onPreferenceChange('autoSendVoice', e.target.checked)}
              />
            </SettingRow>
            {/* Read-only: there's exactly one on-device engine (no cloud fallback), so this is
                informational, not a choice. Keeps the privacy reassurance in a sensible spot. */}
            <SettingRow
              label="Speech-to-text"
              hint="Runs locally on your Mac — your audio never leaves the device, nothing is uploaded."
            >
              <span className="text-sm font-medium text-text-primary">On-device (private)</span>
            </SettingRow>
            <SettingRow
              label="Silence window"
              hint="How long to wait after you stop talking before finalizing a phrase."
            >
              <select
                className={selectClass}
                value={String(voiceSettings?.settings.silenceWindowMs ?? 800)}
                onChange={(e) => onVoiceSettingChange('silenceWindowMs', Number(e.target.value))}
              >
                <option value="700">0.7s</option>
                <option value="800">0.8s</option>
                <option value="1000">1.0s</option>
                <option value="1500">1.5s</option>
                <option value="2000">2.0s</option>
                <option value="2500">2.5s</option>
                <option value="3000">3.0s</option>
              </select>
            </SettingRow>
          </SectionCard>
        </TabsContent>

        {/* Assistant Tab */}
        <TabsContent value="assistant" className="flex flex-col gap-4">
          {codexConnected && (
            <>
              <SectionCard
                title="OpenAI Codex"
                subtitle="Execution preferences"
                icon={<ProviderLogo providerId="codex" size="sm" />}
                accent={agentAccent('codex')}
              >
                <SettingRow label="Model">
                  <select
                    className={selectClass}
                    disabled={busyFor('codex')}
                    value={codexSettings?.settings.model ?? ''}
                    onChange={(e) => onCodexSettingChange('model', e.target.value || null)}
                  >
                    <option value="">Use Codex default</option>
                    {(codexSettings?.options.models ?? []).map((m) => (
                      <option key={m.slug} value={m.slug}>
                        {m.displayName}
                      </option>
                    ))}
                  </select>
                </SettingRow>
                <SettingRow label="Reasoning effort">
                  <select
                    className={selectClass}
                    disabled={busyFor('codex')}
                    value={codexSettings?.settings.reasoningEffort ?? ''}
                    onChange={(e) =>
                      onCodexSettingChange(
                        'reasoningEffort',
                        (e.target.value ||
                          null) as CodexSettingsResponse['settings']['reasoningEffort']
                      )
                    }
                  >
                    <option value="">Use model default</option>
                    {(
                      codexSettings?.options.models.find(
                        (m) => m.slug === codexSettings?.settings.model
                      )?.supportedReasoningEfforts ?? []
                    ).map((r) => (
                      <option key={r.effort} value={r.effort}>
                        {formatReasoningEffort(r.effort)}
                      </option>
                    ))}
                  </select>
                </SettingRow>
                <SettingRow label="Voice turns">
                  <select
                    className={selectClass}
                    value={codexSettings?.settings.voiceModelMode ?? 'auto'}
                    onChange={(e) =>
                      onCodexSettingChange(
                        'voiceModelMode',
                        e.target.value as CodexSettingsResponse['settings']['voiceModelMode']
                      )
                    }
                  >
                    <option value="auto">Auto</option>
                    <option value="fast">Always fast</option>
                    <option value="inherit">Same as chat</option>
                  </select>
                </SettingRow>
                <div className="flex items-center justify-between gap-4 py-2">
                  <span className="text-sm text-text-secondary">Active</span>
                  <ActiveStateControl
                    providerId="codex"
                    activeProviderId={activeProviderId}
                    onProviderSwitch={onProviderSwitch}
                    disabled={agentBusy}
                  />
                </div>
                <SettingInfo
                  label="Current model"
                  value={codexSettings?.settings.model ?? 'Codex default'}
                />
                <SettingInfo label="Source" value={codexSettings?.source ?? 'default'} />
                <div className="flex items-center justify-between gap-4 pt-2">
                  <span className="text-xs text-text-tertiary">
                    {codexSettingsDirty ? 'Unsaved changes' : 'All changes saved'}
                  </span>
                  <Button size="sm" disabled={!codexSettingsDirty} onClick={onSaveCodexSettings}>
                    Save
                  </Button>
                </div>
              </SectionCard>
              <ProviderUsageSection
                providerId="codex"
                activeProviderId={activeProviderId}
                providerUsage={providerUsage}
                loading={providerUsageLoading}
                onRefresh={onRefreshProviderUsage}
              />
            </>
          )}

          {claudeConnected && (
            <>
              <SectionCard
                title="Claude Code"
                subtitle="Execution preferences"
                icon={<ProviderLogo providerId="claude" size="sm" />}
                accent={agentAccent('claude')}
              >
                <SettingRow label="Model">
                  <select
                    className={selectClass}
                    disabled={busyFor('claude')}
                    value={claudeSettings?.settings.model ?? ''}
                    onChange={(e) => onClaudeSettingChange('model', e.target.value || null)}
                  >
                    <option value="">Use Claude default</option>
                    {(claudeSettings?.options.models ?? []).map((m) => (
                      <option key={m.slug} value={m.slug}>
                        {m.displayName}
                        {m.suggestedForDiscussion ? ' \u00B7 suggested' : ''}
                      </option>
                    ))}
                  </select>
                </SettingRow>
                <SettingRow label="Reasoning effort">
                  <select
                    className={selectClass}
                    disabled={busyFor('claude')}
                    value={claudeSettings?.settings.reasoningEffort ?? ''}
                    onChange={(e) =>
                      onClaudeSettingChange(
                        'reasoningEffort',
                        (e.target.value ||
                          null) as ClaudeSettingsResponse['settings']['reasoningEffort']
                      )
                    }
                  >
                    <option value="">Use Claude default</option>
                    {(claudeSettings?.options.reasoningEfforts ?? []).map((r) => (
                      <option key={r.effort} value={r.effort}>
                        {formatReasoningEffort(r.effort)}
                      </option>
                    ))}
                  </select>
                </SettingRow>
                <SettingRow label="Voice turns">
                  <select
                    className={selectClass}
                    value={claudeSettings?.settings.voiceModelMode ?? 'auto'}
                    onChange={(e) =>
                      onClaudeSettingChange(
                        'voiceModelMode',
                        e.target.value as ClaudeSettingsResponse['settings']['voiceModelMode']
                      )
                    }
                  >
                    <option value="auto">Auto</option>
                    <option value="fast">Always fast</option>
                    <option value="inherit">Same as chat</option>
                  </select>
                </SettingRow>
                <div className="flex items-center justify-between gap-4 py-2">
                  <span className="text-sm text-text-secondary">Active</span>
                  <ActiveStateControl
                    providerId="claude"
                    activeProviderId={activeProviderId}
                    onProviderSwitch={onProviderSwitch}
                    disabled={agentBusy}
                  />
                </div>
                <SettingInfo
                  label="Current model"
                  value={claudeSettings?.settings.model ?? 'Claude default'}
                />
                <SettingInfo label="Source" value={claudeSettings?.source ?? 'default'} />
                <div className="flex items-center justify-between gap-4 pt-2">
                  <span className="text-xs text-text-tertiary">
                    {claudeSettingsDirty ? 'Unsaved changes' : 'All changes saved'}
                  </span>
                  <Button size="sm" disabled={!claudeSettingsDirty} onClick={onSaveClaudeSettings}>
                    Save
                  </Button>
                </div>
              </SectionCard>
              <ProviderUsageSection
                providerId="claude"
                activeProviderId={activeProviderId}
                providerUsage={providerUsage}
                loading={providerUsageLoading}
                onRefresh={onRefreshProviderUsage}
              />
            </>
          )}

          {geminiConnected && (
            <>
              <SectionCard
                title="Google Gemini CLI"
                subtitle="Execution preferences"
                icon={<ProviderLogo providerId="gemini" size="sm" />}
                accent={agentAccent('gemini')}
              >
                <SettingRow label="Model">
                  <select
                    className={selectClass}
                    disabled={busyFor('gemini')}
                    value={geminiSettings?.settings.model ?? ''}
                    onChange={(e) => onGeminiSettingChange('model', e.target.value || null)}
                  >
                    <option value="">Use Gemini default</option>
                    {(geminiSettings?.options.models ?? []).map((m) => (
                      <option key={m.slug} value={m.slug}>
                        {m.displayName}
                        {m.suggestedForDiscussion ? ' · suggested' : ''}
                      </option>
                    ))}
                  </select>
                </SettingRow>
                <SettingRow label="Voice turns">
                  <select
                    className={selectClass}
                    value={geminiSettings?.settings.voiceModelMode ?? 'auto'}
                    onChange={(e) =>
                      onGeminiSettingChange(
                        'voiceModelMode',
                        e.target.value as GeminiSettingsResponse['settings']['voiceModelMode']
                      )
                    }
                  >
                    <option value="auto">Auto</option>
                    <option value="fast">Always fast</option>
                    <option value="inherit">Same as chat</option>
                  </select>
                </SettingRow>
                <div className="flex items-center justify-between gap-4 py-2">
                  <span className="text-sm text-text-secondary">Active</span>
                  <ActiveStateControl
                    providerId="gemini"
                    activeProviderId={activeProviderId}
                    onProviderSwitch={onProviderSwitch}
                    disabled={agentBusy}
                  />
                </div>
                <SettingInfo
                  label="Current model"
                  value={geminiSettings?.settings.model ?? 'Gemini default'}
                />
                <SettingInfo label="Source" value={geminiSettings?.source ?? 'default'} />
                <div className="flex items-center justify-between gap-4 pt-2">
                  <span className="text-xs text-text-tertiary">
                    {geminiSettingsDirty ? 'Unsaved changes' : 'All changes saved'}
                  </span>
                  <Button size="sm" disabled={!geminiSettingsDirty} onClick={onSaveGeminiSettings}>
                    Save
                  </Button>
                </div>
              </SectionCard>
              <ProviderUsageSection
                providerId="gemini"
                activeProviderId={activeProviderId}
                providerUsage={providerUsage}
                loading={providerUsageLoading}
                onRefresh={onRefreshProviderUsage}
              />
            </>
          )}

          {!codexConnected && !claudeConnected && !geminiConnected && (
            <div className="rounded-[var(--radius-panel)] border border-border bg-surface-1 p-8 text-center">
              <p className="text-sm text-text-secondary">No assistant provider connected.</p>
              <p className="text-xs text-text-tertiary mt-1">
                Connect a provider from onboarding to configure model preferences.
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <p className="mt-6 text-center text-xs text-text-tertiary">Oplyr v{__APP_VERSION__}</p>
    </div>
  );
}
