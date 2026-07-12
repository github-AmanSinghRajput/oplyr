import { Activity } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';
import type { BrainAtom } from '@/containers/voice-console/lib/types';
import { cleanAtomText, formatContributors, formatDateTime } from './memory-shared';

interface MemoryCaptureFeedProps {
  atoms: BrainAtom[];
  selectedId: string | null;
  live: boolean;
  onSelect: (atomId: string) => void;
}

/** Chronological feed of the most recently captured atoms; refreshes live on `brain_update`. */
export function MemoryCaptureFeed({ atoms, selectedId, live, onSelect }: MemoryCaptureFeedProps) {
  return (
    <section className="memory-panel memory-feed-panel">
      <div className="memory-panel__header">
        <div>
          <p className="memory-eyebrow">Live capture</p>
          <h3>Recent memories</h3>
        </div>
        <span className={cn('memory-live-pill', live && 'is-live')}>
          <Activity size={12} />
          {live ? 'Live' : 'Idle'}
        </span>
      </div>

      {atoms.length > 0 ? (
        <ul className="memory-feed-list">
          {atoms.map((atom) => (
            <li key={atom.id}>
              <button
                type="button"
                className={cn('memory-feed-item', selectedId === atom.id && 'is-selected')}
                onClick={() => onSelect(atom.id)}
              >
                <div className="memory-feed-item__top">
                  <span className="memory-feed-item__type">
                    {atom.type} · {atom.scope}
                  </span>
                  <span className="memory-feed-item__time">{formatDateTime(atom.lastSeenAt)}</span>
                </div>
                <p className="memory-feed-item__text">{cleanAtomText(atom.text) || atom.text}</p>
                <div className="memory-feed-item__meta">
                  <span>{formatContributors(atom.contributors.map((c) => c.providerId))}</span>
                  {atom.sensitivity === 'sensitive' ? (
                    <Badge variant="destructive">sensitive</Badge>
                  ) : null}
                </div>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="memory-inline-empty">
          No memories captured yet. Enable an agent writer and make explicit decisions in chat.
        </p>
      )}
    </section>
  );
}
