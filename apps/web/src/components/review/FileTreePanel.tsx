import { useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { buildFileTree, type FileTreeNode } from '@/containers/voice-console/lib/file-tree';

interface FileStats {
  filePath: string;
  additions: number;
  deletions: number;
}

interface FileTreePanelProps {
  files: FileStats[];
  viewedFiles: Set<string>;
  activeFilePath: string | null;
  onFileClick: (filePath: string) => void;
}

export function FileTreePanel({
  files,
  viewedFiles,
  activeFilePath,
  onFileClick
}: FileTreePanelProps) {
  const tree = useMemo(() => buildFileTree(files.map((f) => f.filePath)), [files]);
  const statsMap = useMemo(() => {
    const map = new Map<string, FileStats>();
    for (const file of files) {
      map.set(file.filePath, file);
    }
    return map;
  }, [files]);

  const viewedCount = files.filter((f) => viewedFiles.has(f.filePath)).length;

  return (
    <nav className="rounded-[var(--radius-panel)] border border-border bg-surface-1 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs font-medium text-text-tertiary uppercase tracking-wider">
          Files changed
        </span>
        <span className="text-xs text-text-tertiary">
          {viewedCount} / {files.length} reviewed
        </span>
      </div>
      <div className="py-1">
        {tree.map((node) => (
          <FileTreeNodeView
            key={node.path}
            node={node}
            statsMap={statsMap}
            viewedFiles={viewedFiles}
            activeFilePath={activeFilePath}
            onFileClick={onFileClick}
            depth={0}
          />
        ))}
      </div>
    </nav>
  );
}

interface FileTreeNodeViewProps {
  node: FileTreeNode;
  statsMap: Map<string, FileStats>;
  viewedFiles: Set<string>;
  activeFilePath: string | null;
  onFileClick: (filePath: string) => void;
  depth: number;
}

function FileTreeNodeView({
  node,
  statsMap,
  viewedFiles,
  activeFilePath,
  onFileClick,
  depth
}: FileTreeNodeViewProps) {
  const [expanded, setExpanded] = useState(true);

  if (!node.isDirectory) {
    const stats = statsMap.get(node.path);
    const isActive = activeFilePath === node.path;
    const isViewed = viewedFiles.has(node.path);

    return (
      <button
        className={cn(
          'flex items-center gap-1.5 w-full text-left px-2 py-1 text-xs hover:bg-surface-2 transition-colors',
          isActive && 'bg-accent-muted/50 text-accent',
          isViewed && 'text-text-tertiary'
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={() => onFileClick(node.path)}
        type="button"
      >
        <span className={cn('truncate flex-1', isViewed && 'line-through')}>{node.name}</span>
        {stats && (
          <span className="flex items-center gap-1 shrink-0">
            {stats.additions > 0 && <span className="text-success">+{stats.additions}</span>}
            {stats.deletions > 0 && <span className="text-danger">-{stats.deletions}</span>}
          </span>
        )}
        {isViewed && (
          <span className="w-1.5 h-1.5 rounded-full bg-success shrink-0" title="Reviewed" />
        )}
      </button>
    );
  }

  return (
    <div>
      <button
        className="flex items-center gap-1 w-full text-left px-2 py-1 text-xs text-text-secondary hover:bg-surface-2 transition-colors"
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={() => setExpanded((prev) => !prev)}
        type="button"
      >
        <ChevronRight
          size={12}
          className={cn('shrink-0 transition-transform', expanded && 'rotate-90')}
        />
        <span className="font-medium">{node.name}</span>
      </button>
      {expanded &&
        node.children.map((child) => (
          <FileTreeNodeView
            key={child.path}
            node={child}
            statsMap={statsMap}
            viewedFiles={viewedFiles}
            activeFilePath={activeFilePath}
            onFileClick={onFileClick}
            depth={depth + 1}
          />
        ))}
    </div>
  );
}
