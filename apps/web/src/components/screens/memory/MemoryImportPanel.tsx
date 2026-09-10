import { useCallback, useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  FolderGit2,
  Loader2,
  MessageSquare,
  RefreshCw,
  Search,
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

/** Below this many sources the filter is clutter, above it it is essential. */
const SEARCH_THRESHOLD = 8;

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

/** Every source an agent offers, in one list. */
function allSources(agent: ImportAgentGroup): ImportFile[] {
  return [agent.global, ...agent.projects, ...agent.sessions].filter((file): file is ImportFile =>
    Boolean(file)
  );
}

interface ProjectBucket {
  key: string;
  name: string;
  files: ImportFile[];
  pending: ImportFile[];
  addedCount: number;
}

/**
 * Bucket an agent's sources by project.
 *
 * Sessions are one file per conversation, so a project you use daily offers a fresh row every time
 * you talk to your agent — and because a row is identified by its file path, the ones you imported
 * yesterday scroll away while new ones appear as `new`. Flat, that reads as "I keep importing this
 * and it keeps coming back", with several rows sharing a project name and differing only by date.
 * Bucketed, the same facts read as "ArnieMonoRepo: 2 new, 3 already in your brain", which is the
 * question the user is actually asking.
 */
function bucketByProject(files: ImportFile[]): {
  globals: ImportFile[];
  projects: ProjectBucket[];
} {
  const globals: ImportFile[] = [];
  const byKey = new Map<string, ProjectBucket>();

  for (const file of files) {
    if (!file.projectRoot) {
      globals.push(file);
      continue;
    }
    const bucket = byKey.get(file.projectRoot);
    if (bucket) bucket.files.push(file);
    else
      byKey.set(file.projectRoot, {
        key: file.projectRoot,
        name: file.projectName ?? file.projectRoot,
        files: [file],
        pending: [],
        addedCount: 0
      });
  }

  const projects = [...byKey.values()].map((bucket) => {
    // Newest first inside a project: the session you were just in is the one you want.
    bucket.files.sort((a, b) => (b.modifiedAt ?? '').localeCompare(a.modifiedAt ?? ''));
    bucket.pending = bucket.files.filter(isPendingSource);
    bucket.addedCount = bucket.files.filter((file) => file.status === 'added').length;
    return bucket;
  });

  // Projects with something to bring in first, then by name so the list is stable between scans.
  projects.sort((a, b) => b.pending.length - a.pending.length || a.name.localeCompare(b.name));
  return { globals, projects };
}

/** Does this source match a free-text query? Matches the project, the label, and the path. */
function matchesQuery(file: ImportFile, query: string): boolean {
  if (!query) return true;
  const haystack = `${file.projectName ?? ''} ${file.projectRoot ?? ''} ${file.path}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
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
    toggleMany,
    selectAll,
    clearSelection,
    rescan,
    run,
    startImport,
    dismissDone,
    dismissed,
    dismiss,
    undismiss
  } = useMemoryImport();
  const [query, setQuery] = useState('');
  // Which project groups are open. Groups start collapsed so a machine with dozens of projects is
  // scannable; a search expands what it matches, because a hidden match is the same as no match.
  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set());

  const toggleExpanded = useCallback((key: string) => {
    setOpenKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const running = run.status === 'running';
  const sourceCount = pendingCount + addedCount;

  const visibleAgents = useMemo(() => {
    const agentList = manifest?.agents ?? [];
    return agentList
      .map((agent) => {
        const matching = allSources(agent).filter((file) => matchesQuery(file, query));
        const { globals, projects } = bucketByProject(matching);
        return { agent, globals, projects };
      })
      .filter((entry) => entry.globals.length > 0 || entry.projects.length > 0);
  }, [manifest, query]);

  // A search should reveal its matches rather than leave them behind a collapsed header, and a
  // group that is mid-import should show its rows moving rather than a closed row that looks idle.
  const expandedKeys = useMemo(() => {
    if (query.trim()) {
      return new Set(visibleAgents.flatMap((entry) => entry.projects.map((p) => p.key)));
    }
    if (running) {
      const active = visibleAgents.flatMap((entry) =>
        entry.projects
          .filter((project) => project.pending.some((file) => selected.has(file.path)))
          .map((project) => project.key)
      );
      return new Set([...openKeys, ...active]);
    }
    return openKeys;
  }, [openKeys, query, running, selected, visibleAgents]);

  const done = run.status === 'done';

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

  const caughtUp = pendingCount === 0 && !running && !done;

  // Collapsed state for dismissible surfaces (Workspace): either the user dismissed the card, or
  // there's nothing new to offer. Render a slim, always-recoverable row — expand + re-scan — instead
  // of vanishing. Dismissing must never lose the feature, and the user needs a way to check for newly
  // written agent memory without restarting the app.
  if (dismissible && !running && !done && (dismissed || (hideWhenCaughtUp && caughtUp))) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 rounded-[var(--radius-panel)] border border-border bg-surface-1 px-4 py-2.5 text-xs',
          className
        )}
      >
        <Sparkles size={13} className="shrink-0 text-accent" />
        <button
          type="button"
          onClick={undismiss}
          className="min-w-0 flex-1 truncate text-left text-text-secondary transition-colors hover:text-text-primary"
        >
          {pendingCount > 0
            ? `${pendingCount} new memory ${pendingCount === 1 ? 'source' : 'sources'} to import`
            : 'Agent memory is up to date'}
        </button>
        <button
          type="button"
          onClick={() => void rescan()}
          disabled={scanState === 'scanning'}
          aria-label="Check for new agent memory"
          title="Check for new agent memory"
          className="shrink-0 text-text-tertiary transition-colors hover:text-text-primary disabled:opacity-50"
        >
          <RefreshCw size={13} className={cn(scanState === 'scanning' && 'animate-spin')} />
        </button>
      </div>
    );
  }

  // Non-dismissible surfaces (onboarding) still vanish when there's nothing new to bring in.
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
        {!running && (
          <button
            type="button"
            onClick={() => void rescan()}
            disabled={scanState === 'scanning'}
            className="shrink-0 text-text-tertiary transition-colors hover:text-text-primary disabled:opacity-50"
            aria-label="Check for new agent memory"
            title="Check for new agent memory"
          >
            <RefreshCw size={14} className={cn(scanState === 'scanning' && 'animate-spin')} />
          </button>
        )}
        {dismissible && !running && (
          <button
            type="button"
            className="shrink-0 text-text-tertiary transition-colors hover:text-text-primary"
            onClick={dismiss}
            aria-label="Collapse"
            title="Collapse"
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
          {/* One grouped, searchable list. There used to be a "pending" list plus a collapsed
              "already in your brain" list far below it, which meant the answer to "did I import
              this already?" lived in a different place from the thing being asked about. */}
          {sourceCount > 0 && (
            <>
              {sourceCount > SEARCH_THRESHOLD && (
                <div
                  className={cn(
                    'flex items-center gap-2 rounded-[var(--radius-control)] border border-border bg-surface-1 px-2.5',
                    compact ? 'mt-3 h-8' : 'mt-4 h-9'
                  )}
                >
                  <Search size={13} className="shrink-0 text-text-tertiary" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Filter by project or path"
                    aria-label="Filter importable memory"
                    className="min-w-0 flex-1 border-0 bg-transparent text-xs text-text-primary outline-none placeholder:text-text-tertiary"
                  />
                  {query && (
                    <button
                      type="button"
                      onClick={() => setQuery('')}
                      aria-label="Clear filter"
                      className="shrink-0 text-text-tertiary transition-colors hover:text-text-primary"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              )}

              <div
                className={cn(
                  'max-h-[min(46vh,420px)] space-y-2 overflow-y-auto pr-1',
                  compact ? 'mt-2' : 'mt-3'
                )}
              >
                {visibleAgents.length === 0 ? (
                  <p className="px-1 py-3 text-xs text-text-tertiary">Nothing matches “{query}”.</p>
                ) : (
                  visibleAgents.map(({ agent, globals, projects }) => (
                    <AgentGroup
                      key={agent.providerId}
                      providerId={agent.providerId}
                      globals={globals}
                      projects={projects}
                      selected={selected}
                      onToggle={toggle}
                      onToggleGroup={toggleMany}
                      expandedKeys={expandedKeys}
                      onToggleExpanded={toggleExpanded}
                      running={running}
                      perSource={run.perSource}
                      compact={compact}
                    />
                  ))
                )}
              </div>
            </>
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
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <Button
                    size={compact ? 'sm' : 'default'}
                    disabled={selectedCount === 0}
                    onClick={() => void startImport()}
                  >
                    {selectedCount > 0 ? `Add ${selectedCount} to your brain` : 'Add to your brain'}
                  </Button>
                  {/* Nothing is selected by default, so wanting everything must still be one click. */}
                  <button
                    type="button"
                    className="text-xs text-text-tertiary underline-offset-2 transition-colors hover:text-text-secondary hover:underline"
                    onClick={selectedCount > 0 ? clearSelection : selectAll}
                  >
                    {selectedCount > 0 ? 'Clear selection' : `Select all ${pendingCount}`}
                  </button>
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

/** The icon for a source kind. A component, not a factory, so it is not "created during render". */
function KindIcon({ kind }: { kind: ImportFile['kind'] }) {
  const className = 'shrink-0 text-text-tertiary';
  if (kind === 'global') return <FileText size={14} className={className} />;
  if (kind === 'session') return <MessageSquare size={14} className={className} />;
  return <FolderGit2 size={14} className={className} />;
}

/** "Sep 8" — enough to tell one session from another without spelling out a full timestamp. */
function shortDate(iso: string | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function fileLabel(file: ImportFile, providerId: AssistantProviderId) {
  if (file.kind === 'global') return `Global ${GLOBAL_FILE_NAME[providerId]}`;
  if (file.kind === 'session') {
    // Several sessions per project are offered now, so "latest session" on every row would make
    // them indistinguishable. Rank names the newest one, the date separates the rest.
    const when = shortDate(file.modifiedAt);
    const which = file.sessionRank === 0 ? 'latest session' : 'session';
    return `${file.projectName ?? 'Project'} · ${which}${when ? ` · ${when}` : ''}`;
  }
  return file.projectName ?? 'Project';
}

interface RowContext {
  providerId: AssistantProviderId;
  selected: Set<string>;
  onToggle: (path: string) => void;
  running: boolean;
  perSource: Record<string, 'adding' | 'added'>;
  compact: boolean;
}

/** One source. Already-imported rows are shown with a tick and cannot be selected. */
function SourceRow({ file, ctx }: { file: ImportFile; ctx: RowContext }) {
  const { providerId, selected, onToggle, running, perSource, compact } = ctx;
  const liveState = perSource[file.path];
  const resolved = file.status === 'added';
  // A run only covers what was selected when it started. Everything else is a bystander: it used to
  // be given the run treatment too and fall through to "queued", telling the user that sources they
  // had deliberately left unticked were about to be imported.
  const inRun = running && selected.has(file.path);
  const bystander = running && !inRun;
  const interactive = !resolved && !running;

  const rowClass = cn(
    'flex items-center gap-2.5 rounded-[var(--radius-control)] px-2 py-1.5',
    compact ? 'text-xs' : 'text-sm',
    interactive && 'cursor-pointer transition-colors hover:bg-surface-1',
    bystander && 'opacity-45',
    resolved && 'opacity-60'
  );

  const body = (
    <>
      {resolved ? (
        <Check size={14} className="shrink-0 text-success" />
      ) : inRun ? (
        liveState === 'added' ? (
          <Check size={14} className="shrink-0 text-success" />
        ) : liveState === 'adding' ? (
          <Loader2 size={14} className="shrink-0 animate-spin text-accent" />
        ) : (
          <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-accent-border" />
        )
      ) : bystander ? (
        <span className="h-3.5 w-3.5 shrink-0 rounded-[3px] border border-border" />
      ) : (
        <input
          type="checkbox"
          className="h-3.5 w-3.5 shrink-0 accent-[var(--color-accent)]"
          checked={selected.has(file.path)}
          onChange={() => onToggle(file.path)}
        />
      )}
      <KindIcon kind={file.kind} />
      <span className="min-w-0 flex-1 truncate text-text-primary" title={file.path}>
        {fileLabel(file, providerId)}
      </span>
      {resolved ? (
        <span className="shrink-0 text-[10px] text-text-tertiary">in your brain</span>
      ) : inRun ? (
        <span className="shrink-0 text-[10px] text-text-tertiary">
          {liveState === 'added' ? 'added' : liveState === 'adding' ? 'adding…' : 'queued'}
        </span>
      ) : bystander ? (
        <span className="shrink-0 text-[10px] text-text-tertiary">not selected</span>
      ) : (
        statusChip(file)
      )}
    </>
  );

  if (!interactive) {
    return <div className={rowClass}>{body}</div>;
  }
  return <label className={rowClass}>{body}</label>;
}

/**
 * One project, collapsible, with a header that answers "have I already imported this?" without
 * expanding it.
 */
function ProjectGroup({
  bucket,
  ctx,
  expanded,
  onToggleExpanded,
  onToggleGroup
}: {
  bucket: ProjectBucket;
  ctx: RowContext;
  expanded: boolean;
  onToggleExpanded: () => void;
  onToggleGroup: (paths: string[], select: boolean) => void;
}) {
  const pendingPaths = bucket.pending.map((file) => file.path);
  const selectedHere = pendingPaths.filter((path) => ctx.selected.has(path)).length;
  const allSelected = pendingPaths.length > 0 && selectedHere === pendingPaths.length;
  const someSelected = selectedHere > 0 && !allSelected;

  // How many of this group's selected sources have finished, for the in-progress readout.
  const runningHere = pendingPaths.filter((path) => ctx.selected.has(path));
  const doneHere = runningHere.filter((path) => ctx.perSource[path] === 'added').length;

  /**
   * What the header says about this project.
   *
   * "3 to add" alongside "14 in your brain" was read as "my import failed" — reasonably, because
   * nothing distinguished a source that had never been imported from a conversation that simply
   * happened afterwards. Sessions are one file per conversation, so the folder you actually work in
   * grows a new one every time you talk to your agent, and its three newest are different on every
   * scan. Saying "new since you last imported" is the same fact without the false alarm.
   */
  const summary = ctx.running
    ? `${doneHere} of ${runningHere.length} added`
    : [
        bucket.pending.length > 0
          ? bucket.addedCount > 0
            ? `${bucket.pending.length} new since you last imported`
            : `${bucket.pending.length} to add`
          : null,
        bucket.addedCount > 0 ? `${bucket.addedCount} already in` : null
      ]
        .filter(Boolean)
        .join(' · ');

  return (
    <div className="rounded-[var(--radius-control)] border border-border/70 bg-surface-1/40">
      <div className="flex items-center gap-2 px-2 py-1.5">
        {ctx.running ? (
          // Keep a marker in the checkbox's place: hiding it left the parent row with no sign that
          // its children were selected, queued, or finished, so a running import looked idle.
          runningHere.length === 0 ? (
            <span className="h-3.5 w-3.5 shrink-0 rounded-[3px] border border-border" />
          ) : doneHere === runningHere.length ? (
            <Check size={14} className="shrink-0 text-success" />
          ) : (
            <Loader2 size={14} className="shrink-0 animate-spin text-accent" />
          )
        ) : pendingPaths.length > 0 ? (
          <input
            type="checkbox"
            className="h-3.5 w-3.5 shrink-0 accent-[var(--color-accent)]"
            checked={allSelected}
            ref={(node) => {
              // Indeterminate is not an attribute, so it has to be set on the node.
              if (node) node.indeterminate = someSelected;
            }}
            onChange={() => onToggleGroup(pendingPaths, !allSelected)}
            aria-label={`Select all sources in ${bucket.name}`}
          />
        ) : (
          <span className="h-3.5 w-3.5 shrink-0" />
        )}
        <button
          type="button"
          onClick={onToggleExpanded}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
          aria-expanded={expanded}
        >
          {expanded ? (
            <ChevronDown size={13} className="shrink-0 text-text-tertiary" />
          ) : (
            <ChevronRight size={13} className="shrink-0 text-text-tertiary" />
          )}
          <span
            className={cn(
              'min-w-0 truncate font-medium text-text-primary',
              ctx.compact ? 'text-xs' : 'text-sm'
            )}
            title={bucket.key}
          >
            {bucket.name}
          </span>
          <span className="shrink-0 text-[10px] text-text-tertiary">{summary}</span>
        </button>
      </div>

      {expanded && (
        <div className="space-y-1 border-t border-border/60 px-1.5 py-1.5">
          {bucket.files.map((file) => (
            <SourceRow key={file.path} file={file} ctx={ctx} />
          ))}
        </div>
      )}
    </div>
  );
}

function AgentGroup({
  providerId,
  globals,
  projects,
  selected,
  onToggle,
  onToggleGroup,
  expandedKeys,
  onToggleExpanded,
  running,
  perSource,
  compact
}: {
  providerId: AssistantProviderId;
  globals: ImportFile[];
  projects: ProjectBucket[];
  selected: Set<string>;
  onToggle: (path: string) => void;
  onToggleGroup: (paths: string[], select: boolean) => void;
  expandedKeys: Set<string>;
  onToggleExpanded: (key: string) => void;
  running: boolean;
  perSource: Record<string, 'adding' | 'added'>;
  compact: boolean;
}) {
  const ctx: RowContext = { providerId, selected, onToggle, running, perSource, compact };

  return (
    <div className="rounded-[var(--radius-control)] border border-border bg-surface-2/50 p-3">
      <div className="mb-2 flex items-center gap-2">
        <ProviderLogo providerId={providerId} size="sm" />
        <span className={cn('font-medium text-text-primary', compact ? 'text-xs' : 'text-sm')}>
          {AGENT_NAME[providerId]}
        </span>
      </div>

      <div className="space-y-1.5">
        {/* Global memory has no project, so it stays a plain row above the buckets. */}
        {globals.map((file) => (
          <SourceRow key={file.path} file={file} ctx={ctx} />
        ))}
        {projects.map((bucket) => (
          <ProjectGroup
            key={bucket.key}
            bucket={bucket}
            ctx={ctx}
            expanded={expandedKeys.has(bucket.key)}
            onToggleExpanded={() => onToggleExpanded(bucket.key)}
            onToggleGroup={onToggleGroup}
          />
        ))}
      </div>
    </div>
  );
}
