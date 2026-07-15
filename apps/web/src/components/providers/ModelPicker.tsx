import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check, Cpu, Gauge, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatReasoningEffort } from '@/containers/voice-console/lib/helpers';
import type {
  AssistantProviderId,
  ClaudeSettingsResponse,
  CodexSettingsResponse,
  GeminiSettingsResponse
} from '@/containers/voice-console/lib/types';

interface ModelOption {
  slug: string;
  displayName: string;
  description?: string;
}

interface ModelPickerProps {
  activeProviderId: AssistantProviderId | null;
  codexSettings: CodexSettingsResponse | null;
  claudeSettings: ClaudeSettingsResponse | null;
  geminiSettings: GeminiSettingsResponse | null;
  onSelectModel: (providerId: AssistantProviderId, slug: string) => void;
  onRefreshModels: (providerId: AssistantProviderId) => void;
  refreshing: boolean;
  disabled?: boolean;
}

/** Resolve the active provider's current model + the model options to choose from. */
function resolveModels(
  activeProviderId: AssistantProviderId | null,
  codexSettings: CodexSettingsResponse | null,
  claudeSettings: ClaudeSettingsResponse | null,
  geminiSettings: GeminiSettingsResponse | null
): { current: string | null; options: ModelOption[] } {
  if (activeProviderId === 'codex' && codexSettings) {
    return { current: codexSettings.settings.model, options: codexSettings.options.models };
  }
  if (activeProviderId === 'claude' && claudeSettings) {
    return { current: claudeSettings.settings.model, options: claudeSettings.options.models };
  }
  if (activeProviderId === 'gemini' && geminiSettings) {
    return { current: geminiSettings.settings.model, options: geminiSettings.options.models };
  }
  return { current: null, options: [] };
}

/**
 * Quick model picker for the active agent — change the model without opening Settings. Persists
 * immediately via onSelectModel. Lightweight, self-contained dropdown (closes on outside click /
 * Escape). Renders nothing when the active provider has no selectable models.
 */
