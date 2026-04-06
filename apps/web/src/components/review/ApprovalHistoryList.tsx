import { formatTimestamp } from '@/containers/voice-console/lib/helpers';
import { Badge } from '@/components/ui/badge';
import type { ApprovalHistoryEntry } from '@/containers/voice-console/lib/types';

interface ApprovalHistoryListProps {
  approvalHistory: ApprovalHistoryEntry[];
}

export function ApprovalHistoryList({ approvalHistory }: ApprovalHistoryListProps) {
  return (
    <div className="rounded-[var(--radius-panel)] border border-border bg-surface-1 overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <span className="text-xs font-medium text-text-tertiary uppercase tracking-wider">Approval history</span>
        <p className="text-sm font-medium text-text-primary mt-0.5">Recent write decisions</p>
      </div>

      {approvalHistory.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <p className="text-sm text-text-secondary">No recorded approval history yet.</p>
          <p className="text-xs text-text-tertiary mt-1">Approved and rejected write requests will accumulate here.</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {approvalHistory.map((entry) => (
            <div key={entry.id} className="px-4 py-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-text-primary truncate">{entry.taskTitle}</p>
                <p className="text-xs text-text-secondary mt-0.5 line-clamp-2">{entry.taskSummary}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant={entry.approved ? 'outline' : 'destructive'} className="text-xs">
                  {entry.approved ? 'approved' : 'rejected'}
                </Badge>
                <span className="text-[10px] text-text-tertiary">{formatTimestamp(entry.reviewedAt)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
