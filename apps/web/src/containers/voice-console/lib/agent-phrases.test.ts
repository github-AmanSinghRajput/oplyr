import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AGENT_FALLBACK_PHRASES, getFallbackPhrase } from './agent-phrases';

test('getFallbackPhrase returns the phrase at the tick position', () => {
  assert.equal(getFallbackPhrase(0), AGENT_FALLBACK_PHRASES[0]);
  assert.equal(getFallbackPhrase(1), AGENT_FALLBACK_PHRASES[1]);
});

test('getFallbackPhrase wraps around past the end of the list', () => {
  const count = AGENT_FALLBACK_PHRASES.length;
  assert.equal(getFallbackPhrase(count), AGENT_FALLBACK_PHRASES[0]);
  assert.equal(getFallbackPhrase(count + 2), AGENT_FALLBACK_PHRASES[2]);
});

test('getFallbackPhrase handles negative ticks without throwing', () => {
  const value = getFallbackPhrase(-1);
  assert.ok(AGENT_FALLBACK_PHRASES.includes(value));
});

test('every fallback phrase is a non-empty string', () => {
  for (const phrase of AGENT_FALLBACK_PHRASES) {
    assert.equal(typeof phrase, 'string');
    assert.ok(phrase.trim().length > 0);
  }
});
