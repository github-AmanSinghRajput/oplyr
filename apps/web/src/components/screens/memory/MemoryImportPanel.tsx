import { useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  FolderGit2,
  Loader2,
  MessageSquare,
  Sparkles,
  X
} from 'lucide-react';
import { useMemoryImport, isPendingSource } from '@/providers/MemoryImportProvider';
import { Button } from '@/components/ui/button';
import { ProviderLogo } from '@/components/providers/ProviderLogo';
import { cn } from '@/lib/cn';
import type {
  AssistantProviderId,
  ImportAgentGroup,
  ImportFile
} from '@/containers/voice-console/lib/types';

const AGENT_NAME: Record<AssistantProviderId, string> = {
  claude: 'Claude',
  codex: 'Codex',
  gemini: 'Gemini'
};

const GLOBAL_FILE_NAME: Record<AssistantProviderId, string> = {
  claude: 'CLAUDE.md',
  codex: 'AGENTS.md',
  gemini: 'GEMINI.md'
};

interface MemoryImportPanelProps {
  /** Onboarding / modal variant: tighter spacing, smaller type. */
  compact?: boolean;
  /** Show a dismiss (×) control that hides the card for the session (survives tab switches). */
  dismissible?: boolean;
  /** Nudge surfaces (Onboarding, Workspace): render nothing when there's nothing new to bring in,
   *  so the card only appears when it has a job. The Memory hub omits this to stay a management view. */
  hideWhenCaughtUp?: boolean;
  className?: string;
}

/** Split an agent group into its pending (new/changed) and already-in-brain files. */
function partitionAgent(agent: ImportAgentGroup): { pending: ImportFile[]; added: ImportFile[] } {
  const all = [agent.global, ...agent.projects, ...agent.sessions].filter(
    (file): file is ImportFile => Boolean(file)
  );
  return {
    pending: all.filter(isPendingSource),
    added: all.filter((file) => file.status === 'added')
  };
}

/**
 * Scan → preview → import panel for bringing existing agent memory into the Brain. All of its state
 * (scan, selection, running import) lives in the app-root `MemoryImportProvider`, so this panel stays
 * in sync everywhere it's mounted and a running import survives navigation. On disk it never reads
 * file bodies during the scan; the import is performed by the user's own connected agent, locally.
 */
