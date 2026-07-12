import { MousePointerClick, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatContributors, formatDateTime } from './memory-shared';
import type { AtomDetail } from './memory-atom-detail-model';

interface MemoryAtomDetailProps {
  detail: AtomDetail | null;
  busy: boolean;
  onDelete: (atomId: string) => void;
}

/** Inspector for a single atom: full text + provenance, contributors, and a Delete action. */
export function MemoryAtomDetail({ detail, busy, onDelete }: MemoryAtomDetailProps) {
  if (!detail) {
    return (
      <section className="memory-panel memory-detail-panel">
        <div className="memory-panel__header">
          <div>
            <p className="memory-eyebrow">Inspector</p>
            <h3>Select a memory</h3>
          </div>
        </div>
        <div className="memory-detail-empty">
          <MousePointerClick size={18} />
          <p>Click a node in the graph, a search result, or a feed item to inspect it here.</p>
        </div>
      </section>
    );
  }

  const projectLabel =
    detail.scope === 'global' ? 'Global (all projects)' : (detail.projectKey ?? 'Current project');

  return (
    <section className="memory-panel memory-detail-panel">
      <div className="memory-panel__header">
        <div>
          <p className="memory-eyebrow">Inspector</p>
          <h3>Memory detail</h3>
        </div>
        {detail.sensitivity === 'sensitive' ? <Badge variant="destructive">sensitive</Badge> : null}
      </div>

      <div className="memory-detail">
        <div className="memory-detail__chips">
          <Badge variant={detail.scope === 'global' ? 'secondary' : 'default'}>
            {detail.scope}
          </Badge>
          <Badge variant="outline">{detail.type}</Badge>
          {detail.crossProject ? <Badge variant="outline">cross-project</Badge> : null}
        </div>

        <p className="memory-detail__text">{detail.text}</p>

        <dl className="memory-detail__facts">
          <DetailRow label="Source project" value={projectLabel} />
          <DetailRow label="Contributors" value={formatContributors(detail.contributors)} />
          {detail.confidence !== null ? (
            <DetailRow label="Confidence" value={`${Math.round(detail.confidence * 100)}%`} />
          ) : null}
          {detail.source ? <DetailRow label="Captured via" value={detail.source} /> : null}
          {detail.capturedAt ? (
            <DetailRow label="Captured" value={formatDateTime(detail.capturedAt)} />
          ) : null}
          {detail.lastSeenAt ? (
            <DetailRow label="Last seen" value={formatDateTime(detail.lastSeenAt)} />
          ) : null}
        </dl>

        {detail.entities.length > 0 ? (
          <div className="memory-detail__entities">
            <span className="memory-detail__entities-label">Entities</span>
            <div>
              {detail.entities.map((entity) => (
                <span key={entity} className="memory-entity-tag">
                  {entity}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <Button
          variant="destructive"
          size="sm"
          className="w-full"
          disabled={busy}
          onClick={() => onDelete(detail.id)}
        >
          <Trash2 size={13} />
          Delete memory
        </Button>
      </div>
    </section>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd title={value}>{value}</dd>
    </div>
  );
}
