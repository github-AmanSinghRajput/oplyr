import { type FormEvent } from 'react';
import { Loader2, Search, X } from 'lucide-react';

interface MemorySearchProps {
  query: string;
  searching: boolean;
  matchCount: number | null;
  onQueryChange: (value: string) => void;
  /** Run a search. An empty query is a reset, handled by the screen. */
  onSubmit: (query: string) => void;
  onReset: () => void;
}

/**
 * Semantic search over the brain, as a single toolbar field.
 *
 * Results do not render here. They take over the drawer under the canvas, which is where recent
 * memories already live, so searching swaps the content of a region you are already looking at
 * instead of adding a third list to the page.
 */
export function MemorySearchBox({
  query,
  searching,
  matchCount,
  onQueryChange,
  onSubmit,
  onReset
}: MemorySearchProps) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit(query.trim());
  };

  return (
    <form className="memory-searchbar" onSubmit={handleSubmit} role="search">
      <span className="memory-searchbar__icon" aria-hidden="true">
        {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
      </span>
      <input
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder="Search memories by meaning, e.g. 'auth token handling'"
        aria-label="Search brain memories"
      />
      {matchCount !== null ? <span className="memory-searchbar__count">{matchCount}</span> : null}
      {query || matchCount !== null ? (
        <button type="button" onClick={onReset} aria-label="Clear search" title="Clear search">
          <X size={13} />
        </button>
      ) : null}
    </form>
  );
}
