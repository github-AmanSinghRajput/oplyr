import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BrainService } from './brain.service.js';
import { BrainRepository } from './brain.repository.js';
import { BrainSettingsService } from './brain-settings.service.js';
import type { BrainAtomUpsert } from './brain.types.js';
import type { WorkspaceState } from '../../types.js';

test('runImportFiles distills selected files and upserts imported atoms, idempotently', async () => {
  const stored: BrainAtomUpsert[] = [];
  const fakeRepo = {
    getStats: async () => ({ totalAtoms: 0, projectAtoms: 0, globalAtoms: 0, deletedAtoms: 0 }),
    upsertAtoms: async (atoms: BrainAtomUpsert[]) => {
      for (const a of atoms) if (!stored.some((s) => s.sourceHash === a.sourceHash)) stored.push(a);
      return atoms.map((a) => ({
        ...a,
        id: `id-${a.sourceHash.slice(0, 6)}`,
        createdAt: '',
        lastSeenAt: '',
        deletedAt: null,
        contributors: [a.contributor]
      }));
    },
    upsertEmbedding: async () => {}
  };
  const fakeSettings = {
    getSettings: async () => ({ enabled: true, allowSensitiveCapture: false })
  };
  const complete = async () =>
    JSON.stringify({
      atoms: [
        {
          type: 'preference',
          text: 'Prefers pnpm for package management.',
          scope: 'global',
          confidence: 0.9,
          sensitivity: 'normal',
          entities: []
        }
      ]
    });
  const service = new BrainService(
    fakeRepo as unknown as BrainRepository,
    fakeSettings as unknown as BrainSettingsService,
    {
      complete,
      embeddings: { model: 'test', embed: async () => null }
    }
  );

  const ws = { id: null, projectRoot: null } as unknown as WorkspaceState;
  const files = [
    {
      providerId: 'claude' as const,
      fileText: '- prefers pnpm',
      scope: 'global' as const,
      projectKey: null,
      projectName: null
    }
  ];

  const res1 = await service.runImportFiles(files, ws);
  assert.equal(res1.atomsAdded, 1);
  const res2 = await service.runImportFiles(files, ws);
  assert.equal(stored.length, 1); // idempotent — dedup by sourceHash
  assert.equal(res2.atomsAdded, 1);
});
