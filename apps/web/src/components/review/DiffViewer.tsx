import { useMemo } from 'react';
import { parseFileDiff } from '@/containers/voice-console/lib/diff';
import { cn } from '@/lib/cn';
import type { DiffHunk, DiffRow } from '@/containers/voice-console/lib/types';

interface DiffViewerProps {
  filePath: string;
  diff: string;
  mode: 'split' | 'unified';
}

export function DiffViewer({ filePath, diff, mode }: DiffViewerProps) {
  const parsed = useMemo(() => parseFileDiff(diff), [diff]);

  if (parsed.hunks.length === 0) {
    return (
      <div className="p-4 text-sm text-text-tertiary">
        No diff content available for this file.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[var(--radius-control)] border border-border bg-surface-1">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-surface-2/50 text-xs text-text-tertiary font-mono">
        {mode === 'split' ? (
          <>
            <span>Before</span>
            <span>After</span>
          </>
        ) : (
          <span>Unified diff</span>
        )}
      </div>
      <div className={cn('text-xs font-mono', mode === 'split' ? 'grid grid-cols-2' : '')}>
        {parsed.hunks.map((hunk, hunkIndex) => (
          <DiffHunkSection
            key={`${filePath}-hunk-${hunkIndex}`}
            filePath={filePath}
            hunk={hunk}
            hunkIndex={hunkIndex}
            previousHunk={hunkIndex > 0 ? parsed.hunks[hunkIndex - 1] : null}
            mode={mode}
          />
        ))}
      </div>
    </div>
  );
}

interface DiffHunkSectionProps {
  filePath: string;
  hunk: DiffHunk;
  hunkIndex: number;
  previousHunk: DiffHunk | null;
  mode: 'split' | 'unified';
}

function DiffHunkSection({ filePath, hunk, hunkIndex, previousHunk, mode }: DiffHunkSectionProps) {
  const gapSize = computeGap(previousHunk, hunk);

  return (
    <div className={mode === 'split' ? 'col-span-2' : ''}>
      {gapSize > 0 && (
        <div className="flex items-center gap-2 px-3 py-1 bg-surface-2/30 text-text-tertiary text-xs" role="note">
          <span>...</span>
          <span>{gapSize} unchanged lines omitted</span>
        </div>
      )}
      <div className="px-3 py-1 bg-accent-muted/20 text-accent text-xs border-y border-border/30">
        <code>{hunk.header}</code>
      </div>
      {mode === 'split'
        ? hunk.rows.map((row, rowIndex) => (
            <SplitDiffRow key={`${filePath}-${hunkIndex}-${rowIndex}`} row={row} />
          ))
        : hunk.rows.map((row, rowIndex) => (
            <UnifiedDiffRow key={`${filePath}-${hunkIndex}-${rowIndex}`} row={row} />
          ))}
    </div>
  );
}

const kindClasses = {
  context: 'bg-transparent',
  remove: 'bg-danger-muted/40',
  add: 'bg-success-muted/40',
  empty: 'bg-transparent',
} as const;

function SplitDiffRow({ row }: { row: DiffRow }) {
  return (
    <div className="grid grid-cols-2 border-b border-border/20">
      <div className={cn('flex items-start', kindClasses[row.leftKind])}>
        <span className="w-10 shrink-0 text-right pr-2 text-text-tertiary select-none">{row.leftLineNumber ?? ''}</span>
        <span className="w-4 shrink-0 text-center text-text-tertiary select-none">
          {row.leftKind === 'remove' ? '-' : row.leftKind === 'context' ? ' ' : ''}
        </span>
        <code className="flex-1 whitespace-pre-wrap break-all pr-2">{row.leftText || ' '}</code>
      </div>
      <div className={cn('flex items-start border-l border-border/20', kindClasses[row.rightKind])}>
        <span className="w-10 shrink-0 text-right pr-2 text-text-tertiary select-none">{row.rightLineNumber ?? ''}</span>
        <span className="w-4 shrink-0 text-center text-text-tertiary select-none">
          {row.rightKind === 'add' ? '+' : row.rightKind === 'context' ? ' ' : ''}
        </span>
        <code className="flex-1 whitespace-pre-wrap break-all pr-2">{row.rightText || ' '}</code>
      </div>
    </div>
  );
}

function UnifiedDiffRow({ row }: { row: DiffRow }) {
  if (row.leftKind === 'context') {
    return (
      <div className="flex items-start border-b border-border/20">
        <span className="w-10 shrink-0 text-right pr-2 text-text-tertiary select-none">{row.leftLineNumber ?? ''}</span>
        <span className="w-10 shrink-0 text-right pr-2 text-text-tertiary select-none">{row.rightLineNumber ?? ''}</span>
        <span className="w-4 shrink-0 text-center text-text-tertiary select-none"> </span>
        <code className="flex-1 whitespace-pre-wrap break-all pr-2">{row.leftText || ' '}</code>
      </div>
    );
  }

  return (
    <>
      {row.leftKind === 'remove' && (
        <div className={cn('flex items-start border-b border-border/20', kindClasses.remove)}>
          <span className="w-10 shrink-0 text-right pr-2 text-text-tertiary select-none">{row.leftLineNumber ?? ''}</span>
          <span className="w-10 shrink-0 text-right pr-2 text-text-tertiary select-none" />
          <span className="w-4 shrink-0 text-center text-danger select-none">-</span>
          <code className="flex-1 whitespace-pre-wrap break-all pr-2">{row.leftText || ' '}</code>
        </div>
      )}
      {row.rightKind === 'add' && (
        <div className={cn('flex items-start border-b border-border/20', kindClasses.add)}>
          <span className="w-10 shrink-0 text-right pr-2 text-text-tertiary select-none" />
          <span className="w-10 shrink-0 text-right pr-2 text-text-tertiary select-none">{row.rightLineNumber ?? ''}</span>
          <span className="w-4 shrink-0 text-center text-success select-none">+</span>
          <code className="flex-1 whitespace-pre-wrap break-all pr-2">{row.rightText || ' '}</code>
        </div>
      )}
    </>
  );
}

function computeGap(previousHunk: DiffHunk | null, currentHunk: DiffHunk): number {
  if (!previousHunk) return 0;
  const previousEnd = previousHunk.oldStart + previousHunk.oldCount;
  const currentStart = currentHunk.oldStart;
  return Math.max(0, currentStart - previousEnd);
}
