import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { extractMessages, readSessionMessages, buildSessionChunks } from './session-transcripts.js';

test('extracts Claude user/assistant text, skips partial first line + tool blocks', () => {
  const tail = [
    '{"partial": "this first line is trunca', // dropped as partial
    JSON.stringify({ type: 'user', message: { role: 'user', content: 'add retry logic' } }),
    JSON.stringify({
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Done — extracted retry into billing/retry.ts.' },
          { type: 'tool_use', input: { huge: 'x'.repeat(50) } }
        ]
      }
    })
  ].join('\n');

  const messages = extractMessages(tail, 'claude');
  assert.equal(messages.length, 2);
  assert.deepEqual(messages[0], { role: 'user', text: 'add retry logic' });
  assert.equal(messages[1]!.role, 'assistant');
  assert.equal(messages[1]!.text, 'Done — extracted retry into billing/retry.ts.'); // tool block ignored
});

test('extracts Codex event_msg user/agent messages, ignores noise', () => {
  const tail = [
    'garbage partial',
    JSON.stringify({
      type: 'event_msg',
      payload: { type: 'user_message', message: 'fix the arnie build' }
    }),
    JSON.stringify({ type: 'response_item', payload: { type: 'reasoning' } }),
    JSON.stringify({
      type: 'event_msg',
      payload: { type: 'agent_message', message: 'Patched the webpack config.' }
    }),
    JSON.stringify({ type: 'event_msg', payload: { type: 'token_count', info: {} } })
  ].join('\n');

  const messages = extractMessages(tail, 'codex');
  assert.equal(messages.length, 2);
  assert.deepEqual(messages[0], { role: 'user', text: 'fix the arnie build' });
  assert.deepEqual(messages[1], { role: 'assistant', text: 'Patched the webpack config.' });
});

/** Write a Claude-format transcript of `count` turns to a temp file; returns its path. */
async function writeClaudeSession(count: number, padding: number): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'oplyr-session-'));
  const lines = Array.from({ length: count }, (_, i) =>
    JSON.stringify({
      type: 'user',
      message: { role: 'user', content: `turn ${i} ${'x'.repeat(padding)}` }
    })
  );
  const file = path.join(dir, 'session.jsonl');
  await fs.writeFile(file, lines.join('\n'), 'utf8');
  return file;
}

test('readSessionMessages stops early once it has enough conversation', async () => {
  const file = await writeClaudeSession(400, 200);

  const messages = await readSessionMessages(file, 'claude', { enoughChars: 2000 });

  // It read enough and no further, and what it kept is the END of the session.
  assert.ok(messages.length > 0);
  assert.equal(messages.at(-1)!.text.startsWith('turn 399'), true);
});

test('readSessionMessages reads the whole of a session smaller than the budget', async () => {
  const file = await writeClaudeSession(5, 10);

  const messages = await readSessionMessages(file, 'claude', { enoughChars: 100_000 });

  assert.equal(messages.length, 5);
  assert.equal(messages[0]!.text.startsWith('turn 0'), true);
});

test('readSessionMessages honours maxBytes and never throws on a missing file', async () => {
  const file = await writeClaudeSession(400, 200);

  // A byte ceiling below the file size still yields the newest turns, not a crash.
  const capped = await readSessionMessages(file, 'claude', {
    maxBytes: 4096,
    enoughChars: 1_000_000
  });
  assert.ok(capped.length > 0);
  assert.equal(capped.at(-1)!.text.startsWith('turn 399'), true);

  assert.deepEqual(await readSessionMessages('/no/such/session.jsonl', 'claude'), []);
});

test('buildSessionChunks slices oldest-first and drops the OLDEST turns past the budget', () => {
  const messages = Array.from({ length: 40 }, (_, i) => ({
    role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
    text: `message ${i} ${'x'.repeat(100)}`
  }));

  const chunks = buildSessionChunks(messages, 500, 3);

  assert.equal(chunks.length, 3);
  for (const chunk of chunks) assert.ok(chunk.length <= 500 + 120);
  // The newest turn survives and the oldest is what the budget cut.
  assert.ok(chunks.at(-1)!.includes('message 39'));
  assert.ok(!chunks[0]!.includes('message 0'));
});

test('buildSessionChunks returns a single chunk when everything fits', () => {
  const messages = [
    { role: 'user' as const, text: 'add retry logic' },
    { role: 'assistant' as const, text: 'Done.' }
  ];

  const chunks = buildSessionChunks(messages, 12_000, 10);

  assert.equal(chunks.length, 1);
  assert.equal(chunks[0], 'User: add retry logic\n\nAssistant: Done.');
  assert.deepEqual(buildSessionChunks([], 12_000, 10), []);
});
