import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isCodexLaunchFailure, reduceCodexStatus, type CodexLoginStatus } from './codex-client.js';

function status(partial: Partial<CodexLoginStatus>): CodexLoginStatus {
  return {
    installed: true,
    loggedIn: false,
    accountLabel: null,
    authMode: null,
    statusText: '',
    ...partial
  };
}

test('isCodexLaunchFailure: only a launched-but-dead codex counts', () => {
  // Gatekeeper kill / corrupt install: installed, no recognizable login output.
  assert.equal(
    isCodexLaunchFailure(status({ statusText: 'Command failed: codex login status' })),
    true
  );
  // Normal logged-out codex prints "Not logged in" — it launched fine, so NOT a failure.
  assert.equal(isCodexLaunchFailure(status({ statusText: 'Not logged in' })), false);
  // Logged in — not a failure.
  assert.equal(
    isCodexLaunchFailure(status({ loggedIn: true, statusText: 'Logged in using ChatGPT' })),
    false
  );
  // Missing binary (ENOENT) — installed is false, its own clear message, no popup spam.
  assert.equal(isCodexLaunchFailure(status({ installed: false, statusText: 'ENOENT' })), false);
});

test('reduceCodexStatus: launch failure opens a cooldown and appends the update hint', () => {
  const probe = status({ statusText: 'Command failed: codex login status' });
  const { next, value } = reduceCodexStatus(probe, 1_000);

  assert.equal(next.until, 1_000 + 20_000);
  assert.ok(next.status);
  assert.match(value.statusText, /npm i -g @openai\/codex@latest/);
  // The structured verdict is preserved (only statusText is enriched).
  assert.equal(value.installed, true);
  assert.equal(value.loggedIn, false);
});

test('reduceCodexStatus: a healthy/logged-out probe clears any cooldown and is returned as-is', () => {
  const loggedOut = status({ statusText: 'Not logged in' });
  const result = reduceCodexStatus(loggedOut, 5_000);

  assert.equal(result.next.until, 0);
  assert.equal(result.next.status, null);
  assert.deepEqual(result.value, loggedOut); // unchanged — no hint appended
});
