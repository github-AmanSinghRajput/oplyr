import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// The runtime database resolves its file from the user-data dir, so point that somewhere temporary
// BEFORE importing anything that touches it.
process.env.OPLYR_USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'oplyr-usage-'));

// Unique per run. Fixed ids collided with rows left by an earlier run, which showed this suite
// does not always get the fresh temp database it asks for — so the test is written not to care
// whether the table starts empty.
const runId = Math.random().toString(36).slice(2, 10);
const USER_ID = `user-${runId}`;
const REPLY_ID = `assistant-${runId}`;
const PLAIN_ID = `plain-${runId}`;

const { initializeDatabase, getDatabase } = await import('../../db/client.js');
const { ChatRepository } = await import('./chat.repository.js');

await initializeDatabase();
const repository = new ChatRepository();

/**
 * Token usage has to outlive the process.
 *
 * It shipped as live-only state, alongside the memory chip, which meant a reply kept its text
 * across a restart and lost its price. That is the wrong lifetime: the count is a record of
 * something that happened, it is the basis for measuring what the Brain saves over time, and it
 * cannot be recovered afterwards because the CLI reports it exactly once, during the turn.
 */
test('a reply keeps its token count across a reload', async () => {
  await repository.appendMessages([
    {
      id: USER_ID,
      role: 'user',
      source: 'text',
      text: 'hi',
      createdAt: new Date().toISOString()
    },
    {
      id: REPLY_ID,
      role: 'assistant',
      source: 'text',
      text: 'hello',
      authorProviderId: 'codex',
      createdAt: new Date().toISOString(),
      tokenUsage: {
        totalTokens: 19438,
        inputTokens: 19117,
        outputTokens: 321,
        cachedInputTokens: 0,
        reasoningTokens: 116
      }
    }
  ]);

  // A fresh read is what the app does on launch.
  const reloaded = await repository.listRecentMessages();
  const assistant = reloaded.find((message) => message.id === REPLY_ID);

  assert.ok(assistant, 'the reply itself should survive');
  assert.equal(assistant.tokenUsage?.totalTokens, 19438);
  assert.equal(assistant.tokenUsage?.reasoningTokens, 116);

  // A user message has no cost of its own and must not invent one.
  const user = reloaded.find((message) => message.id === USER_ID);
  assert.equal(user?.tokenUsage, undefined);
});

test('a malformed usage blob costs its own chip, not the transcript', async () => {
  await repository.appendMessages([
    {
      id: PLAIN_ID,
      role: 'assistant',
      source: 'text',
      text: 'still readable',
      createdAt: new Date().toISOString()
    }
  ]);
  // Simulate a row written by a different build, or edited by hand.
  getDatabase()
    .prepare(`UPDATE conversation_messages SET token_usage = ? WHERE id = ?`)
    .run('{not json', PLAIN_ID);

  const reloaded = await repository.listRecentMessages();
  const assistant = reloaded.find((message) => message.id === PLAIN_ID);

  assert.equal(assistant?.text, 'still readable', 'the message must still load');
  assert.equal(assistant?.tokenUsage, undefined, 'and simply have no count');
});
