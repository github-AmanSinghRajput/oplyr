import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { MemoryAtomDetail } from './MemoryAtomDetail';
import { MemoryLinkInspector } from './MemoryLinkInspector';
import type { AtomDetail } from './memory-atom-detail-model';
import type { BrainGraphEdge, BrainGraphNode } from '@/containers/voice-console/lib/types';

interface MemoryInspectorProps {
  detail: AtomDetail | null;
  edge: BrainGraphEdge | null;
  edgeSource: BrainGraphNode | null;
  edgeTarget: BrainGraphNode | null;
  busy: boolean;
  onSelectNode: (atomId: string) => void;
  onDelete: (atomId: string) => void;
  onClose: () => void;
}

/**
 * The detail panel, as a sheet over the right edge of the canvas.
 *
 * It used to be a permanent column in a right-hand rail, which cost the graph a third of its width
 * for a panel that says "Nothing selected" most of the time. Now it is only present when there is
 * something to inspect, and it overlays the canvas rather than resizing it: the force simulation
 * re-runs on a width change, so reflowing the graph every time you clicked a dot made the whole
 * layout jump.
 */
export function MemoryInspector({
  detail,
  edge,
  edgeSource,
  edgeTarget,
  busy,
  onSelectNode,
  onDelete,
  onClose
}: MemoryInspectorProps) {
  const open = Boolean(edge ?? detail);

  return (
    <aside
      className={cn('memory-inspector', open && 'is-open')}
      aria-hidden={!open}
      // Kept mounted so it can transition in and out; nothing inside is reachable while closed.
      inert={!open}
    >
      <button
        type="button"
        className="memory-inspector__close"
        onClick={onClose}
        aria-label="Close inspector"
        title="Close"
      >
        <X size={14} />
      </button>

      <div className="memory-inspector__body">
        {edge ? (
          <MemoryLinkInspector
            edge={edge}
            source={edgeSource}
            target={edgeTarget}
            onSelectNode={onSelectNode}
          />
        ) : detail ? (
          <MemoryAtomDetail detail={detail} busy={busy} onDelete={onDelete} />
        ) : null}
      </div>
    </aside>
  );
}
