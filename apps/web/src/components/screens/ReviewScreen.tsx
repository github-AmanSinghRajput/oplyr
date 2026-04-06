import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parseFileDiff } from '@/containers/voice-console/lib/diff';
import type { ApprovalHistoryEntry, DiffSummary, PendingApproval } from '@/containers/voice-console/lib/types';
import { ApprovalHistoryList } from '@/components/review/ApprovalHistoryList';
import { FileTreePanel } from '@/components/review/FileTreePanel';
import { ReviewFileCard } from '@/components/review/ReviewFileCard';
import { ReviewHeader } from '@/components/review/ReviewHeader';

interface ReviewScreenProps {
  assistantLabel: string;
  pendingApproval: PendingApproval | null;
  lastDiff: DiffSummary | null;
  approvalHistory: ApprovalHistoryEntry[];
  onApprove: () => void;
  onReject: () => void;
}

function toAnchorId(filePath: string) {
  return `review-file-${filePath.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase()}`;
}

export function ReviewScreen({
  assistantLabel,
  pendingApproval,
  lastDiff,
  approvalHistory,
  onApprove,
  onReject,
}: ReviewScreenProps) {
  const [viewedFiles, setViewedFiles] = useState<Set<string>>(new Set());
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const [diffMode, setDiffMode] = useState<'split' | 'unified'>(() =>
    typeof window !== 'undefined' && window.innerWidth < 768 ? 'unified' : 'split'
  );
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(new Set());
  const [fileTreeOpen, setFileTreeOpen] = useState(false);
  const fileCardRefs = useRef<Map<string, HTMLElement>>(new Map());

  const fileStats = useMemo(() => {
    if (!lastDiff?.files) return [];
    return lastDiff.files.map((file) => {
      const parsed = parseFileDiff(file.diff);
      return {
        filePath: file.filePath,
        additions: parsed.stats.additions,
        deletions: parsed.stats.deletions,
      };
    });
  }, [lastDiff]);

  const totalStats = useMemo(
    () =>
      fileStats.reduce(
        (acc, s) => ({ additions: acc.additions + s.additions, deletions: acc.deletions + s.deletions }),
        { additions: 0, deletions: 0 }
      ),
    [fileStats]
  );

  useEffect(() => {
    setViewedFiles(new Set());
    setCollapsedFiles(new Set());
    setActiveFilePath(null);
  }, [pendingApproval?.id]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const filePath = entry.target.getAttribute('data-filepath');
            if (filePath) setActiveFilePath(filePath);
          }
        }
      },
      { threshold: 0.1 }
    );

    for (const el of fileCardRefs.current.values()) {
      observer.observe(el);
    }

    return () => observer.disconnect();
  }, [lastDiff]);

  const handleFileClick = useCallback((filePath: string) => {
    const element = document.getElementById(toAnchorId(filePath));
    if (element) element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setFileTreeOpen(false);
  }, []);

  const handleToggleCollapse = useCallback((filePath: string) => {
    setCollapsedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) next.delete(filePath);
      else next.add(filePath);
      return next;
    });
  }, []);

  const handleToggleViewed = useCallback((filePath: string) => {
    setViewedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) next.delete(filePath);
      else next.add(filePath);
      return next;
    });
  }, []);

  const handleToggleDiffMode = useCallback(() => {
    setDiffMode((prev) => (prev === 'split' ? 'unified' : 'split'));
  }, []);

  const setFileCardRef = useCallback((filePath: string, el: HTMLElement | null) => {
    if (el) {
      el.setAttribute('data-filepath', filePath);
      fileCardRefs.current.set(filePath, el);
    } else {
      fileCardRefs.current.delete(filePath);
    }
  }, []);

  const viewedCount = fileStats.filter((f) => viewedFiles.has(f.filePath)).length;
  const hasFiles = (lastDiff?.files.length ?? 0) > 0;

  return (
    <div>
      <ReviewHeader
        assistantLabel={assistantLabel}
        pendingApproval={pendingApproval}
        totalFiles={fileStats.length}
        totalAdditions={totalStats.additions}
        totalDeletions={totalStats.deletions}
        viewedCount={viewedCount}
        diffMode={diffMode}
        onToggleDiffMode={handleToggleDiffMode}
        onApprove={onApprove}
        onReject={onReject}
        onToggleFileTree={hasFiles ? () => setFileTreeOpen((prev) => !prev) : undefined}
      />

      {hasFiles ? (
        <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-4">
          {/* File tree sidebar — hidden on mobile unless toggled */}
          <aside className={`hidden md:block ${fileTreeOpen ? '!block' : ''}`}>
            <div className="sticky top-16">
              <FileTreePanel
                files={fileStats}
                viewedFiles={viewedFiles}
                activeFilePath={activeFilePath}
                onFileClick={handleFileClick}
              />
            </div>
          </aside>

          <div className="flex flex-col gap-4">
            {pendingApproval?.tasks && pendingApproval.tasks.length > 0 && (
              <div className="rounded-[var(--radius-panel)] border border-border bg-surface-1 p-4">
                <span className="text-xs font-medium text-text-tertiary uppercase tracking-wider">Planned tasks</span>
                <div className="flex flex-col gap-2 mt-2">
                  {pendingApproval.tasks.map((task, index) => (
                    <div className="flex items-start gap-2" key={`${task}-${index}`}>
                      <span className="shrink-0 w-5 h-5 rounded-full bg-accent-muted flex items-center justify-center text-[10px] font-bold text-accent">
                        {index + 1}
                      </span>
                      <span className="text-sm text-text-primary">{task}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {lastDiff!.files.map((file, fileIndex) => {
              const stats = fileStats.find((s) => s.filePath === file.filePath) ?? {
                filePath: file.filePath,
                additions: 0,
                deletions: 0,
              };
              return (
                <ReviewFileCard
                  key={file.filePath}
                  ref={(el) => setFileCardRef(file.filePath, el)}
                  file={file}
                  fileIndex={fileIndex}
                  pendingApproval={pendingApproval}
                  diffMode={diffMode}
                  isCollapsed={collapsedFiles.has(file.filePath)}
                  isViewed={viewedFiles.has(file.filePath)}
                  onToggleCollapse={handleToggleCollapse}
                  onToggleViewed={handleToggleViewed}
                  stats={stats}
                />
              );
            })}

            <ApprovalHistoryList approvalHistory={approvalHistory} />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="rounded-[var(--radius-panel)] border border-border bg-surface-1 p-8 text-center">
            <p className="text-sm text-text-secondary">No diff available yet.</p>
            <p className="text-xs text-text-tertiary mt-1">Once the assistant proposes file changes, the full review will appear here.</p>
          </div>
          <ApprovalHistoryList approvalHistory={approvalHistory} />
        </div>
      )}
    </div>
  );
}
