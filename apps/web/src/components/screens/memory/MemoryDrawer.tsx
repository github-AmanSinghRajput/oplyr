import { Activity, ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';
import { colorForType, type MemoryDrawerItem } from './memory-shared';

interface MemoryDrawerProps {
  items: MemoryDrawerItem[];
  /** 'results' while a search is showing, otherwise the live capture feed. */
  mode: 'recent' | 'results';
  query: string;
  live: boolean;
  selectedId: string | null;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onSelect: (atomId: string) => void;
}

/**
 * The strip under the canvas: recent captures, or search results when there is a search.
 *
 * Fixed height with its own scroll, and collapsible, so the page itself never scrolls. Items lay
 * out in a responsive grid rather than one column, because a 340px-wide list of long sentences was
 * most of why this screen felt cramped.
 */
export function MemoryDrawer({
  items,
  mode,
  query,
  live,
  selectedId,
  collapsed,
  onToggleCollapsed,
  onSelect
}: MemoryDrawerProps) {
  const isResults = mode === 'results';

  return (
    <section className={cn('memory-drawer', collapsed && 'is-collapsed')} aria-label="Memories">
      <div className="memory-drawer__bar">
        <button
          type="button"
          className="memory-drawer__toggle"
          onClick={onToggleCollapsed}
          aria-expanded={!collapsed}
        >
          <ChevronDown size={14} className="memory-drawer__chevron" />
          <span className="memory-drawer__title">
            {isResults ? 'Search results' : 'Recent memories'}
          </span>
          <span className="memory-drawer__hint">
            {isResults ? `${items.length} for “${query}”` : `${items.length} newest`}
          </span>
        </button>

        {isResults ? null : (
          <span className={cn('memory-live-pill', live && 'is-live')}>
            <Activity size={12} />
            {live ? 'Live' : 'Idle'}
          </span>
        )}
      </div>

      <div className="memory-drawer__body">
        {items.length > 0 ? (
          <ul className="memory-drawer__grid">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={cn('memory-card', selectedId === item.id && 'is-selected')}
                  onClick={() => onSelect(item.id)}
                >
                  <span
                    className="memory-card__spine"
                    style={{ background: colorForType(item.type) }}
                    aria-hidden="true"
                  />
                  <div className="memory-card__top">
                    <span className="memory-card__type">
                      {item.type} · {item.scope}
                    </span>
                    <span className="memory-card__trailing">{item.trailing}</span>
                  </div>
                  <p className="memory-card__text">{item.text}</p>
                  <div className="memory-card__meta">
                    <span>{item.meta}</span>
                    {item.otherProject ? (
                      <span className="memory-card__cross">{item.otherProject}</span>
                    ) : null}
                    {item.sensitive ? <Badge variant="destructive">sensitive</Badge> : null}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="memory-inline-empty">
            {isResults
              ? 'No memories matched that search.'
              : 'No memories captured yet. Enable an agent writer and make explicit decisions in chat.'}
          </p>
        )}
      </div>
    </section>
  );
}
