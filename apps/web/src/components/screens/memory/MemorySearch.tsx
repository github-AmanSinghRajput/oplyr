import { type FormEvent } from 'react';
import { Loader2, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';
import type { BrainRecallAtom } from '@/containers/voice-console/lib/types';
import { cleanAtomText, formatContributors } from './memory-shared';

interface MemorySearchProps {
  results: BrainRecallAtom[];
  query: string;
  searching: boolean;
  hasSearched: boolean;
  selectedId: string | null;
  onQueryChange: (value: string) => void;
  onSearch: (query: string) => void;
  onSelectResult: (atomId: string) => void;
}

/**
 * Semantic search over the brain (POST /api/brain/search). Ranked results are clickable and focus
 * the matching node in the graph + open its detail panel via `onSelectResult`.
 */
export function MemorySearch({
  results,
  query,
  searching,
  hasSearched,
  selectedId,
  onQueryChange,
  onSearch,
  onSelectResult
}: MemorySearchProps) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed) {
      onSearch(trimmed);
    }
  };

  return (
    <section className="memory-panel memory-search-panel">
      <div className="memory-panel__header">
        <div>
          <p className="memory-eyebrow">Semantic search</p>
          <h3>Ask the brain</h3>
        </div>
        {hasSearched ? <Badge variant="outline">{results.length} matches</Badge> : null}
      </div>

      <form className="memory-search-box" onSubmit={handleSubmit}>
        {searching ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search memories by meaning, e.g. 'auth token handling'"
          aria-label="Search brain memories"
        />
      </form>

      {hasSearched ? (
        results.length > 0 ? (
          <ul className="memory-result-list">
            {results.map((atom) => (
              <li key={atom.id}>
                <button
                  type="button"
                  className={cn('memory-result', selectedId === atom.id && 'is-selected')}
                  onClick={() => onSelectResult(atom.id)}
                >
                  <div className="memory-result__top">
                    <span className="memory-result__type">
                      {atom.type} · {atom.scope}
                    </span>
                    <span className="memory-result__score">{Math.round(atom.score * 100)}%</span>
                  </div>
                  <p className="memory-result__text">{cleanAtomText(atom.text) || atom.text}</p>
                  <div className="memory-result__meta">
                    <span>{formatContributors(atom.contributors)}</span>
                    {atom.crossProject ? (
                      <span className="memory-result__cross">
                        {atom.projectKey ?? 'other project'}
                      </span>
                    ) : null}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="memory-inline-empty">No memories matched that search.</p>
        )
      ) : (
        <p className="memory-inline-empty">
          Search by meaning, not just keywords — results are ranked by relevance to your work.
        </p>
      )}
    </section>
  );
}
