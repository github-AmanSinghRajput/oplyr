import { forwardRef, useMemo } from 'react';
import { ChevronRight, CheckSquare, Square } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Badge } from '@/components/ui/badge';
import { DiffViewer } from './DiffViewer';
import { buildFileExplanation } from '@/containers/voice-console/lib/file-explanation';
import type { DiffFileBlock, PendingApproval } from '@/containers/voice-console/lib/types';

interface ReviewFileCardProps {
  file: DiffFileBlock;
  fileIndex: number;
  pendingApproval: PendingApproval | null;
  diffMode: 'split' | 'unified';
  isCollapsed: boolean;
  isViewed: boolean;
  onToggleCollapse: (filePath: string) => void;
  onToggleViewed: (filePath: string) => void;
  stats: { additions: number; deletions: number };
}

function toAnchorId(filePath: string) {
  return `review-file-${filePath
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()}`;
}

export const ReviewFileCard = forwardRef<HTMLElement, ReviewFileCardProps>(function ReviewFileCard(
  {
    file,
    fileIndex,
    pendingApproval,
    diffMode,
    isCollapsed,
    isViewed,
    onToggleCollapse,
    onToggleViewed,
    stats
  },
  ref
) {
  const tasks = pendingApproval?.tasks ?? [];
  const explanation = useMemo(
    () => buildFileExplanation(file.filePath, tasks, file.diff),
    [file.filePath, tasks, file.diff]
  );

  return (
    <article
      className={cn(
        'rounded-[var(--radius-panel)] border border-border bg-surface-1 overflow-hidden',
        isCollapsed && 'bg-surface-1/50'
      )}
      id={toAnchorId(file.filePath)}
      ref={ref}
    >
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <button
          className="shrink-0 text-text-tertiary hover:text-text-primary transition-colors"
          onClick={() => onToggleCollapse(file.filePath)}
          type="button"
          aria-label={isCollapsed ? 'Expand file' : 'Collapse file'}
        >
          <ChevronRight
            size={14}
            className={cn('transition-transform', !isCollapsed && 'rotate-90')}
          />
        </button>

        <div className="flex-1 min-w-0">
          <span className="text-[10px] text-text-tertiary uppercase tracking-wider">
            File {fileIndex + 1}
          </span>
          <p className="text-sm font-medium text-text-primary truncate font-mono">
            {file.filePath}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {stats.additions > 0 && (
            <Badge variant="outline" className="text-success border-success/30 text-xs">
              +{stats.additions}
            </Badge>
          )}
          {stats.deletions > 0 && (
            <Badge variant="outline" className="text-danger border-danger/30 text-xs">
              -{stats.deletions}
            </Badge>
          )}

          <button
            className={cn(
              'flex items-center gap-1 text-xs transition-colors',
              isViewed ? 'text-success' : 'text-text-tertiary hover:text-text-primary'
            )}
            onClick={() => onToggleViewed(file.filePath)}
            type="button"
          >
            {isViewed ? <CheckSquare size={14} /> : <Square size={14} />}
            Viewed
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <>
          {explanation && (
            <div className="px-4 py-2 bg-accent-muted/10 border-b border-border/50">
              <span className="text-[10px] text-text-tertiary uppercase tracking-wider">
                AI note
              </span>
              <p className="text-xs text-text-secondary mt-0.5">{explanation}</p>
            </div>
          )}
          <DiffViewer filePath={file.filePath} diff={file.diff} mode={diffMode} />
        </>
      )}
    </article>
  );
});
