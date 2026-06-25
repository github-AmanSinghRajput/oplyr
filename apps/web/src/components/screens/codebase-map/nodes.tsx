import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { ChevronDown, ChevronRight, FileCode2, Folder } from 'lucide-react';

// Per-module colour so files/folders in the same top-level area read as a cluster.
const DIR_PALETTE = [
  '#68dbff',
  '#6efbbe',
  '#f2a65a',
  '#c084fc',
  '#f87aa8',
  '#7dd3fc',
  '#fbbf72',
  '#86efac'
];
export function colorForDir(dir: string): string {
  let hash = 0;
  for (let i = 0; i < dir.length; i += 1) {
    hash = (hash * 31 + dir.charCodeAt(i)) >>> 0;
  }
  return DIR_PALETTE[hash % DIR_PALETTE.length];
}

export type FileNodeData = {
  kind: 'file';
  label: string;
  dir: string;
  language: string;
  degree: number;
};
export type FolderNodeData = {
  kind: 'folder';
  name: string;
  collapsed: boolean;
  fileCount: number;
};
export type FileNode = Node<FileNodeData, 'file'>;
export type FolderNode = Node<FolderNodeData, 'folder'>;

export function FileNodeView({ data, selected }: NodeProps<FileNode>) {
  const accent = colorForDir(data.dir);
  return (
    <div
      className="flex items-center gap-2 rounded-md border bg-surface-1 px-2.5 py-1.5 transition-shadow"
      style={{
        borderColor: selected ? accent : 'var(--color-border-strong)',
        boxShadow: selected
          ? `0 0 0 1px ${accent}, 0 8px 22px rgba(0,0,0,0.35)`
          : '0 1px 3px rgba(0,0,0,0.12)'
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: accent, width: 6, height: 6, border: 'none' }}
      />
      <span className="h-4 w-1 rounded-full" style={{ background: accent }} />
      <FileCode2 size={13} className="shrink-0 text-text-tertiary" />
      <span
        className="max-w-[140px] truncate font-mono text-[11px] text-text-primary"
        title={data.label}
      >
        {data.label}
      </span>
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: accent, width: 6, height: 6, border: 'none' }}
      />
    </div>
  );
}

// Folder container (when expanded the children render inside it; when collapsed it's a compact chip).
// Clicking is handled at the flow level (onNodeClick) so the whole node area toggles collapse.
export function FolderNodeView({ data }: NodeProps<FolderNode>) {
  const accent = colorForDir(data.name);
  if (data.collapsed) {
    return (
      <div
        className="flex h-full w-full items-center gap-2 rounded-lg border bg-surface-2 px-3 shadow-sm"
        style={{ borderColor: 'var(--color-border-strong)' }}
      >
        <Handle
          type="target"
          position={Position.Top}
          style={{ background: accent, width: 6, height: 6, border: 'none' }}
        />
        <ChevronRight size={13} className="shrink-0 text-text-tertiary" />
        <Folder size={13} className="shrink-0" style={{ color: accent }} />
        <span
          className="truncate font-mono text-[11px] font-medium text-text-primary"
          title={data.name}
        >
          {data.name}
        </span>
        <span className="ml-auto shrink-0 text-[10px] text-text-tertiary">{data.fileCount}</span>
        <Handle
          type="source"
          position={Position.Bottom}
          style={{ background: accent, width: 6, height: 6, border: 'none' }}
        />
      </div>
    );
  }
  return (
    <div
      className="h-full w-full rounded-lg border bg-background/40"
      style={{ borderColor: `color-mix(in srgb, ${accent}, transparent 70%)` }}
    >
      {/* Header strip (the click target lives across the whole node, handled by the flow). */}
      <div className="flex items-center gap-1.5 px-2.5 py-1.5">
        <ChevronDown size={12} className="shrink-0 text-text-tertiary" />
        <Folder size={12} className="shrink-0" style={{ color: accent }} />
        <span
          className="truncate font-mono text-[11px] font-medium text-text-secondary"
          title={data.name}
        >
          {data.name}
        </span>
        <span className="ml-auto text-[10px] text-text-tertiary">{data.fileCount}</span>
      </div>
    </div>
  );
}

export const nodeTypes = { file: FileNodeView, folder: FolderNodeView };
