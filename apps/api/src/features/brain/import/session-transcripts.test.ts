import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractMessages, buildSessionText } from './session-transcripts.js';

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

test('buildSessionText keeps the most recent tail within the char budget', () => {
  const many = Array.from({ length: 50 }, (_, i) => ({
    role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
    text: `message ${i} ${'x'.repeat(100)}`
  }));
  const text = buildSessionText(many, 500);
  assert.ok(text.length <= 500 + 40); // 500 tail + the short "trimmed" prefix
  assert.ok(text.includes('message 49')); // newest kept
  assert.ok(text.startsWith('…[earlier turns trimmed]'));
});
