/**
 * Per-turn token accounting.
 *
 * Both CLIs report what a turn cost, but in different shapes and in different places:
 *
 *  - Codex's app-server sends camelCase on its `turn/completed` notification
 *    (`tokenUsage: { inputTokens, cachedInputTokens, outputTokens, reasoningOutputTokens,
 *    totalTokens }`), while its on-disk rollout writes the same numbers in snake_case under
 *    `info.last_token_usage`.
 *  - Claude's `--output-format stream-json` puts `usage` on assistant messages and on the final
 *    `result`, with `cache_read_input_tokens` / `cache_creation_input_tokens` broken out and
 *    thinking tokens nested under `output_tokens_details` — and no total at all.
 *
 * Rather than three parsers pinned to three exact paths, this walks the payload for the first
 * object that looks like token usage and normalises it. Provider payloads are the kind of thing
 * that gets re-nested between versions, and a missing token count should degrade to "not shown",
 * never to a wrong number.
 */
export interface TurnTokenUsage {
  /** Everything the turn cost. Computed when the provider does not supply a total. */
  totalTokens: number;
  inputTokens: number | null;
  outputTokens: number | null;
  /** Prompt tokens served from cache. Reported by both, and much cheaper than fresh input. */
  cachedInputTokens: number | null;
  /** Reasoning / thinking tokens, where the provider separates them. */
  reasoningTokens: number | null;
}

/** Keys that mean the same number across the shapes above. */
const FIELD_ALIASES = {
  inputTokens: ['inputTokens', 'input_tokens'],
  outputTokens: ['outputTokens', 'output_tokens'],
  totalTokens: ['totalTokens', 'total_tokens'],
  cachedInputTokens: [
    'cachedInputTokens',
    'cached_input_tokens',
    'cache_read_input_tokens',
    'cacheReadInputTokens'
  ],
  reasoningTokens: ['reasoningOutputTokens', 'reasoning_output_tokens', 'thinking_tokens']
} as const;

function readNumber(source: Record<string, unknown>, keys: readonly string[]): number | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
  }
  return null;
}

/** Does this object carry token counts, as opposed to merely containing one somewhere below? */
function looksLikeUsage(value: Record<string, unknown>): boolean {
  return (
    readNumber(value, FIELD_ALIASES.totalTokens) !== null ||
    readNumber(value, FIELD_ALIASES.inputTokens) !== null ||
    readNumber(value, FIELD_ALIASES.outputTokens) !== null
  );
}

function normalize(source: Record<string, unknown>): TurnTokenUsage | null {
  const inputTokens = readNumber(source, FIELD_ALIASES.inputTokens);
  const outputTokens = readNumber(source, FIELD_ALIASES.outputTokens);
  const reported = readNumber(source, FIELD_ALIASES.totalTokens);

  let cachedInputTokens = readNumber(source, FIELD_ALIASES.cachedInputTokens);
  // Claude reports cache writes separately from cache reads; both are prompt tokens.
  const cacheWrite = readNumber(source, [
    'cache_creation_input_tokens',
    'cacheCreationInputTokens',
    'cache_write_input_tokens',
    'cacheWriteInputTokens'
  ]);
  if (cacheWrite !== null) cachedInputTokens = (cachedInputTokens ?? 0) + cacheWrite;

  let reasoningTokens = readNumber(source, FIELD_ALIASES.reasoningTokens);
  const details = source['output_tokens_details'] ?? source['outputTokensDetails'];
  if (reasoningTokens === null && details && typeof details === 'object') {
    reasoningTokens = readNumber(details as Record<string, unknown>, FIELD_ALIASES.reasoningTokens);
  }

  // Claude supplies no total, so it has to be summed. Cached prompt tokens are part of what the
  // turn consumed, so they count; reasoning tokens are already inside `output_tokens` and must not
  // be added again or the total double-counts them.
  const total = reported ?? (inputTokens ?? 0) + (outputTokens ?? 0) + (cachedInputTokens ?? 0);
  if (total <= 0) return null;

  return { totalTokens: total, inputTokens, outputTokens, cachedInputTokens, reasoningTokens };
}

/**
 * Pull token usage out of a provider payload, wherever it sits.
 *
 * Prefers an explicitly named usage object (`tokenUsage` / `usage` / `last_token_usage`) over a
 * bare one found by shape, because a payload can carry both a per-turn and a cumulative figure and
 * the named one is the turn's.
 */
export function extractTurnUsage(payload: unknown, maxDepth = 6): TurnTokenUsage | null {
  if (!payload || typeof payload !== 'object' || maxDepth < 0) return null;

  const source = payload as Record<string, unknown>;
  // Order matters. A payload can carry the turn's cost AND the thread's running total, and the
  // per-turn keys are checked first so "36,340 tokens" never silently becomes the whole session.
  // `thread/tokenUsage/updated` is thread-scoped by name, so this is a live risk, not a hypothetical.
  const NAMED = [
    'lastTokenUsage',
    'last_token_usage',
    'tokenUsage',
    'token_usage',
    'usage',
    'info'
  ];

  for (const key of NAMED) {
    const candidate = source[key];
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
      const usage = normalize(candidate as Record<string, unknown>);
      if (usage) return usage;
    }
  }

  if (looksLikeUsage(source)) {
    const usage = normalize(source);
    if (usage) return usage;
  }

  for (const value of Object.values(source)) {
    if (!value || typeof value !== 'object') continue;
    // Arrays hold per-iteration breakdowns; the parent total is what a turn cost.
    if (Array.isArray(value)) continue;
    const found = extractTurnUsage(value, maxDepth - 1);
    if (found) return found;
  }
  return null;
}

/** "19,438 tokens" — the compact form for the line under a message. */
export function formatTokenCount(total: number): string {
  return `${total.toLocaleString('en-US')} tokens`;
}
