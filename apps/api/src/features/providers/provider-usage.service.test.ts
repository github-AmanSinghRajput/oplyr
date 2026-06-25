import test from 'node:test';
import assert from 'node:assert/strict';
import { providerUsageParsers } from './provider-usage.service.js';

test('parseCodexUsage extracts model, account, context window, and limits', () => {
  const raw = `
    OpenAI Codex (v0.114.0)
    Visit https://chatgpt.com/codex/settings/usage for up-to-date information on rate limits and credits

    Model: gpt-5.4 (reasoning high, summaries auto)
    Directory: ~/Desktop/org/oplyr
    Permissions: Custom (workspace-write, on-request)
    Agents.md: <none>
    Account: rajput.aman900@gmail.com (Plus)
    Collaboration mode: Default
    Session: 019d25b6-d487-7e41-94a9-0404d3b95896

    Context window: 56% left (119K used / 258K)
    5h limit: 86% left (resets 12:29)
    Weekly limit: 96% left (resets 07:29 on 15 Apr)
  `;

  const parsed = providerUsageParsers.parseCodexUsage(raw);

  assert.equal(parsed.providerId, 'codex');
  assert.equal(parsed.available, true);
  assert.equal(parsed.model, 'gpt-5.4 (reasoning high, summaries auto)');
  assert.equal(parsed.accountLabel, 'rajput.aman900@gmail.com (Plus)');
  assert.equal(parsed.sessionId, '019d25b6-d487-7e41-94a9-0404d3b95896');
  assert.equal(parsed.contextWindow?.percentLeft, 56);
  assert.equal(parsed.contextWindow?.percentUsed, 44);
  assert.equal(parsed.contextWindow?.detail, '119K used / 258K');
  assert.equal(parsed.meters[0]?.label, '5h limit');
  assert.equal(parsed.meters[0]?.percentUsed, 14);
  assert.equal(parsed.meters[1]?.label, 'Weekly limit');
  assert.equal(parsed.meters[1]?.percentLeft, 96);
});

test('parseClaudeUsage extracts session, weekly, and extra usage bars', () => {
  const raw = `
    /usage
    Usage
    Current session
    62% used
    Resets 12:30pm (Asia/Calcutta)

    Current week (all models)
    48% used
    Resets Apr 13 at 11:30am (Asia/Calcutta)

    Extra usage
    100% used
    $20.95 / $20.00 spent · Resets May 1 (Asia/Calcutta)
  `;

  const parsed = providerUsageParsers.parseClaudeUsage(raw);

  assert.equal(parsed.providerId, 'claude');
  assert.equal(parsed.available, true);
  assert.equal(parsed.meters.length, 3);
  assert.equal(parsed.meters[0]?.label, 'Current session');
  assert.equal(parsed.meters[0]?.percentUsed, 62);
  assert.equal(parsed.meters[0]?.resetAt, '12:30pm (Asia/Calcutta)');
  assert.equal(parsed.meters[1]?.label, 'Current week');
  assert.equal(parsed.meters[1]?.percentUsed, 48);
  assert.equal(parsed.meters[2]?.label, 'Extra usage');
  assert.equal(parsed.meters[2]?.percentUsed, 100);
  assert.equal(parsed.meters[2]?.detail, '$20.95 / $20.00 spent');
});

test('parseGeminiUsage extracts model and generic percentage meters when present', () => {
  const raw = `
    Gemini CLI
    Model: gemini-2.5-pro
    Session usage 35% used
    Remaining quota 65% left
    Tokens used: 14,332
  `;

  const parsed = providerUsageParsers.parseGeminiUsage(raw);

  assert.equal(parsed.providerId, 'gemini');
  assert.equal(parsed.available, true);
  assert.equal(parsed.model, 'gemini-2.5-pro');
  assert.equal(parsed.details[0]?.label, 'Tokens');
  assert.equal(parsed.meters.length, 2);
});
