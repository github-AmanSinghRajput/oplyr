import test from 'node:test';
import assert from 'node:assert/strict';
import { interpretClaudeAuthFailure, interpretClaudeAuthStatus } from './claude-client.js';

// Captured verbatim from `claude auth status` on Claude Code 2.1.259.
const SIGNED_IN = `{
  "loggedIn": true,
  "authMethod": "claude.ai",
  "apiProvider": "firstParty",
  "analyticsDisabled": false,
  "projectsDirectory": "/Users/someone/.claude/projects",
  "email": "someone@example.com",
  "orgId": "e4143fb0-8cfb-437b-9912-1f70baf5e316",
  "orgName": "ExampleCo",
  "subscriptionType": "team"
}`;

const SIGNED_OUT = `{
  "loggedIn": false,
  "apiProvider": "firstParty",
  "analyticsDisabled": false
}`;

test('interpretClaudeAuthStatus reads the account off a signed-in payload', () => {
  const status = interpretClaudeAuthStatus(SIGNED_IN);

  assert.equal(status.installed, true);
  assert.equal(status.loggedIn, true);
  assert.equal(status.accountLabel, 'someone@example.com');
  assert.equal(status.authMode, 'claude.ai');
});

test('interpretClaudeAuthStatus trusts loggedIn:false over the absent prose', () => {
  // The payload contains none of "not logged in" / "not authenticated" / "no account", so the old
  // negative text match reported this signed-OUT machine as signed in.
  const status = interpretClaudeAuthStatus(SIGNED_OUT);

  assert.equal(status.loggedIn, false);
  assert.equal(status.accountLabel, null);
  assert.equal(status.authMode, null);
});

test('interpretClaudeAuthStatus falls back to prose when the output is not JSON', () => {
  assert.equal(interpretClaudeAuthStatus('Logged in as someone@example.com').loggedIn, true);
  assert.equal(interpretClaudeAuthStatus('You are not logged in.').loggedIn, false);
});

test('interpretClaudeAuthStatus accepts the older authType field name', () => {
  const status = interpretClaudeAuthStatus('{"loggedIn":true,"authType":"apiKey"}');
  assert.equal(status.authMode, 'apiKey');
});

test('interpretClaudeAuthFailure reports a missing CLI as not installed', () => {
  const status = interpretClaudeAuthFailure('spawn claude ENOENT');
  assert.equal(status.installed, false);
  assert.equal(status.loggedIn, false);
});

test('interpretClaudeAuthFailure only claims logged-out when the CLI says so', () => {
  const status = interpretClaudeAuthFailure('Error: you are not logged in');
  assert.equal(status.installed, true);
  assert.equal(status.loggedIn, false);
});

test('interpretClaudeAuthFailure fails OPEN when the state is indeterminate', () => {
  // The reported bug: a CLI that does not understand `auth status` produced an error mentioning
  // "auth", the old check matched /auth/, and a signed-in user was hard-blocked from every turn.
  const status = interpretClaudeAuthFailure("error: unknown command 'auth'");

  assert.equal(status.installed, true);
  assert.equal(status.loggedIn, true, 'an unreadable status must not be treated as logged out');
  assert.match(status.statusText, /could not read its login status/);
});

test('interpretClaudeAuthFailure treats a permissions error as not installed', () => {
  assert.equal(interpretClaudeAuthFailure('EACCES: permission denied').installed, false);
});