export function MemoryImportPanel({
  compact = false,
  dismissible = false,
  hideWhenCaughtUp = false,
  className
}: MemoryImportPanelProps) {
  const {
    scanState,
    manifest,
    scanError,
    hasImportable,
    pendingCount,
    addedCount,
    selected,
    selectedCount,
    toggle,
    rescan,
    run,
    startImport,
    dismissDone,
    dismissed,
    dismiss
  } = useMemoryImport();
  const [showAdded, setShowAdded] = useState(false);

  const running = run.status === 'running';
  const done = run.status === 'done';

  // Dismissed (session-level, from the shared provider) → hide entirely while idle, so it doesn't
  // reappear on tab switches. A running/finished import still shows its progress/summary.
  if (dismissible && dismissed && !running && !done) {
    return null;
  }

  // Slim placeholder while the first scan runs, so nothing tall flashes in tight contexts.
  if (scanState === 'scanning' && !manifest) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 rounded-[var(--radius-panel)] border border-border bg-surface-1 px-4 py-3 text-xs text-text-tertiary',
          className
        )}
      >
        <Loader2 size={14} className="animate-spin" />
        Checking for existing agent memory…
      </div>
    );
  }

  // Scan failed (e.g. a transient filesystem error) — surface it with a retry instead of vanishing
  // silently, so the import feature never just "disappears".
  if (scanState === 'error' && !manifest) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 rounded-[var(--radius-panel)] border border-border bg-surface-1 px-4 py-3 text-xs',
          className
        )}
      >
        <span className="text-danger">Couldn&apos;t check for existing agent memory.</span>
        <button
          type="button"
          onClick={() => void rescan()}
          className="font-medium text-accent transition-colors hover:opacity-80"
        >
          Retry
        </button>
      </div>
    );
  }

  // Nothing on disk to bring in (and not mid/post-run) — render nothing so hosts stay clean.
  if (!hasImportable && !done) {
    return null;
  }

  const agents = manifest?.agents ?? [];
  const caughtUp = pendingCount === 0 && !running && !done;

  // On nudge surfaces, don't linger as an "all caught up" card — appear only when there's work.
  if (hideWhenCaughtUp && caughtUp) {
    return null;
  }
  const pct = run.total > 0 ? Math.round((run.current / run.total) * 100) : 0;
  const liveAtoms = run.atomsAdded;

  const title = done
    ? 'Memory imported'
    : running
      ? 'Adding memories to your brain…'
      : caughtUp
        ? 'Your agent memory is in your brain'
        : 'Import your existing agent memory';

  const subtitle = done
    ? `Added ${liveAtoms} ${liveAtoms === 1 ? 'memory' : 'memories'} from your existing setup.`
    : running
      ? run.activeLabel
        ? `Adding ${run.activeLabel}…`
        : 'Reading your memory and storing the gist locally.'
      : caughtUp
        ? 'Everything we found is already in your brain.'
        : pendingCount > 0
          ? `Found ${pendingCount} ${pendingCount === 1 ? 'source' : 'sources'} worth bringing in.`
          : 'Bring your agent memory into your brain.';

  return (
    <div
      className={cn(
        'rounded-[var(--radius-panel)] border border-border bg-surface-1',
        compact ? 'p-4' : 'p-5',
        className
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-accent-muted text-accent">
          {done ? <Check size={18} /> : <Sparkles size={18} />}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className={cn('font-semibold text-text-primary', compact ? 'text-sm' : 'text-base')}>
            {title}
          </h3>
          <p className={cn('mt-0.5 text-text-secondary', compact ? 'text-xs' : 'text-sm')}>
            {subtitle}
          </p>
        </div>
        {dismissible && !running && (
          <button
            type="button"
            className="shrink-0 text-text-tertiary transition-colors hover:text-text-primary"
            onClick={dismiss}
            aria-label="Dismiss"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {(scanError || run.error) && (
        <p className="mt-3 text-xs text-danger">{run.error ?? scanError}</p>
      )}

      {done ? (
        <div className={cn('flex items-center gap-3', compact ? 'mt-3' : 'mt-4')}>
          {run.skipped.length > 0 && (
            <span className="text-xs text-text-tertiary">
              {run.skipped.length} skipped (nothing durable to keep)
            </span>
          )}
          <div className="ml-auto">
            <Button size={compact ? 'sm' : 'default'} variant="outline" onClick={dismissDone}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* Pending sources — new + changed, the only ones we ask you to select. */}
          {pendingCount > 0 && (
            <div
              className={cn(
                'max-h-[min(46vh,420px)] space-y-2 overflow-y-auto pr-1',
                compact ? 'mt-3' : 'mt-4'
              )}
            >
              {agents.map((agent) => {
                const { pending } = partitionAgent(agent);
                if (pending.length === 0) return null;
                return (
                  <AgentGroup
                    key={agent.providerId}
                    providerId={agent.providerId}
                    files={pending}
                    selected={selected}
                    onToggle={toggle}
                    running={running}
                    perSource={run.perSource}
                    compact={compact}
                  />
                );
              })}
            </div>
          )}

          {/* Already-in-brain sources, hidden behind a quiet expander. */}
          {addedCount > 0 && (
            <div className={cn(compact ? 'mt-3' : 'mt-4')}>
              <button
                type="button"
                onClick={() => setShowAdded((value) => !value)}
                className="flex items-center gap-1.5 text-xs text-text-tertiary transition-colors hover:text-text-secondary"
              >
                {showAdded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                {addedCount} already in your brain
              </button>
              {showAdded && (
                <div className="mt-2 space-y-2">
                  {agents.map((agent) => {
                    const { added } = partitionAgent(agent);
                    if (added.length === 0) return null;
                    return (
                      <AgentGroup
                        key={agent.providerId}
                        providerId={agent.providerId}
                        files={added}
                        selected={selected}
                        onToggle={toggle}
                        running={running}
                        perSource={run.perSource}
                        compact={compact}
                        resolved
                      />
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {running ? (
            <div className="mt-4">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-text-tertiary">
                <span className="flex min-w-0 items-center gap-1.5">
                  <Loader2 size={12} className="shrink-0 animate-spin" />
                  <span className="truncate">
                    {run.current}/{run.total} · {run.activeLabel || 'adding memories'}…
                  </span>
                </span>
                <span className="shrink-0 tabular-nums text-text-secondary">{liveAtoms} added</span>
              </div>
            </div>
          ) : (
            !caughtUp && (
              <>
                <p
                  className={cn(
                    'text-text-tertiary',
                    compact ? 'mt-3 text-[11px]' : 'mt-4 text-xs'
                  )}
                >
                  Nothing is added until you press the button. Your own connected agent reads these
                  and stores the gist locally.
                </p>
                <div className="mt-3 flex items-center gap-3">
                  <Button
                    size={compact ? 'sm' : 'default'}
                    disabled={selectedCount === 0}
                    onClick={() => void startImport()}
                  >
                    {selectedCount > 0 ? `Add ${selectedCount} to your brain` : 'Add to your brain'}
                  </Button>
                </div>
              </>
            )
          )}
        </>
      )}
    </div>
  );
}

function statusChip(file: ImportFile) {
  if (file.status === 'changed') {
    return (
      <span className="shrink-0 rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-medium text-warning">
        update available
      </span>
    );
  }
  return (
    <span className="shrink-0 rounded-full bg-accent-muted px-1.5 py-0.5 text-[10px] font-medium text-accent">
      new
    </span>
  );
}

function kindIcon(kind: ImportFile['kind']) {
  if (kind === 'global') return FileText;
  if (kind === 'session') return MessageSquare;
  return FolderGit2;
}

function fileLabel(file: ImportFile, providerId: AssistantProviderId) {
  if (file.kind === 'global') return `Global ${GLOBAL_FILE_NAME[providerId]}`;
  if (file.kind === 'session') return `${file.projectName ?? 'Project'} · latest session`;
  return file.projectName ?? 'Project';
}

function AgentGroup({
  providerId,
  files,
  selected,
  onToggle,
  running,
  perSource,
  compact,
  resolved = false
}: {
  providerId: AssistantProviderId;
  files: ImportFile[];
  selected: Set<string>;
  onToggle: (path: string) => void;
  running: boolean;
  perSource: Record<string, 'adding' | 'added'>;
  compact: boolean;
  /** The already-in-brain group: greyed, ticked, non-interactive. */
  resolved?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-control)] border border-border bg-surface-2/50 p-3',
        resolved && 'opacity-60'
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        <ProviderLogo providerId={providerId} size="sm" />
        <span className={cn('font-medium text-text-primary', compact ? 'text-xs' : 'text-sm')}>
          {AGENT_NAME[providerId]}
        </span>
      </div>

      <div className="space-y-1.5">
        {files.map((file) => {
          const Icon = kindIcon(file.kind);
          const liveState = perSource[file.path];
          const rowClass = cn(
            'flex items-center gap-2.5 rounded-[var(--radius-control)] px-2 py-1.5',
            compact ? 'text-xs' : 'text-sm',
            !resolved && !running && 'cursor-pointer transition-colors hover:bg-surface-1'
          );
          const body = (
            <>
              {resolved ? (
                <Check size={14} className="shrink-0 text-success" />
              ) : running ? (
                liveState === 'added' ? (
                  <Check size={14} className="shrink-0 text-success" />
                ) : liveState === 'adding' ? (
                  <Loader2 size={14} className="shrink-0 animate-spin text-accent" />
                ) : (
                  <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-border" />
                )
              ) : (
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 shrink-0 accent-[var(--color-accent)]"
                  checked={selected.has(file.path)}
                  onChange={() => onToggle(file.path)}
                />
              )}
              <Icon size={14} className="shrink-0 text-text-tertiary" />
              <span className="min-w-0 flex-1 truncate text-text-primary">
                {fileLabel(file, providerId)}
              </span>
              {resolved ? (
                <span className="shrink-0 text-[10px] text-text-tertiary">in your brain</span>
              ) : running ? (
                <span className="shrink-0 text-[10px] text-text-tertiary">
                  {liveState === 'added' ? 'added' : liveState === 'adding' ? 'adding…' : 'queued'}
                </span>
              ) : (
                statusChip(file)
              )}
            </>
          );

          if (resolved || running) {
            return (
              <div key={file.path} className={rowClass}>
                {body}
              </div>
            );
          }
          return (
            <label key={file.path} className={rowClass}>
              {body}
            </label>
          );
        })}
      </div>
    </div>
  );
}
