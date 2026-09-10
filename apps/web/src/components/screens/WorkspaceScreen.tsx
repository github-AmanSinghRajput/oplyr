import { useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Eraser,
  FolderOpen,
  Lock,
  RotateCcw,
  ShieldCheck
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { MemoryImportPanel } from '@/components/screens/memory/MemoryImportPanel';
import { cn } from '@/lib/cn';
import type { WorkspaceState } from '@/containers/voice-console/lib/types';

interface WorkspaceScreenProps {
  activeProviderName: string;
  projectInput: string;
  workspace: WorkspaceState | null;
  canBrowseProjectFolder: boolean;
  isResetting: boolean;
  isClearingChat: boolean;
  onProjectInputChange: (value: string) => void;
  onBrowseProjectFolder: () => void;
  onSaveProject: () => void;
  onToggleWriteAccess: (enabled: boolean) => void;
  onClearChat: () => void;
  onResetApp: () => void;
}

/** Trailing slashes off first, or the parent and the name both end up containing the folder. */
function normalizePath(fullPath: string): string {
  const trimmed = fullPath.replace(/\/+$/, '');
  return trimmed || '/';
}

/** Everything up to and including the last slash, with $HOME shortened to `~`. */
function parentOf(fullPath: string): string {
  const shortened = normalizePath(fullPath).replace(/^\/Users\/[^/]+/, '~');
  const cut = shortened.lastIndexOf('/');
  return cut < 0 ? '' : shortened.slice(0, cut + 1);
}

/** The folder's own name, which is the part worth reading at full contrast. */
function basenameOf(fullPath: string): string {
  const trimmed = normalizePath(fullPath);
  return trimmed.slice(trimmed.lastIndexOf('/') + 1);
}

/** A path is only usable if it is absolute. Catching that here beats learning it from a toast. */
function pathProblem(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!trimmed.startsWith('/') && !trimmed.startsWith('~')) {
    return 'Needs an absolute path, starting with / or ~';
  }
  return null;
}

/**
 * The Workspace screen, laid out for a desktop window.
 *
 * Two earlier versions of this were towers: six full-width blocks stacked down the middle of a wide
 * screen, saying the same things three times over (the path appeared in the input, a badge and a
 * card; write access in a badge, a button label and another card — "folder" twenty times in all).
 * It is now a status bar and three columns that fill the width and fit one screen, with the rarest
 * actions behind a single disclosure so they stop competing with the two real decisions.
 */
