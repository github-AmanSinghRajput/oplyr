import test from 'node:test';
import assert from 'node:assert/strict';
import { extractClaudeResultErrorMessage } from '../../claude-client.js';

test('extractClaudeResultErrorMessage extracts Claude session-limit text', () => {
  const result = extractClaudeResultErrorMessage({
    type: 'result',
    subtype: 'success',
    is_error: true,
    api_error_status: 429,
    result: "You've hit your session limit \u00b7 resets 12:50am (Asia/Calcutta)"
  });

  assert.equal(result, "You've hit your session limit \u00b7 resets 12:50am (Asia/Calcutta)");
});

test('extractClaudeResultErrorMessage handles numeric status without result text', () => {
  const result = extractClaudeResultErrorMessage({
    type: 'result',
    subtype: 'success',
    is_error: true,
    api_error_status: 429
  });

  assert.equal(result, 'Claude Code session limit reached. Try again after your quota resets.');
});
