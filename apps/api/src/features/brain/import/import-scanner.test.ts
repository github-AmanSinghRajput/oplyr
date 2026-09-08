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
  // Real Claude records carry the cwd they ran in, which is how sessions are attributed to a root
  // (the directory NAME is a lossy encoding of the path and cannot be reversed).
  await fs.writeFile(
    path.join(claudeSessDir, 'sess-1.jsonl'),
    `${JSON.stringify({ type: 'user', cwd: repoA, message: { role: 'user', content: 'hi' } })}\n` +
      `${JSON.stringify({ type: 'assistant', cwd: repoA, message: { role: 'assistant', content: 'x'.repeat(3000) } })}\n`
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

/** A Codex rollout with `cwd` in its session_meta, big enough to clear MIN_SESSION_BYTES. */
async function writeRollout(home: string, datePath: string, name: string, cwd: string) {
  const dir = path.join(home, '.codex', 'sessions', ...datePath.split('/'));
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, name);
  await fs.writeFile(
    file,
    `${JSON.stringify({ type: 'session_meta', payload: { cwd } })}\n` +
      `${JSON.stringify({ type: 'event_msg', payload: { type: 'user_message', message: 'go' } })}\n` +
      `${JSON.stringify({ type: 'event_msg', payload: { type: 'agent_message', message: 'z'.repeat(3000) } })}\n`
  );
  return file;
}

test('a RESUMED session wins on last-written time, not on its filename', async () => {
  // The reported bug. `codex resume` appends to the file the session STARTED in, so its name stays
  // old while its content is the newest work. Ranking by name picked a trivial session named one
  // minute later over the 883MB session that held the actual work.
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'oplyr-resume-'));
  const repo = path.join(home, 'monorepo');
  await fs.mkdir(repo, { recursive: true });

  const resumed = await writeRollout(
    home,
    '2026/08/10',
    'rollout-2026-08-10T20-49-14-a.jsonl',
    repo
  );
  const namedLater = await writeRollout(
    home,
    '2026/09/08',
    'rollout-2026-09-08T00-38-03-b.jsonl',
    repo
  );
  // The resumed session was written last, despite sorting first by name.
  await fs.utimes(namedLater, new Date('2026-09-08T00:38:00Z'), new Date('2026-09-08T00:38:00Z'));
  await fs.utimes(resumed, new Date('2026-09-08T00:39:00Z'), new Date('2026-09-08T00:39:00Z'));

  const manifest = await scanAgentMemory({
    homeDir: home,
    connected: { claude: false, codex: true, gemini: false }
  });

  const sessions = manifest.agents.find((a) => a.providerId === 'codex')!.sessions;
  const rank0 = sessions.find((f) => f.sessionRank === 0)!;
  assert.equal(rank0.path, resumed, 'the resumed session must rank first');
  assert.equal(sessions.find((f) => f.sessionRank === 1)?.path, namedLater);
});

test('several sessions per project root are offered, newest first', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'oplyr-many-'));
  const repo = path.join(home, 'repo');
  await fs.mkdir(repo, { recursive: true });

  // Five sessions for one root; the scanner keeps the three most recently written.
  const made: string[] = [];
  for (let i = 0; i < 5; i += 1) {
    const file = await writeRollout(
      home,
      '2026/07/01',
      `rollout-2026-07-01T00-0${i}-00-${i}.jsonl`,
      repo
    );
    const when = new Date(Date.UTC(2026, 6, 1 + i));
    await fs.utimes(file, when, when);
    made.push(file);
  }

  const manifest = await scanAgentMemory({
    homeDir: home,
    connected: { claude: false, codex: true, gemini: false }
  });

  const sessions = manifest.agents.find((a) => a.providerId === 'codex')!.sessions;
  assert.equal(sessions.length, 3, 'one session per root was too thin a slice of a repo');
  assert.deepEqual(
    sessions.map((f) => f.path),
    [made[4], made[3], made[2]],
    'newest first'
  );
  assert.deepEqual(
    sessions.map((f) => f.sessionRank),
    [0, 1, 2]
  );
  // The date is what tells two sessions for the same project apart in the picker.
  assert.ok(sessions.every((f) => typeof f.modifiedAt === 'string'));
});

test('Claude sessions are found for roots with spaces and underscores', async () => {
  // Claude's project directory name replaces EVERY non-alphanumeric character with '-', so a space,
  // an underscore and a slash all collapse to the same character. Rebuilding that name by replacing
  // only '/' silently found nothing for such roots. Measured on a real machine: 76 sessions across
  // three projects were invisible. The cwd inside the transcript is the source of truth.
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'oplyr-mangle-'));
  const roots = [
    path.join(home, 'Pricing Engine'), // space
    path.join(home, 'songs_suggestion'), // underscore
    path.join(home, 'plain') // neither
  ];

  for (const [i, root] of roots.entries()) {
    await fs.mkdir(root, { recursive: true });
    await fs.writeFile(path.join(root, 'CLAUDE.md'), '# notes');
    // Claude's own encoding, which is what is actually on disk.
    const dir = path.join(home, '.claude', 'projects', root.replace(/[^A-Za-z0-9]/g, '-'));
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, `sess-${i}.jsonl`),
      `${JSON.stringify({ type: 'user', cwd: root, message: { role: 'user', content: 'hi' } })}\n` +
        `${JSON.stringify({ type: 'assistant', cwd: root, message: { role: 'assistant', content: 'x'.repeat(3000) } })}\n`
    );
  }
  await fs.writeFile(path.join(home, '.claude.json'), JSON.stringify({ projects: {} }));

  const manifest = await scanAgentMemory({
    homeDir: home,
    connected: { claude: true, codex: false, gemini: false }
  });

  const claude = manifest.agents.find((a) => a.providerId === 'claude')!;
  assert.deepEqual(
    claude.sessions.map((f) => f.projectRoot).sort(),
    [...roots].sort(),
    'a space or an underscore in the path must not hide a project'
  );
  // Discovery no longer depends on the project being declared in .claude.json either.
  assert.deepEqual(claude.projects.map((f) => f.projectRoot).sort(), [...roots].sort());
});
