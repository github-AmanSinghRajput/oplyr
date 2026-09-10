import { useState } from 'react';
import type { MessageEntry } from '@/containers/voice-console/lib/types';

type TokenUsage = NonNullable<MessageEntry['tokenUsage']>;

/**
 * What the turn cost, reported by the agent's own CLI.
 *
 * Deliberately the same quiet register as the memory chip beside it: this is a footnote about the
 * turn, not a headline. Expanding it shows the breakdown, because "36,340 tokens" is only
 * interpretable once you can see how much of it was cached prompt rather than fresh work.
 *
 * No comparison against "what Codex alone would have cost" is shown. There is no measured baseline
 * for that, and inventing one would make the most interesting claim in the product the least
 * trustworthy number in it.
 */
export function TokenUsageChip({ usage }: { usage: TokenUsage }) {
  const [open, setOpen] = useState(false);

  const rows: Array<[string, number]> = [];
  if (usage.inputTokens !== null) rows.push(['Input', usage.inputTokens]);
  if (usage.cachedInputTokens) rows.push(['Cached input', usage.cachedInputTokens]);
  if (usage.outputTokens !== null) rows.push(['Output', usage.outputTokens]);
  if (usage.reasoningTokens) rows.push(['of which reasoning', usage.reasoningTokens]);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={rows.length === 0}
        className="flex items-center gap-1.5 text-[11px] text-text-tertiary transition-colors hover:text-text-secondary disabled:hover:text-text-tertiary"
        aria-expanded={open}
        title="Tokens this turn used, as reported by the agent's CLI"
      >
        <span aria-hidden="true">◍</span>
        <span>{usage.totalTokens.toLocaleString()} tokens</span>
        {rows.length > 0 ? (
          <span className="opacity-60" aria-hidden="true">
            {open ? '▾' : '▸'}
          </span>
        ) : null}
      </button>

      {open && rows.length > 0 ? (
        <dl className="mt-1.5 grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-[11px] text-text-tertiary">
          {rows.map(([label, value]) => (
            <div key={label} className="col-span-2 grid grid-cols-subgrid">
              <dt>{label}</dt>
              <dd className="text-right font-mono tabular-nums">{value.toLocaleString()}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}
