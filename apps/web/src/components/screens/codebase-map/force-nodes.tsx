import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { ChevronDown, ChevronRight, FileCode2 } from 'lucide-react';
import { colorForDir } from './nodes';

export type Highlight = 'selected' | 'neighbor' | 'dim' | 'none';

export interface ForceFolderData {
  kind: 'folder';
  name: string;
  collapsed: boolean;
  childCount: number;
  descendantFileCount: number;
  highlight: Highlight;
  [key: string]: unknown;
}
export interface ForceFileData {
  kind: 'file';
  label: string;
  dir: string;
  highlight: Highlight;
  [key: string]: unknown;
}
export type ForceFolderNode = Node<ForceFolderData, 'forceFolder'>;
export type ForceFileNode = Node<ForceFileData, 'forceFile'>;

const HANDLE: React.CSSProperties = {
  width: 1,
  height: 1,
  opacity: 0,
  border: 'none',
  minWidth: 0,
  minHeight: 0
};

function shell(highlight: Highlight, accent: string): React.CSSProperties {
  if (highlight === 'selected')
    return { boxShadow: `0 0 0 2px ${accent}, 0 0 18px ${accent}`, opacity: 1 };
  if (highlight === 'neighbor') return { boxShadow: `0 0 0 1px ${accent}`, opacity: 1 };
  if (highlight === 'dim') return { opacity: 0.3 };
  return { opacity: 1 };
}

export function ForceFolderNodeView({ data }: NodeProps<ForceFolderNode>) {
  const accent = colorForDir(data.name);
  return (
    <div
      className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 transition-[box-shadow,opacity]"
      style={{
        borderColor: `color-mix(in srgb, ${accent}, transparent 40%)`,
        background: `color-mix(in srgb, ${accent}, transparent 84%)`,
        cursor: 'grab',
        ...shell(data.highlight, accent)
      }}
    >
      <Handle type="target" position={Position.Top} style={HANDLE} />
      {data.collapsed ? (
        <ChevronRight size={12} style={{ color: accent }} />
      ) : (
        <ChevronDown size={12} style={{ color: accent }} />
      )}
      <span
        className="max-w-[150px] truncate font-mono text-[11px] font-semibold"
        style={{ color: accent }}
        title={data.name}
      >
        {data.name}
      </span>
      <span className="text-[10px] text-text-tertiary">{data.descendantFileCount}</span>
      <Handle type="source" position={Position.Bottom} style={HANDLE} />
    </div>
  );
}

export function ForceFileNodeView({ data }: NodeProps<ForceFileNode>) {
  const accent = colorForDir(data.dir);
  return (
    <div
      className="flex items-center gap-2 rounded-md border bg-surface-1 px-2.5 py-1.5 transition-[box-shadow,opacity]"
      style={{
        borderColor: data.highlight === 'selected' ? accent : 'var(--color-border-strong)',
        cursor: 'grab',
        ...shell(data.highlight, accent)
      }}
    >
      <Handle type="target" position={Position.Top} style={HANDLE} />
      <span className="h-3.5 w-1 rounded-full" style={{ background: accent }} />
      <FileCode2 size={12} className="shrink-0 text-text-tertiary" />
      <span
        className="max-w-[150px] truncate font-mono text-[11px] text-text-primary"
        title={data.label}
      >
        {data.label}
      </span>
      <Handle type="source" position={Position.Bottom} style={HANDLE} />
    </div>
  );
}

export const forceNodeTypes = { forceFolder: ForceFolderNodeView, forceFile: ForceFileNodeView };
