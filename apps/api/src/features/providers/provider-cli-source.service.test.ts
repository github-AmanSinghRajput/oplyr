import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCodexStatus } from './provider-cli-source.service.js';

const RENDERED_PANEL = `
╭──────────────────────────────────────────────────────────────────────────────╮
│ >_ OpenAI Codex (v0.121.0)                                                   │
│ Model: gpt-5.6-sol (reasoning high, summaries auto)                          │
│ Account: someone@example.com (Plus)                                          │
│ Session: 01a06dfd-b328-77b3-b418-3df8d7e6c124                                │
│                                                                              │
│ 5h limit: [███████░░░] 72% left (resets 01:29)                               │
│ Weekly limit: [█████████░] 93% left (resets 10:16 on 22 Jul)                 │
╰──────────────────────────────────────────────────────────────────────────────╯
`;

// What codex answers the FIRST /status after launch with: the panel renders, the account is there,
// but the limits are still being fetched.
const DEFERRED_PANEL = `
╭──────────────────────────────────────────────────────────────────────────────╮
│ >_ OpenAI Codex (v0.121.0)                                                   │
│ Model: gpt-5.6-sol (reasoning high, summaries auto)                          │
│ Account: someone@example.com (Plus)                                          │
│                                                                              │
│ Limits: refresh requested; run /status again shortly.                        │
╰──────────────────────────────────────────────────────────────────────────────╯
`;

test('parseCodexStatus reads both limit meters off a rendered panel', () => {
  const parsed = parseCodexStatus(RENDERED_PANEL);

  assert.ok(parsed, 'expected a parse result');
  assert.equal(parsed.meters.length, 2);

  const fiveHour = parsed.meters.find((meter) => meter.id === 'five-hour');
  assert.equal(fiveHour?.percentLeft, 72);
  assert.equal(fiveHour?.percentUsed, 28);
  assert.equal(fiveHour?.resetAt, '01:29');

  const weekly = parsed.meters.find((meter) => meter.id === 'weekly');
  assert.equal(weekly?.percentLeft, 93);
  assert.equal(weekly?.percentUsed, 7);
  assert.equal(weekly?.resetAt, '10:16 on 22 Jul');
});

test('parseCodexStatus yields nothing while codex is still fetching the limits', () => {
  // The scrape must keep asking in this state. Stopping here (the panel *had* rendered, and the
  // account line was on it) is what surfaced "Could not read Codex usage."
  assert.equal(parseCodexStatus(DEFERRED_PANEL), null);
});

test('parseCodexStatus reads the limits from a retried session transcript', () => {
  // The pty transcript accumulates, so a successful retry leaves the deferred placeholder above the
  // real panel. The meters still have to come out.
  const parsed = parseCodexStatus(`${DEFERRED_PANEL}\n${RENDERED_PANEL}`);

  assert.ok(parsed, 'expected a parse result');
  assert.equal(parsed.meters.length, 2);
  assert.equal(parsed.meters.find((meter) => meter.id === 'weekly')?.percentLeft, 93);
});