export function WorkspaceScreen({
  activeProviderName,
  projectInput,
  workspace,
  canBrowseProjectFolder,
  isResetting,
  isClearingChat,
  onProjectInputChange,
  onBrowseProjectFolder,
  onSaveProject,
  onToggleWriteAccess,
  onClearChat,
  onResetApp
}: WorkspaceScreenProps) {
  const [showCleanup, setShowCleanup] = useState(false);

  const connected = workspace?.projectRoot ?? null;
  const writeEnabled = workspace?.writeAccessEnabled ?? false;
  const problem = pathProblem(projectInput);
  const isDirty = projectInput.trim() !== '' && projectInput.trim() !== connected;
  const secrets = workspace?.secretPolicy ?? [];

  return (
    <div className="flex min-h-[calc(100vh-var(--topbar-height)-3rem)] flex-col gap-3">
      {/* ── One status bar. The connected folder is the fact this screen is about, so it reads at
             a glance without a card of its own. ── */}
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[var(--radius-panel)] border border-border bg-surface-1 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <FolderOpen size={15} className={connected ? 'text-accent' : 'text-text-tertiary'} />
          {connected ? (
            <p className="min-w-0 truncate font-mono text-sm" title={connected}>
              <span className="text-text-tertiary">{parentOf(connected)}</span>
              <span className="text-text-primary">{basenameOf(connected)}</span>
            </p>
          ) : (
            <p className="text-sm text-text-tertiary">No folder connected</p>
          )}
        </div>

        <span className="hidden h-4 w-px bg-border sm:block" aria-hidden="true" />

        <span
          className={cn(
            'flex items-center gap-1.5 text-xs',
            writeEnabled ? 'text-success' : 'text-text-tertiary'
          )}
        >
          {writeEnabled ? <Check size={13} /> : <Lock size={13} />}
          {writeEnabled ? 'Changes need your approval' : 'Chat and advice only'}
        </span>

        <p className="ml-auto max-w-md text-xs text-text-tertiary">
          {/* The folder applies to every connected agent, so it must not be named after the active
              one — switching agents silently rewrote this sentence in an earlier version. */}
          Agents are fenced to this folder. Nothing outside it is read or written.
        </p>
      </header>

      {/* ── Three columns, filling the width ── */}
      <div className="grid flex-1 content-start gap-3 lg:grid-cols-3">
        {/* Column 1 — the folder decision */}
        <section className="flex flex-col rounded-[var(--radius-panel)] border border-border bg-surface-1 p-4">
          <h3 className="text-xs font-medium tracking-wider text-text-tertiary uppercase">
            Project folder
          </h3>
          <p className="mt-1 text-xs text-text-secondary">
            {connected
              ? 'Browse to connect a different one, or type a path.'
              : 'Browse to connect one, or type a path.'}
          </p>

          <div className="mt-3 flex items-center gap-2">
            <Input
              value={projectInput}
              onChange={(event) => onProjectInputChange(event.target.value)}
              placeholder="/absolute/path/to/your/project"
              aria-label="Project folder path"
              aria-invalid={problem ? true : undefined}
              className={cn('min-w-0 flex-1 font-mono text-xs', problem && 'border-danger')}
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  disabled={!canBrowseProjectFolder}
                  onClick={onBrowseProjectFolder}
                  aria-label="Browse for a folder and connect it"
                  className="shrink-0"
                >
                  <FolderOpen size={14} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {canBrowseProjectFolder
                  ? 'Pick a folder — it connects straight away'
                  : 'Folder picker needs the desktop app'}
              </TooltipContent>
            </Tooltip>
          </div>

          <div className="mt-2 flex items-center gap-2">
            <Button onClick={onSaveProject} disabled={Boolean(problem) || !isDirty}>
              {/* The label describes what pressing it DOES right now. "Switch folder" on a fresh
                  install is meaningless — there is nothing to switch from. */}
              {!connected
                ? 'Connect repository'
                : isDirty
                  ? 'Connect this folder instead'
                  : 'Connected'}
            </Button>
            {isDirty ? (
              <span className="flex items-center gap-1.5 text-xs text-warning">
                <span className="h-1.5 w-1.5 rounded-full bg-warning" aria-hidden="true" />
                Not connected yet
              </span>
            ) : connected ? (
              <span className="flex items-center gap-1.5 text-xs text-success">
                <Check size={12} />
                Connected
              </span>
            ) : null}
          </div>

          <p className={cn('mt-auto pt-3 text-xs', problem ? 'text-danger' : 'text-text-tertiary')}>
            {problem ?? 'Any folder works, Git or not. Multi-repo workspaces are detected for you.'}
          </p>
        </section>

        {/* Column 2 — the permissions decision */}
        <section className="flex flex-col rounded-[var(--radius-panel)] border border-border bg-surface-1 p-4">
          <h3 className="flex items-center gap-2 text-xs font-medium tracking-wider text-text-tertiary uppercase">
            <ShieldCheck size={13} className={writeEnabled ? 'text-success' : undefined} />
            File changes
          </h3>

          {/* State first, then the action. The old control was a button whose label was its
              opposite, styled `destructive` when access was ON — destructive styling on the safe,
              desirable state, and unreadable at a glance. */}
          <p className="mt-2 text-sm font-medium text-text-primary">
            {writeEnabled ? 'Allowed, with your approval' : 'Off'}
          </p>
          <p className="mt-1 text-xs text-text-secondary">
            {writeEnabled
              ? 'Every edit arrives as a diff you approve. Nothing is applied automatically.'
              : `${activeProviderName} can read and discuss, but cannot propose edits.`}
          </p>

          <Button
            variant="outline"
            disabled={!connected}
            onClick={() => onToggleWriteAccess(!writeEnabled)}
            className="mt-3 self-start"
          >
            {writeEnabled ? 'Turn off file changes' : 'Allow approved changes'}
          </Button>
          {!connected ? (
            <p className="mt-2 text-xs text-text-tertiary">Connect a folder first.</p>
          ) : null}

          {secrets.length > 0 ? (
            <div className="mt-auto border-t border-border/60 pt-3">
              <p className="mb-1.5 text-[11px] text-text-tertiary">
                {secrets.length} protected {secrets.length === 1 ? 'path' : 'paths'}, always
                off-limits
              </p>
              <ul className="flex flex-wrap gap-1">
                {secrets.map((pattern) => (
                  <li
                    key={pattern}
                    className="rounded-[var(--radius-sm)] bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-text-secondary"
                  >
                    {pattern}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        {/* Column 3 — bringing existing agent memory in. Self-hides when there is nothing to do,
            so the grid collapses to two real columns rather than showing an empty box. */}
        <div className="min-w-0">
          <MemoryImportPanel dismissible hideWhenCaughtUp />
        </div>
      </div>

      {/* ── Cleanup, one line until you want it ── */}
      <section className="rounded-[var(--radius-panel)] border border-border bg-surface-1">
        <button
          type="button"
          onClick={() => setShowCleanup((value) => !value)}
          className="flex w-full items-center gap-2 px-4 py-2.5 text-left"
          aria-expanded={showCleanup}
        >
          {showCleanup ? (
            <ChevronDown size={14} className="text-text-tertiary" />
          ) : (
            <ChevronRight size={14} className="text-text-tertiary" />
          )}
          <span className="text-sm font-medium text-text-primary">Reset and cleanup</span>
          <span className="text-xs text-text-tertiary">
            Clear this chat, or start over entirely
          </span>
        </button>

        <AnimatePresence initial={false}>
          {showCleanup ? (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="grid gap-3 border-t border-border/60 p-4 md:grid-cols-2">
                <div className="flex items-start justify-between gap-3 rounded-[var(--radius-control)] border border-border bg-background p-3">
                  <div className="flex items-start gap-2.5">
                    <Eraser size={15} className="mt-0.5 shrink-0 text-text-tertiary" />
                    <div>
                      <h4 className="text-sm font-medium text-text-primary">Clear this chat</h4>
                      <p className="mt-0.5 text-xs text-text-secondary">
                        Wipes this workspace&rsquo;s conversation, diffs and pending approvals. Your
                        Brain memories stay, and other workspaces are untouched.
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    disabled={isClearingChat}
                    onClick={onClearChat}
                    className="shrink-0"
                  >
                    {isClearingChat ? 'Clearing…' : 'Clear'}
                  </Button>
                </div>

                <div className="flex items-start justify-between gap-3 rounded-[var(--radius-control)] border border-danger/30 bg-danger-muted/25 p-3">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle size={15} className="mt-0.5 shrink-0 text-danger" />
                    <div>
                      <h4 className="text-sm font-medium text-text-primary">Reset Oplyr</h4>
                      <p className="mt-0.5 text-xs text-text-secondary">
                        Everything Oplyr has put on this Mac: memories, chats, workspaces, maps,
                        notes, settings and caches. Like a fresh install. It does not log you out of
                        Codex or Claude Code.
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="destructive"
                    disabled={isResetting}
                    onClick={onResetApp}
                    className="shrink-0"
                  >
                    <RotateCcw size={14} className="mr-1.5" />
                    {isResetting ? 'Resetting…' : 'Reset'}
                  </Button>
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </section>
    </div>
  );
}
