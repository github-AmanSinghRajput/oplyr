import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractTurnUsage, formatTokenCount } from './turn-usage.js';

test('reads Codex app-server usage from a turn/completed notification', () => {
  // camelCase, as the app-server sends it. Field names taken from the shipped codex binary.
  const usage = extractTurnUsage({
    method: 'turn/completed',
    params: {
      threadId: 't1',
      tokenUsage: {
        inputTokens: 19117,
        cachedInputTokens: 0,
        outputTokens: 321,
        reasoningOutputTokens: 116,
        totalTokens: 19438
      }
    }
  });

  assert.equal(usage?.totalTokens, 19438);
  assert.equal(usage?.inputTokens, 19117);
  assert.equal(usage?.outputTokens, 321);
  assert.equal(usage?.reasoningTokens, 116);
});

test('reads Codex rollout usage, and prefers the turn over the cumulative figure', () => {
  // Verbatim shape from a real rollout. `total_token_usage` is the session running total, so a
  // parser that grabbed the first match could report the whole session as one turn's cost.
  const usage = extractTurnUsage({
    type: 'token_count',
    info: {
      total_token_usage: { input_tokens: 900000, output_tokens: 5000, total_tokens: 905000 },
      last_token_usage: {
        input_tokens: 19117,
        cached_input_tokens: 0,
        cache_write_input_tokens: 0,
        output_tokens: 321,
        reasoning_output_tokens: 116,
        total_tokens: 19438
      },
      model_context_window: 258400
    }
  });

  assert.equal(usage?.totalTokens, 19438, 'must be the turn, not the session total');
});

test('reads Claude usage and computes the total it does not provide', () => {
  // Verbatim from a real Claude transcript. There is no total field, cache reads and writes are
  // separate, and thinking tokens are nested inside output_tokens_details.
  const usage = extractTurnUsage({
    type: 'result',
    message: {
      model: 'claude-opus-5',
      usage: {
        input_tokens: 2,
        cache_creation_input_tokens: 35894,
        cache_read_input_tokens: 0,
        output_tokens: 444,
        output_tokens_details: { thinking_tokens: 335 }
      }
    }
  });

  // 2 input + 444 output + 35894 cached prompt. Thinking tokens are already inside output_tokens
  // and must not be added again.
  assert.equal(usage?.totalTokens, 36340);
  assert.equal(usage?.cachedInputTokens, 35894);
  assert.equal(usage?.reasoningTokens, 335);
});

test('returns null rather than a wrong number when there is no usage', () => {
  assert.equal(extractTurnUsage({ method: 'item/completed', params: { item: {} } }), null);
  assert.equal(extractTurnUsage(null), null);
  assert.equal(extractTurnUsage('nope'), null);
  // All zeroes is not a turn worth reporting.
  assert.equal(extractTurnUsage({ usage: { input_tokens: 0, output_tokens: 0 } }), null);
});

test('does not recurse forever on a self-referential payload', () => {
  const loop: Record<string, unknown> = { a: {} };
  (loop.a as Record<string, unknown>).back = loop;
  assert.equal(extractTurnUsage(loop), null);
});

test('formats a count for the line under a message', () => {
  assert.equal(formatTokenCount(19438), '19,438 tokens');
  assert.equal(formatTokenCount(42), '42 tokens');
});

test('reads the thread/tokenUsage/updated notification Codex actually sends', () => {
  // The app-server reports cost on its own notification, not on turn/completed. Hooking the wrong
  // one meant every reply arrived with no token count at all.
  const usage = extractTurnUsage({
    method: 'thread/tokenUsage/updated',
    params: {
      threadId: '019fec41',
      tokenUsage: {
        inputTokens: 19117,
        cachedInputTokens: 0,
        outputTokens: 321,
        reasoningOutputTokens: 116,
        totalTokens: 19438
      }
    }
  });

  assert.equal(usage?.totalTokens, 19438);
});

test('prefers the turn over the thread total when a payload carries both', () => {
  // A thread-scoped notification is exactly where a running total is likely to appear beside the
  // turn's own cost. Reporting the session as one turn would be worse than reporting nothing.
  const usage = extractTurnUsage({
    method: 'thread/tokenUsage/updated',
    params: {
      tokenUsage: {
        totalTokenUsage: { inputTokens: 880000, outputTokens: 24000, totalTokens: 904000 },
        lastTokenUsage: { inputTokens: 19117, outputTokens: 321, totalTokens: 19438 }
      }
    }
  });

  assert.equal(usage?.totalTokens, 19438, 'must be the turn, not the thread total');
});
