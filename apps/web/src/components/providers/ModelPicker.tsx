import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check, Cpu } from 'lucide-react';
import { cn } from '@/lib/cn';
import type {
  AssistantProviderId,
  ClaudeSettingsResponse,
  CodexSettingsResponse,
  GeminiSettingsResponse
} from '@/containers/voice-console/lib/types';

interface ModelOption {
  slug: string;
  displayName: string;
}

interface ModelPickerProps {
  activeProviderId: AssistantProviderId | null;
  codexSettings: CodexSettingsResponse | null;
  claudeSettings: ClaudeSettingsResponse | null;
  geminiSettings: GeminiSettingsResponse | null;
  onSelectModel: (providerId: AssistantProviderId, slug: string) => void;
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
  onSelectModel
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
        onClick={() => setOpen((value) => !value)}
        className="flex h-7 max-w-[180px] items-center gap-1.5 rounded-[var(--radius-control)] border border-border bg-surface-2 pl-2 pr-2 text-xs text-text-secondary transition-colors hover:text-text-primary"
        title="Change model"
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
          className="absolute right-0 top-[calc(100%+6px)] z-30 max-h-80 min-w-[240px] overflow-y-auto rounded-[var(--radius-control)] border border-border bg-surface-1 p-1 shadow-lg"
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
                  'flex w-full items-center gap-2 rounded-radius-sm px-2 py-1.5 text-xs transition-colors',
                  isActive
                    ? 'bg-accent-muted text-accent'
                    : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary'
                )}
              >
                <span className="flex-1 truncate text-left font-medium">{option.displayName}</span>
                {isActive && <Check size={13} className="shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
