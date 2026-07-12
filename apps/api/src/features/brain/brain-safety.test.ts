import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkBrainAtomSafety,
  clipAtomText,
  normalizeAtomKey,
  redactMemoryText
} from './brain-safety.js';

test('checkBrainAtomSafety marks secret-like text as sensitive', () => {
  const tokenVerdict = checkBrainAtomSafety('API_KEY=sk-12345678901234567890abcdef');
  const pathVerdict = checkBrainAtomSafety('Use .env.local for local overrides');
  const keyVerdict = checkBrainAtomSafety('-----BEGIN OPENSSH PRIVATE KEY----- abc');

  assert.equal(tokenVerdict.safe, true);
  assert.equal(tokenVerdict.sensitivity, 'sensitive');
  assert.equal(pathVerdict.safe, true);
  assert.equal(pathVerdict.sensitivity, 'sensitive');
  assert.equal(keyVerdict.safe, true);
  assert.equal(keyVerdict.sensitivity, 'sensitive');
});

test('checkBrainAtomSafety accepts normal memory text', () => {
  const verdict = checkBrainAtomSafety('Decision: use a separate brain.db for Oplyr memory');
  assert.equal(verdict.safe, true);
  assert.equal(verdict.sensitivity, 'normal');
});

test('normalizeAtomKey and clipAtomText produce stable bounded text', () => {
  assert.equal(normalizeAtomKey('  Decision: Use SQLite.  '), 'decision: use sqlite');
  assert.ok(clipAtomText('x'.repeat(1000)).endsWith('...'));
});

test('redactMemoryText removes secret-like raw archive lines', () => {
  const redacted = redactMemoryText(
    ['Decision: keep memory local-first', 'API_KEY=sk-12345678901234567890abcdef'].join('\n')
  );

  assert.match(redacted, /Decision: keep memory local-first/);
  assert.doesNotMatch(redacted, /sk-123/);
  assert.match(redacted, /\[REDACTED\]/);
});
