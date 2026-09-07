import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distillMemoryFile, distillSession } from './import-distiller.js';
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

/** One atom of the given text, as the agent would return it. */
function atomPayload(text: string): string {
  return JSON.stringify({
    atoms: [
      {
        type: 'fact',
        text,
        scope: 'project',
        confidence: 0.9,
        sensitivity: 'normal',
        entities: []
      }
    ]
  });
}

test('distillSession distills every chunk and dedupes what they repeat', async () => {
  const prompts: string[] = [];
  // The same fact restated in all three chunks, plus one fact unique to the last.
  const replies = [
    atomPayload('The retry budget is three attempts.'),
    atomPayload('The retry budget is three attempts.'),
    JSON.stringify({
      atoms: [
        {
          type: 'fact',
          text: 'The retry budget is three attempts.',
          scope: 'project',
          confidence: 0.9,
          sensitivity: 'normal',
          entities: []
        },
        {
          type: 'fact',
          text: 'Billing tests were left failing.',
          scope: 'project',
          confidence: 0.9,
          sensitivity: 'normal',
          entities: []
        }
      ]
    })
  ];
  const complete = async (req: { prompt: string }) => {
    prompts.push(req.prompt);
    return replies[prompts.length - 1]!;
  };

  const atoms = await distillSession(
    {
      providerId: 'claude',
      sessionChunks: ['chunk one', 'chunk two', 'chunk three'],
      projectKey: '/repo',
      projectName: 'repo',
      workspace: ws
    },
    settings,
    complete as never
  );

  assert.equal(prompts.length, 3, 'one agent call per chunk');
  assert.equal(atoms.length, 2, 'the repeated fact collapses to one atom');
  // Only the last chunk may be described to the agent as the end of the session.
  assert.match(prompts[0]!, /part 1 of 3/);
  assert.match(prompts[2]!, /FINAL part \(3 of 3\)/);
});

test('distillSession keeps the chunks that answered when one call fails', async () => {
  let call = 0;
  const complete = async () => {
    call += 1;
    if (call === 1) throw new Error('rate limited');
    return atomPayload('Auth moved to the edge worker.');
  };

  const atoms = await distillSession(
    {
      providerId: 'claude',
      sessionChunks: ['chunk one', 'chunk two'],
      projectKey: '/repo',
      projectName: 'repo',
      workspace: ws
    },
    settings,
    complete as never
  );

  assert.equal(atoms.length, 1);
  assert.equal(atoms[0]!.input.provenance.source, 'imported');
});

test('distillSession returns nothing when no chunk yields an atom', async () => {
  const complete = async () => {
    throw new Error('offline');
  };

  const atoms = await distillSession(
    {
      providerId: 'claude',
      sessionChunks: ['chunk one'],
      projectKey: '/repo',
      projectName: 'repo',
      workspace: ws
    },
    settings,
    complete as never
  );

  // Unlike a curated doc, raw chat lines have no structural fallback worth storing.
  assert.deepEqual(atoms, []);
});
