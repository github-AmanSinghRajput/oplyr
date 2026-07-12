import { ArrowLeftRight, Link2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { BrainGraphEdge, BrainGraphNode } from '@/containers/voice-console/lib/types';
import { cleanAtomText, formatContributors } from './memory-shared';

interface MemoryLinkInspectorProps {
  edge: BrainGraphEdge;
  source: BrainGraphNode | null;
  target: BrainGraphNode | null;
  onSelectNode: (id: string) => void;
}

/**
 * Inspector for a selected EDGE: shows the two memories it connects and the entities they share
 * (which is what created the link). Clicking either end jumps to that node's detail.
 */
export function MemoryLinkInspector({
  edge,
  source,
  target,
  onSelectNode
}: MemoryLinkInspectorProps) {
  return (
    <section className="memory-panel memory-link-panel">
      <div className="memory-panel__header">
        <div>
          <p className="memory-eyebrow">Inspector</p>
          <h3>Memory link</h3>
        </div>
        <Badge variant="outline">{Math.round(edge.weight * 100)}% overlap</Badge>
      </div>

      <div className="memory-link">
        <LinkEnd node={source} fallbackId={edge.source} onSelect={onSelectNode} />
        <div className="memory-link__joint">
          <ArrowLeftRight size={14} />
        </div>
        <LinkEnd node={target} fallbackId={edge.target} onSelect={onSelectNode} />
      </div>

      <div className="memory-link__shared">
        <span className="memory-link__shared-label">
          <Link2 size={12} /> Shared entities
        </span>
        {edge.sharedEntities.length > 0 ? (
          <div className="memory-link__tags">
            {edge.sharedEntities.map((entity) => (
              <span key={entity} className="memory-entity-tag">
                {entity}
              </span>
            ))}
          </div>
        ) : (
          <p className="memory-link__empty">
            No named entities in common — linked by semantic proximity.
          </p>
        )}
      </div>
    </section>
  );
}

function LinkEnd({
  node,
  fallbackId,
  onSelect
}: {
  node: BrainGraphNode | null;
  fallbackId: string;
  onSelect: (id: string) => void;
}) {
  if (!node) {
    return (
      <div className="memory-link__end is-missing">
        <span className="memory-link__end-type">unknown</span>
        <p className="memory-link__end-text">Memory no longer in the graph.</p>
      </div>
    );
  }

  return (
    <button
      type="button"
      className="memory-link__end"
      onClick={() => onSelect(node.id ?? fallbackId)}
    >
      <span className="memory-link__end-type">
        {node.type} · {node.scope}
      </span>
      <p className="memory-link__end-text">{cleanAtomText(node.label) || node.label}</p>
      <span className="memory-link__end-meta">{formatContributors(node.contributors)}</span>
    </button>
  );
}