export function ModelPicker({
  activeProviderId,
  codexSettings,
  claudeSettings,
  geminiSettings,
  onSelectModel,
  onRefreshModels,
  refreshing,
  disabled
}: ModelPickerProps) {
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

  const { current, options } = resolveModels(
    activeProviderId,
    codexSettings,
    claudeSettings,
    geminiSettings
  );

  if (!activeProviderId || options.length === 0) return null;

  const currentOption = options.find((option) => option.slug === current) ?? null;
  const label = currentOption?.displayName ?? current ?? 'Default model';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        className="flex h-7 max-w-[180px] items-center gap-1.5 rounded-[var(--radius-control)] border border-border bg-surface-2 pl-2 pr-2 text-xs text-text-secondary transition-colors hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:text-text-secondary"
        title={disabled ? 'Finish the current turn before changing model' : 'Change model'}
      >
        <Cpu size={13} className="shrink-0" />
        <span className="truncate font-medium text-text-primary">{label}</span>
        <ChevronDown
          size={13}
          className={cn('shrink-0 transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+6px)] z-30 max-h-96 min-w-[300px] max-w-[360px] overflow-y-auto rounded-[var(--radius-control)] border border-border bg-surface-1 p-1 shadow-lg"
        >
          {options.map((option) => {
            const isActive = option.slug === current;
            return (
              <button
                key={option.slug}
                type="button"
                role="menuitemradio"
                aria-checked={isActive}
                onClick={() => {
                  if (!isActive) onSelectModel(activeProviderId, option.slug);
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-start gap-2 rounded-radius-sm px-2 py-1.5 text-xs transition-colors',
                  isActive
                    ? 'bg-accent-muted text-accent'
                    : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary'
                )}
              >
                <span className="min-w-0 flex-1 text-left">
                  <span className="block truncate font-medium">{option.displayName}</span>
                  {option.description && (
                    <span className="mt-0.5 block whitespace-normal text-[11px] leading-snug text-text-tertiary">
                      {option.description}
                    </span>
                  )}
                </span>
                {isActive && <Check size={13} className="mt-0.5 shrink-0" />}
              </button>
            );
          })}

          {/* Footer: pull the live model list straight from the agent's CLI (nothing hardcoded). */}
          <div className="my-1 h-px bg-border" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              if (activeProviderId) onRefreshModels(activeProviderId);
            }}
            disabled={refreshing || !activeProviderId}
            className="flex w-full items-center gap-2 rounded-radius-sm px-2 py-1.5 text-xs text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary disabled:opacity-60"
            title="Fetch the latest models from this agent's CLI"
          >
            <RefreshCw size={13} className={cn('shrink-0', refreshing && 'animate-spin')} />
            <span className="flex-1 text-left font-medium">
              {refreshing ? 'Refreshing…' : 'Refresh models'}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

interface EffortOption {
  effort: string;
  description?: string;
}

// Codex accepts `-c model_reasoning_effort=<level>` for any model, so we can always offer these —
// used as a fallback when the selected model's per-model effort list is momentarily unavailable
// (e.g. the model lookup is stale for a tick during a provider switch / settings refetch). This is
// what stops the effort dropdown from spuriously vanishing the instant you pick a model/effort.
const CODEX_FALLBACK_EFFORTS: EffortOption[] = [
  { effort: 'low', description: 'Fast responses with lighter reasoning' },
  { effort: 'medium', description: 'Balanced speed and reasoning depth' },
  { effort: 'high', description: 'Greater reasoning depth for complex work' },
  { effort: 'xhigh', description: 'Extra reasoning depth for the toughest problems' }
];

/** Reasoning-effort options for the active provider's SELECTED model. Codex exposes per-model
 *  supported efforts (falling back to the standard set); Claude exposes a provider-wide list;
 *  Gemini has none. */
function resolveEfforts(
  activeProviderId: AssistantProviderId | null,
  codexSettings: CodexSettingsResponse | null,
  claudeSettings: ClaudeSettingsResponse | null
): { current: string | null; defaultEffort: string | null; options: EffortOption[] } {
  if (activeProviderId === 'codex' && codexSettings) {
    const model = codexSettings.options.models.find(
      (option) => option.slug === codexSettings.settings.model
    );
    const perModel = model?.supportedReasoningEfforts ?? [];
    return {
      current: codexSettings.settings.reasoningEffort,
      defaultEffort: model?.defaultReasoningEffort ?? null,
      // Fall back to the standard set so the picker never disappears mid-interaction.
      options: perModel.length > 0 ? perModel : CODEX_FALLBACK_EFFORTS
    };
  }
  if (activeProviderId === 'claude' && claudeSettings) {
    return {
      current: claudeSettings.settings.reasoningEffort,
      defaultEffort: null,
      options: claudeSettings.options.reasoningEfforts
    };
  }
  return { current: null, defaultEffort: null, options: [] };
}

/**
 * Quick reasoning-effort picker for the active agent's current model. Renders nothing when the
 * provider/model has no effort options (e.g. Gemini, or a Codex model that doesn't support it), so
 * it only appears "if available" — sitting right after the model picker in the Topbar.
 */
export function EffortPicker({
  activeProviderId,
  codexSettings,
  claudeSettings,
  onSelectReasoningEffort,
  disabled
}: {
  activeProviderId: AssistantProviderId | null;
  codexSettings: CodexSettingsResponse | null;
  claudeSettings: ClaudeSettingsResponse | null;
  onSelectReasoningEffort: (providerId: AssistantProviderId, effort: string | null) => void;
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

  const { current, defaultEffort, options } = resolveEfforts(
    activeProviderId,
    codexSettings,
    claudeSettings
  );

  if (!activeProviderId || options.length === 0) return null;

  const effective = current ?? defaultEffort;
  const label = current
    ? formatReasoningEffort(current)
    : defaultEffort
      ? `${formatReasoningEffort(defaultEffort)} · default`
      : 'Effort';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        className="flex h-7 max-w-[160px] items-center gap-1.5 rounded-[var(--radius-control)] border border-border bg-surface-2 pl-2 pr-2 text-xs text-text-secondary transition-colors hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:text-text-secondary"
        title={
          disabled ? 'Finish the current turn before changing reasoning effort' : 'Reasoning effort'
        }
      >
        <Gauge size={13} className="shrink-0" />
        <span className="truncate font-medium text-text-primary">{label}</span>
        <ChevronDown
          size={13}
          className={cn('shrink-0 transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+6px)] z-30 max-h-80 min-w-[240px] overflow-y-auto rounded-[var(--radius-control)] border border-border bg-surface-1 p-1 shadow-lg"
        >
          {options.map((option) => {
            const isActive = option.effort === effective;
            return (
              <button
                key={option.effort}
                type="button"
                role="menuitemradio"
                aria-checked={isActive}
                onClick={() => {
                  if (option.effort !== current)
                    onSelectReasoningEffort(activeProviderId, option.effort);
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full flex-col items-start gap-0.5 rounded-radius-sm px-2 py-1.5 text-xs transition-colors',
                  isActive
                    ? 'bg-accent-muted text-accent'
                    : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary'
                )}
              >
                <span className="flex w-full items-center gap-2 font-medium">
                  <span className="flex-1 text-left">{formatReasoningEffort(option.effort)}</span>
                  {isActive && <Check size={13} className="shrink-0" />}
                </span>
                {option.description ? (
                  <span className="text-left text-[11px] text-text-tertiary">
                    {option.description}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
