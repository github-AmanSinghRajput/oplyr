import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scanAgentMemory } from './import-scanner.js';

async function fixtureHome(): Promise<{ home: string }> {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'oplyr-import-'));
  const repoA = path.join(home, 'work', 'repoA'); // Claude history; CLAUDE.md + AGENTS.md + a Claude session
  const repoB = path.join(home, 'work', 'repoB'); // Codex-ONLY; AGENTS.md + a Codex session
  await fs.mkdir(repoA, { recursive: true });
  await fs.mkdir(repoB, { recursive: true });
  await fs.mkdir(path.join(home, '.claude'), { recursive: true });

  await fs.writeFile(path.join(home, '.claude', 'CLAUDE.md'), '# global\n- tabs');
  await fs.writeFile(path.join(repoA, 'CLAUDE.md'), '# repoA\n- uses zod');
  await fs.writeFile(path.join(repoA, 'AGENTS.md'), '# repoA agents\n- run tests');
  await fs.writeFile(path.join(repoB, 'AGENTS.md'), '# repoB agents\n- codex only');
  await fs.writeFile(
    path.join(home, '.claude.json'),
    JSON.stringify({ projects: { [repoA]: {} } })
  );

  // A Claude session transcript for repoA (dir = cwd with '/'→'-').
  const claudeSessDir = path.join(home, '.claude', 'projects', repoA.replace(/\//g, '-'));
  await fs.mkdir(claudeSessDir, { recursive: true });
  await fs.writeFile(
    path.join(claudeSessDir, 'sess-1.jsonl'),
    `${JSON.stringify({ type: 'user', message: { role: 'user', content: 'hi' } })}\n` +
      `${JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: 'x'.repeat(3000) } })}\n`
  );

  // A Codex session whose session_meta records repoB as the cwd (repoB is unknown to Claude).
  const codexSessDir = path.join(home, '.codex', 'sessions', '2026', '01', '01');
  await fs.mkdir(codexSessDir, { recursive: true });
  await fs.writeFile(
    path.join(codexSessDir, 'rollout-1.jsonl'),
    `${JSON.stringify({ type: 'session_meta', payload: { cwd: repoB } })}\n` +
      `${JSON.stringify({ type: 'event_msg', payload: { type: 'user_message', message: 'go' } })}\n` +
      `${JSON.stringify({ type: 'event_msg', payload: { type: 'agent_message', message: 'y'.repeat(3000) } })}\n`
  );

  return { home };
}

test('scans connected agents: curated files + newest session, across both histories', async () => {
  const { home } = await fixtureHome();
  const manifest = await scanAgentMemory({
    homeDir: home,
    connected: { claude: true, codex: true, gemini: false }
  });

  const claude = manifest.agents.find((a) => a.providerId === 'claude');
  assert.ok(claude);
  assert.equal(claude!.global?.kind, 'global');
  assert.deepEqual(claude!.projects.map((p) => p.projectName).sort(), ['repoA']);
  // Claude session discovered for repoA via its projects/<slug> dir.
  assert.deepEqual(claude!.sessions.map((s) => s.projectName).sort(), ['repoA']);
  assert.equal(claude!.sessions[0]!.kind, 'session');

  const codex = manifest.agents.find((a) => a.providerId === 'codex');
  assert.ok(codex);
  assert.equal(codex!.global, null);
  assert.deepEqual(codex!.projects.map((p) => p.projectName).sort(), ['repoA', 'repoB']);
  // Codex session discovered for repoB via the rollout cwd.
  assert.deepEqual(codex!.sessions.map((s) => s.projectName).sort(), ['repoB']);

  assert.equal(
    manifest.agents.find((a) => a.providerId === 'gemini'),
    undefined
  );
});

test('a connected agent with no files or sessions anywhere is omitted', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'oplyr-import-empty-'));
  const manifest = await scanAgentMemory({
    homeDir: home,
    connected: { claude: true, codex: true, gemini: true }
  });
  assert.equal(manifest.agents.length, 0);
  assert.equal(manifest.totalFiles, 0);
});
