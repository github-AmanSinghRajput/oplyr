import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { collectGitDiffSince, revertWorkingTree, snapshotWorkingTree } from './codex-client.js';

const execFileAsync = promisify(execFile);

async function git(projectRoot: string, args: string[]) {
  return execFileAsync('git', ['-C', projectRoot, ...args], {
    timeout: 20000,
    maxBuffer: 1024 * 1024
  });
}

async function createRepo() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'oplyr-codex-client-test-'));
  const projectRoot = await fs.realpath(tempRoot);
  await git(projectRoot, ['init', '-q']);
  await git(projectRoot, ['config', 'user.email', 'test@example.com']);
  await git(projectRoot, ['config', 'user.name', 'Oplyr Test']);
  await fs.writeFile(path.join(projectRoot, 'tracked.txt'), 'base\n');
  await git(projectRoot, ['add', 'tracked.txt']);
  await git(projectRoot, ['commit', '-q', '-m', 'init']);
  return projectRoot;
}

test('collectGitDiffSince includes AI edits to pre-existing untracked files', async () => {
  const projectRoot = await createRepo();
  try {
    await fs.appendFile(path.join(projectRoot, 'tracked.txt'), 'user tracked change\n');
    await fs.writeFile(path.join(projectRoot, 'note.txt'), 'user untracked note\n');

    const baseline = await snapshotWorkingTree(projectRoot);

    await fs.appendFile(path.join(projectRoot, 'tracked.txt'), 'ai tracked change\n');
    await fs.appendFile(path.join(projectRoot, 'note.txt'), 'ai untracked change\n');
    await fs.writeFile(path.join(projectRoot, 'ai-new.txt'), 'ai new file\n');

    const diff = await collectGitDiffSince(
      projectRoot,
      baseline.ref,
      baseline.untracked,
      baseline.untrackedSnapshots
    );

    assert.deepEqual(diff.changedFiles.sort(), ['ai-new.txt', 'note.txt', 'tracked.txt']);

    const tracked = diff.files.find((file) => file.filePath === 'tracked.txt');
    assert.equal(tracked?.status, 'modified');
    assert.match(tracked?.diff ?? '', /\+ai tracked change/);
    assert.doesNotMatch(tracked?.diff ?? '', /\+user tracked change/);

    const note = diff.files.find((file) => file.filePath === 'note.txt');
    assert.equal(note?.status, 'modified');
    assert.match(note?.diff ?? '', /\+ai untracked change/);
    assert.doesNotMatch(note?.diff ?? '', /\+user untracked note/);

    const added = diff.files.find((file) => file.filePath === 'ai-new.txt');
    assert.equal(added?.status, 'added');

    await revertWorkingTree(
      projectRoot,
      baseline.ref,
      diff.files.map((file) => ({ filePath: file.filePath, status: file.status })),
      baseline.untrackedSnapshots
    );

    assert.equal(
      await fs.readFile(path.join(projectRoot, 'tracked.txt'), 'utf8'),
      'base\nuser tracked change\n'
    );
    assert.equal(
      await fs.readFile(path.join(projectRoot, 'note.txt'), 'utf8'),
      'user untracked note\n'
    );
    await assert.rejects(() => fs.stat(path.join(projectRoot, 'ai-new.txt')));
  } finally {
    await fs.rm(projectRoot, { force: true, recursive: true });
  }
});

test('collectGitDiffSince includes deleted pre-existing untracked files', async () => {
  const projectRoot = await createRepo();
  try {
    await fs.writeFile(path.join(projectRoot, 'note.txt'), 'user untracked note\n');

    const baseline = await snapshotWorkingTree(projectRoot);
    await fs.rm(path.join(projectRoot, 'note.txt'));

    const diff = await collectGitDiffSince(
      projectRoot,
      baseline.ref,
      baseline.untracked,
      baseline.untrackedSnapshots
    );

    assert.deepEqual(diff.changedFiles, ['note.txt']);
    assert.equal(diff.files[0]?.status, 'deleted');
    assert.match(diff.files[0]?.diff ?? '', /-user untracked note/);

    await revertWorkingTree(
      projectRoot,
      baseline.ref,
      diff.files.map((file) => ({ filePath: file.filePath, status: file.status })),
      baseline.untrackedSnapshots
    );

    assert.equal(
      await fs.readFile(path.join(projectRoot, 'note.txt'), 'utf8'),
      'user untracked note\n'
    );
  } finally {
    await fs.rm(projectRoot, { force: true, recursive: true });
  }
});
