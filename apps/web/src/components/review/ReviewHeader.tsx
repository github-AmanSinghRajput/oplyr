import { Check, X, Menu, Columns2, Rows3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { PendingApproval } from '@/containers/voice-console/lib/types';

interface ReviewHeaderProps {
  assistantLabel: string;
  pendingApproval: PendingApproval | null;
  totalFiles: number;
  totalAdditions: number;
  totalDeletions: number;
  viewedCount: number;
  diffMode: 'split' | 'unified';
  onToggleDiffMode: () => void;
  onApprove: () => void;
  onReject: () => void;
  onToggleFileTree?: () => void;
}

export function ReviewHeader({
  assistantLabel,
  pendingApproval,
  totalFiles,
  totalAdditions,
  totalDeletions,
  viewedCount,
  diffMode,
  onToggleDiffMode,
  onApprove,
  onReject,
  onToggleFileTree
}: ReviewHeaderProps) {
  const waitingSince = pendingApproval?.createdAt
    ? formatRelativeTime(pendingApproval.createdAt)
    : null;

  return (
    <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b border-border pb-4 mb-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {onToggleFileTree && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 md:hidden"
              onClick={onToggleFileTree}
            >
              <Menu size={16} />
            </Button>
          )}
          <div className="min-w-0">
            <p className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-1">
              AI Review
            </p>
            <h2 className="text-lg font-semibold text-text-primary truncate">
              {pendingApproval?.title ?? 'Review proposed changes'}
            </h2>
          </div>
        </div>

        {pendingApproval && (
          <div className="flex items-center gap-2 shrink-0">
            <Button onClick={onApprove} className="bg-success hover:bg-success/90 text-background">
              <Check size={14} className="mr-1.5" /> Approve
            </Button>
            <Button variant="destructive" onClick={onReject}>
              <X size={14} className="mr-1.5" /> Reject
            </Button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 mt-3 flex-wrap">
        {totalFiles > 0 && <Badge variant="outline">{totalFiles} files</Badge>}
        {totalAdditions > 0 && (
          <Badge variant="outline" className="text-success border-success/30">
            +{totalAdditions}
          </Badge>
        )}
        {totalDeletions > 0 && (
          <Badge variant="outline" className="text-danger border-danger/30">
            -{totalDeletions}
          </Badge>
        )}
        {totalFiles > 0 && (
          <Badge variant="secondary">
            {viewedCount} / {totalFiles} reviewed
          </Badge>
        )}
        {waitingSince && (
          <Badge variant="secondary" className="text-warning">
            Waiting {waitingSince}
          </Badge>
        )}

        <Button
          variant="outline"
          size="sm"
          className="ml-auto h-7 text-xs"
          onClick={onToggleDiffMode}
        >
          {diffMode === 'split' ? (
            <Rows3 size={12} className="mr-1.5" />
          ) : (
            <Columns2 size={12} className="mr-1.5" />
          )}
          {diffMode === 'split' ? 'Unified' : 'Split'}
        </Button>
      </div>

      {pendingApproval?.summary ? (
        <p className="text-sm text-text-secondary mt-3">{pendingApproval.summary}</p>
      ) : !pendingApproval ? (
        <p className="text-sm text-text-secondary mt-3">
          {assistantLabel} will wait for your decision before applying any file changes.
        </p>
      ) : null}
    </header>
  );
}

function formatRelativeTime(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;

  if (diffMs < 60_000) return 'just now';
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)} min ago`;
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`;
  return `${Math.floor(diffMs / 86_400_000)}d ago`;
}
