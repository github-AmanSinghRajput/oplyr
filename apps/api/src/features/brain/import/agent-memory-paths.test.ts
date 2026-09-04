import { test } from 'node:test';
import assert from 'node:assert/strict';
import { discoverCuratedPaths } from './agent-memory-paths.js';

test('resolves global curated files for each agent under a home dir', () => {
  const sources = discoverCuratedPaths('/home/u');
  const globals = sources.filter((s) => s.scope === 'global').map((s) => s.path);
  assert.ok(globals.includes('/home/u/.claude/CLAUDE.md'));
  assert.ok(globals.includes('/home/u/.codex/AGENTS.md'));
  assert.ok(globals.includes('/home/u/.gemini/GEMINI.md'));
});

test('paths module is home-global only (project sources come from the scanner)', () => {
  const sources = discoverCuratedPaths('/home/u');
  assert.ok(sources.every((s) => s.scope === 'global'));
});
