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

// ── Dedup key ─────────────────────────────────────────────────────────────────────────────────
// `source_hash` is built from normalizeAtomKey, so this function decides what counts as the same
// memory. Distillation is LLM-driven and rewords the same fact between runs, so the key has to
// survive that — without ever collapsing two DIFFERENT facts, which loses information irreversibly.

test('normalizeAtomKey collapses the attribution distillation swaps between runs', () => {
  const same = (a: string, b: string) =>
    assert.equal(normalizeAtomKey(a), normalizeAtomKey(b), `${a} !== ${b}`);

  same('We standardized on JWT auth', 'The team standardized on JWT auth');
  same('The project uses Tailwind v4', 'Project uses Tailwind v4');
  same('The API listens on port 8787', 'API listens on port 8787');
  same('Use JWT for auth.', 'Use JWT for auth');
  same('This is the accent color', 'Is the accent color');
});

test('normalizeAtomKey strips determiners without eating the noun after them', () => {
  // A previous version matched "the project" as one phrase and deleted a meaningful noun, so
  // "The project uses X" and "Project uses X" ended up with different keys.
  assert.equal(normalizeAtomKey('The project uses Vite'), 'project uses vite');
  assert.equal(normalizeAtomKey('The team uses Vite'), 'uses vite');
});

test('normalizeAtomKey keeps facts that differ only in their specifics apart', () => {
  const different = (a: string, b: string) =>
    assert.notEqual(normalizeAtomKey(a), normalizeAtomKey(b), `${a} === ${b}`);

  // This set is why the dedup key is lexical rather than semantic. On the bundled MiniLM these
  // score 0.53–0.95 cosine — the first pair scores 0.953, HIGHER than genuine paraphrases at
  // 0.847 — so no similarity threshold can separate them. A negation merged into its opposite
  // destroys the correct memory; a duplicate is merely untidy.
  different('Auto-send is off by default', 'Auto-send is on by default');
  different('The API listens on port 8787', 'The API listens on port 5173');
  different('Room turns are reply-only', 'Room turns can propose writes');
  different('Codex uses the workspace-write sandbox', 'Claude uses the workspace-write sandbox');
  different('Use the plum accent in light mode', 'Use the orchid accent in dark mode');
  different('The team owns deploys', 'The project owns deploys');
});

test('normalizeAtomKey never reduces a key to nothing', () => {
  for (const filler of ['the', 'we', 'The team', 'it', 'This']) {
    assert.ok(normalizeAtomKey(filler).length > 0, `"${filler}" collapsed to empty`);
  }
});
