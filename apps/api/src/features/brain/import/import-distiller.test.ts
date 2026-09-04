import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distillMemoryFile } from './import-distiller.js';
import { getDefaultBrainSettings } from '../brain-settings.repository.js';
import type { WorkspaceState } from '../../../types.js';

const settings = { ...getDefaultBrainSettings(), allowSensitiveCapture: false };
const ws = { id: null, projectRoot: null } as unknown as WorkspaceState;

test('distills a global memory file into safe, imported-provenance atoms', async () => {
  const complete = async () =>
    JSON.stringify({
      atoms: [
        {
          type: 'preference',
          text: 'User prefers tabs over spaces.',
          scope: 'global',
          confidence: 0.9,
          sensitivity: 'normal',
          entities: ['formatting']
        },
        {
          type: 'fact',
          text: 'API key is sk-test-1234567890abcdef.',
          scope: 'global',
          confidence: 0.9,
          sensitivity: 'sensitive',
          entities: []
        }
      ]
    });
  const atoms = await distillMemoryFile(
    {
      providerId: 'claude',
      fileText: '- tabs over spaces',
      scope: 'global',
      projectKey: null,
      projectName: null,
      workspace: ws
    },
    settings,
    complete
  );
  assert.equal(atoms.length, 1); // sensitive dropped
  assert.equal(atoms[0]!.input.scope, 'global');
  assert.equal(atoms[0]!.input.provenance.source, 'imported');
  assert.equal(atoms[0]!.input.provenance.providerId, 'claude');
  assert.ok(atoms[0]!.input.confidence >= 0.7);
});

test('falls back to structural parse when the agent throws', async () => {
  const complete = async () => {
    throw new Error('offline');
  };
  const atoms = await distillMemoryFile(
    {
      providerId: 'claude',
      fileText: '# Conventions\n- Always run tests before commit',
      scope: 'global',
      projectKey: null,
      projectName: null,
      workspace: ws
    },
    settings,
    complete
  );
  assert.ok(atoms.length >= 1);
  assert.equal(atoms[0]!.input.provenance.source, 'imported');
});
