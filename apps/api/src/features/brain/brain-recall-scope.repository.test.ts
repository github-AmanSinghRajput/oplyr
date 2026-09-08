import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// The brain singleton resolves its file from the user-data dir, so point that at a temp dir BEFORE
// importing anything that touches it.
process.env.OPLYR_USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'oplyr-scope-'));

const { BrainRepository } = await import('./brain.repository.js');
const repo = new BrainRepository();

const MONOREPO = '/Users/dev/ArnieMonoRepo';
const SUB_A = '/Users/dev/ArnieMonoRepo/rms-frontend';
const SUB_B = '/Users/dev/ArnieMonoRepo/arnie-backend-rms';
const SIBLING = '/Users/dev/ArnieMonoRepoOther'; // shares a prefix but is NOT nested
const UNDERSCORE = '/Users/dev/my_repo';
const UNDERSCORE_DECOY = '/Users/dev/myXrepo/pkg';

function atom(projectKey: string) {
  return {
    type: 'fact' as const,
    text: `memory for ${projectKey}`,
    normalizedText: `memory for ${projectKey}`,
    scope: 'project' as const,
    projectKey,
    sourceHash: `hash-${projectKey}`,
    sensitivity: 'normal' as const,
    confidence: 0.9,
    salience: 0.5,
    provenance: {
      source: 'imported' as const,
      providerId: 'codex' as const,
      sessionId: null,
      userMessageId: null,
      assistantMessageId: null,
      projectRoot: projectKey,
      capturedAt: new Date().toISOString()
    },
    entities: [],
    contributor: {
      providerId: 'codex' as const,
      firstSeenAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString()
    }
  };
}

async function keysRecalledFor(projectKey: string): Promise<string[]> {
  const candidates = await repo.listRecallCandidates(projectKey, {
    embeddingModel: 'test-model',
    includeCrossProject: false,
    includeSensitive: false
  });
  return [...new Set(candidates.map((c) => c.atom.projectKey!))].sort();
}

test('recall from a monorepo root includes its sub-repos, and nothing beside them', async () => {
  await repo.upsertAtoms(
    [MONOREPO, SUB_A, SUB_B, SIBLING, UNDERSCORE, UNDERSCORE_DECOY].map(atom) as never
  );

  // The reported bug: agents record sessions against whatever directory they were launched from,
  // so connecting the monorepo root recalled none of the memories filed under its packages.
  assert.deepEqual(await keysRecalledFor(MONOREPO), [SUB_B, SUB_A, MONOREPO].sort());

  // A path that merely shares a prefix is a different project and must stay out.
  assert.deepEqual(await keysRecalledFor(SIBLING), [SIBLING]);

  // Scoping never widens upward: a sub-repo must not pull in the whole monorepo.
  assert.deepEqual(await keysRecalledFor(SUB_A), [SUB_A]);

  // `_` is a LIKE wildcard, so an unescaped pattern would match `myXrepo` too.
  assert.deepEqual(await keysRecalledFor(UNDERSCORE), [UNDERSCORE]);
});
