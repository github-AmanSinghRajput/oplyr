import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { formatReasoningEffort } from '@/containers/voice-console/lib/helpers';
import type {
  AppSettings,
  AssistantProviderId,
  ClaudeSettingsResponse,
  CodexSettingsResponse,
  ConsolePreferences,
  GeminiSettingsResponse,
  ProviderUsageSnapshot,
  StatusResponse,
  SystemResponse,
  VoiceSettingsResponse
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
  system: SystemResponse | null;
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
  onProviderDisconnect: (providerId: AssistantProviderId) => void;
  onProviderSwitch: (providerId: AssistantProviderId) => void;
  onRefreshProviderUsage: () => void;
  onSaveCodexSettings: () => void;
  onSaveClaudeSettings: () => void;
  onSaveGeminiSettings: () => void;
  codexSettingsDirty: boolean;
  claudeSettingsDirty: boolean;
  geminiSettingsDirty: boolean;
}

function ActiveStateControl({
  providerId,
  activeProviderId,
  onProviderSwitch
}: {
  providerId: AssistantProviderId;
  activeProviderId: AssistantProviderId | null;
  onProviderSwitch: (providerId: AssistantProviderId) => void;
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
      onClick={() => onProviderSwitch(providerId)}
    >
      Make active
    </Button>
  );
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-4 py-2">
      <span className="text-sm text-text-secondary">{label}</span>
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
  children
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius-panel)] border border-border bg-surface-1 overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <span className="text-xs font-medium text-text-tertiary uppercase tracking-wider">
          {title}
        </span>
        <p className="text-sm font-medium text-text-primary mt-0.5">{subtitle}</p>
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
  providerUsage,
  loading,
  onRefresh
}: {
  providerUsage: ProviderUsageSnapshot | null;
  loading: boolean;
  onRefresh: () => void;
}) {
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

      {!loading && providerUsage?.available && (
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
  system,
  voiceSettings,
  onAppSettingChange,
  onPreferenceChange,
  onVoiceSettingChange,
  onCodexSettingChange,
  onClaudeSettingChange,
  onGeminiSettingChange,
  onProviderDisconnect,
  onProviderSwitch,
  onRefreshProviderUsage,
  onSaveCodexSettings,
  onSaveClaudeSettings,
  onSaveGeminiSettings,
  codexSettingsDirty,
  claudeSettingsDirty,
  geminiSettingsDirty
}: SettingsScreenProps) {
  const activeProvider = status?.assistantProviders.activeProvider ?? null;
  const activeProviderId = activeProvider?.id ?? null;
  const allProviders = status?.assistantProviders.providers ?? [];
  const connectedProviders = allProviders.filter((p) => p.appConnected);
  // Per-provider connection comes from each provider's own `appConnected` flag,
  // not from whichever one happens to be active (multiple may be connected).
  const codexConnected = allProviders.some((p) => p.id === 'codex' && p.appConnected);
  const claudeConnected = allProviders.some((p) => p.id === 'claude' && p.appConnected);
  const geminiConnected = allProviders.some((p) => p.id === 'gemini' && p.appConnected);

  const selectClass = cn(
    'h-8 rounded-[var(--radius-control)] bg-surface-2 border border-border px-2 text-sm text-text-primary',
    'focus:outline-none focus:border-accent-border focus:ring-1 focus:ring-accent-border'
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
        <h2 className="text-lg font-semibold text-text-primary">Voice and operator controls</h2>
      </div>

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="voice">Voice</TabsTrigger>
          <TabsTrigger value="assistant">Assistant</TabsTrigger>
          <TabsTrigger value="display">Display</TabsTrigger>
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
              <select
                className={selectClass}
                value={appSettings?.theme ?? 'dark'}
                onChange={(e) =>
                  onAppSettingChange('theme', e.target.value as AppSettings['theme'])
                }
              >
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
            </SettingRow>
          </SectionCard>

          <SectionCard title="Assistant providers" subtitle="App-managed provider access">
            <SettingInfo
              label="Active provider"
              value={activeProvider?.name ?? 'No provider connected in Oplyr'}
            />
            {connectedProviders.length > 0 ? (
              connectedProviders.map((provider) => (
                <div key={provider.id} className="flex items-center justify-between gap-4 py-2">
                  <span className="text-sm text-text-secondary">{provider.name}</span>
                  <div className="flex items-center gap-2">
                    <ActiveStateControl
                      providerId={provider.id}
                      activeProviderId={activeProviderId}
                      onProviderSwitch={onProviderSwitch}
                    />
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
                Connect a provider from onboarding to unlock provider-specific controls.
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Operator"
            subtitle={system?.auth.operator?.displayName ?? 'Local operator'}
          >
            <SettingInfo
              label="Connected assistants"
              value={
                connectedProviders.length > 0
                  ? connectedProviders.map((p) => p.name).join(', ')
                  : 'No provider connected'
              }
            />
            <SettingInfo
              label="Tracked CLI sessions"
              value={String(system?.auth.trackedSessions.length ?? 0)}
            />
          </SectionCard>
        </TabsContent>

        {/* Voice Tab */}
        <TabsContent value="voice" className="flex flex-col gap-4">
          <SectionCard title="Audio path" subtitle="Current native routing">
            <SettingInfo
              label="Input device"
              value={status?.audio.inputDeviceLabel ?? 'System default input'}
            />
            <SettingInfo
              label="Transcription engine"
              value={status?.audio.transcriptionEngine ?? 'Unavailable'}
            />
            <SettingInfo
              label="Speech engine"
              value="Parakeet (parakeet-tdt-0.6b-v3) — on-device via CoreML (Apple Neural Engine)"
            />
            <SettingInfo
              label="Silence window"
              value={`${status?.voiceSession.silenceWindowMs ?? 800}ms`}
            />
          </SectionCard>

          <SectionCard title="Voice controls" subtitle="Native session preferences">
            <SettingRow label="Quality profile">
              <select
                className={selectClass}
                value={voiceSettings?.settings.qualityProfile ?? 'demo'}
                onChange={(e) =>
                  onVoiceSettingChange(
                    'qualityProfile',
                    e.target.value as VoiceSettingsResponse['settings']['qualityProfile']
                  )
                }
              >
                <option value="demo">Demo quality</option>
                <option value="balanced">Balanced</option>
                <option value="low_memory">Low memory</option>
              </select>
            </SettingRow>
            <SettingRow label="Noise filtering">
              <select
                className={selectClass}
                value={voiceSettings?.settings.noiseMode ?? 'focused'}
                onChange={(e) =>
                  onVoiceSettingChange(
                    'noiseMode',
                    e.target.value as VoiceSettingsResponse['settings']['noiseMode']
                  )
                }
              >
                <option value="focused">Focused voice</option>
                <option value="normal">Normal room</option>
                <option value="noisy_room">Noisy room</option>
              </select>
            </SettingRow>
            <SettingRow label="Locale">
              <select
                className={selectClass}
                value={voiceSettings?.settings.voiceLocale ?? 'en-US'}
                onChange={(e) => onVoiceSettingChange('voiceLocale', e.target.value)}
              >
                <option value="en-US">English (US)</option>
                <option value="en-IN">English (India)</option>
                <option value="hi-IN">Hindi (India)</option>
              </select>
            </SettingRow>
            <SettingRow label="Transcription engine">
              <select
                className={selectClass}
                value={voiceSettings?.settings.transcriptionModel ?? 'parakeet'}
                onChange={(e) =>
                  onVoiceSettingChange(
                    'transcriptionModel',
                    e.target.value as VoiceSettingsResponse['settings']['transcriptionModel']
                  )
                }
              >
                {(voiceSettings?.options.transcriptionModels ?? []).map((m) => (
                  <option disabled={!m.available} key={m.id} value={m.id}>
                    {m.label}
                    {m.available ? '' : ' (configure path)'}
                  </option>
                ))}
              </select>
            </SettingRow>
            <SettingRow label="Transcription language">
              <select
                className={selectClass}
                value={voiceSettings?.settings.transcriptionLanguageCode ?? 'en'}
                onChange={(e) => onVoiceSettingChange('transcriptionLanguageCode', e.target.value)}
              >
                {(voiceSettings?.options.transcriptionLanguages ?? []).map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </SettingRow>
            <SettingRow label="Silence window">
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
            <SettingRow label="Auto-resume after reply">
              <input
                type="checkbox"
                className="h-4 w-4 accent-accent"
                checked={voiceSettings?.settings.autoResumeAfterReply ?? true}
                onChange={(e) => onVoiceSettingChange('autoResumeAfterReply', e.target.checked)}
              />
            </SettingRow>
          </SectionCard>

          <SectionCard title="Voice capabilities" subtitle="Current feature status">
            <div className="flex flex-wrap gap-2 py-3">
              <Badge
                variant={voiceSettings?.capabilities.interruption ? 'outline' : 'secondary'}
                className={cn(
                  'text-xs',
                  voiceSettings?.capabilities.interruption && 'text-success border-success/30'
                )}
              >
                interruption
              </Badge>
              <Badge
                variant={voiceSettings?.capabilities.deviceSelection ? 'outline' : 'secondary'}
                className={cn(
                  'text-xs',
                  voiceSettings?.capabilities.deviceSelection && 'text-success border-success/30'
                )}
              >
                device selection
              </Badge>
              <Badge
                variant={voiceSettings?.capabilities.voiceSelection ? 'outline' : 'secondary'}
                className={cn(
                  'text-xs',
                  voiceSettings?.capabilities.voiceSelection && 'text-success border-success/30'
                )}
              >
                voice selection
              </Badge>
            </div>
          </SectionCard>
        </TabsContent>

        {/* Assistant Tab */}
        <TabsContent value="assistant" className="flex flex-col gap-4">
          {codexConnected && (
            <>
              <SectionCard title="OpenAI Codex" subtitle="Execution preferences">
                <SettingRow label="Model">
                  <select
                    className={selectClass}
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
                providerUsage={providerUsage}
                loading={providerUsageLoading}
                onRefresh={onRefreshProviderUsage}
              />
            </>
          )}

          {claudeConnected && (
            <>
              <SectionCard title="Claude Code" subtitle="Execution preferences">
                <SettingRow label="Model">
                  <select
                    className={selectClass}
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
                providerUsage={providerUsage}
                loading={providerUsageLoading}
                onRefresh={onRefreshProviderUsage}
              />
            </>
          )}

          {geminiConnected && (
            <>
              <SectionCard title="Google Gemini CLI" subtitle="Execution preferences">
                <SettingRow label="Model">
                  <select
                    className={selectClass}
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

        {/* Display Tab */}
        <TabsContent value="display" className="flex flex-col gap-4">
          <SectionCard title="Console preferences" subtitle="Local UI behavior">
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
                <option value="terminal">Terminal</option>
                <option value="workspace">Workspace</option>
              </select>
            </SettingRow>
            <SettingRow label="Transcript density">
              <select
                className={selectClass}
                value={preferences.transcriptDensity}
                onChange={(e) =>
                  onPreferenceChange(
                    'transcriptDensity',
                    e.target.value as ConsolePreferences['transcriptDensity']
                  )
                }
              >
                <option value="comfortable">Comfortable</option>
                <option value="compact">Compact</option>
              </select>
            </SettingRow>
            <SettingRow label="Motion mode">
              <select
                className={selectClass}
                value={preferences.motionMode}
                onChange={(e) =>
                  onPreferenceChange(
                    'motionMode',
                    e.target.value as ConsolePreferences['motionMode']
                  )
                }
              >
                <option value="full">Full</option>
                <option value="reduced">Reduced</option>
              </select>
            </SettingRow>
          </SectionCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}
