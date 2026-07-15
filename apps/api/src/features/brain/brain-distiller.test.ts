import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildDistillPrompt,
  distillTurn,
  parseDistilledTurn,
  shouldDistillTurn
} from './brain-distiller.js';
import { getDefaultBrainSettings } from './brain-settings.repository.js';
import type { BrainCaptureTurnInput, BrainSettings } from './brain.types.js';

function turn(userText: string, assistantText: string): BrainCaptureTurnInput {
  return {
    providerId: 'claude',
    workspace: {
      id: 'proj-1',
      projectRoot: '/tmp/proj-1',
      projectName: 'proj-1',
      isGitRepo: true,
      writeAccessEnabled: false,
      secretPolicy: []
    },
    sessionId: 'sess-1',
    userMessage: { id: 'u1', role: 'user', text: userText, createdAt: '', source: 'text' },
    assistantMessage: {
      id: 'a1',
      role: 'assistant',
      text: assistantText,
      createdAt: '',
      source: 'text'
    }
  };
}

const settings: BrainSettings = getDefaultBrainSettings();

test('shouldDistillTurn skips trivial acknowledgement turns', () => {
  assert.equal(shouldDistillTurn(turn('thanks', 'you are welcome')), false);
  assert.equal(shouldDistillTurn(turn('ok', 'ok')), false);
});

test('shouldDistillTurn accepts substantive turns', () => {
  assert.equal(
    shouldDistillTurn(
      turn(
        'We decided to use JWT for auth going forward.',
        'Understood, I will migrate the auth middleware to JWT verification.'
      )
    ),
    true
  );
});

test('buildDistillPrompt embeds both sides of the turn and demands JSON', () => {
  const prompt = buildDistillPrompt(turn('use postgres', 'we will use postgres for storage'));
  assert.match(prompt, /use postgres/);
  assert.match(prompt, /we will use postgres for storage/);
  assert.match(prompt, /"atoms"/);
});

test('parseDistilledTurn tolerates markdown fences and surrounding prose', () => {
  const raw =
    'Here you go:\n```json\n{"atoms":[{"type":"decision","text":"The team uses JWT for auth","scope":"project","confidence":0.9,"sensitivity":"normal","entities":["auth"]}]}\n```';
  const { atoms } = parseDistilledTurn(raw);
  assert.equal(atoms.length, 1);
  assert.equal(atoms[0]!.type, 'decision');
  assert.equal(atoms[0]!.entities[0], 'auth');
});

test('parseDistilledTurn drops malformed atoms and unknown types', () => {
  const raw =
    '{"atoms":[{"type":"nonsense","text":"x"},{"type":"fact","text":"The API runs on port 8787"}]}';
  const { atoms } = parseDistilledTurn(raw);
  assert.equal(atoms.length, 1);
  assert.equal(atoms[0]!.type, 'fact');
});

test('parseDistilledTurn returns empty on non-JSON', () => {
  assert.deepEqual(parseDistilledTurn('sorry, I could not do that').atoms, []);
});

test('distillTurn builds storable atoms from a mocked completion', async () => {
  const complete = async () =>
    '{"atoms":[{"type":"decision","text":"The team standardized on JWT auth for all services","scope":"project","confidence":0.9,"sensitivity":"normal","entities":["auth","jwt"]}]}';
  const prepared = await distillTurn(
    turn('lets standardize on jwt', 'We standardized on JWT auth for all services.'),
    settings,
    complete
  );
  assert.equal(prepared.length, 1);
  assert.equal(prepared[0]!.input.type, 'decision');
  assert.equal(prepared[0]!.input.scope, 'project');
  assert.equal(prepared[0]!.input.projectKey, 'proj-1');
  assert.ok(prepared[0]!.input.sourceHash.length > 0);
  assert.deepEqual(prepared[0]!.entities, ['auth', 'jwt']);
});

test('distillTurn captures global atoms without a project, dropping project-scoped ones', async () => {
  const noProject: BrainCaptureTurnInput = {
    ...turn(
      'I always prefer tabs over spaces everywhere I code.',
      'Understood — I will use tabs for indentation in everything.'
    ),
    workspace: {
      id: null,
      projectRoot: null,
      projectName: null,
      isGitRepo: false,
      writeAccessEnabled: false,
      secretPolicy: []
    }
  };
  const complete = async () =>
    '{"atoms":[{"type":"preference","text":"The user prefers tabs over spaces for indentation.","scope":"global","confidence":0.9,"sensitivity":"normal","entities":["formatting"]},{"type":"decision","text":"This repo uses JWT auth.","scope":"project","confidence":0.8,"sensitivity":"normal","entities":["auth"]}]}';
  const prepared = await distillTurn(noProject, settings, complete);
  assert.equal(prepared.length, 1, 'only the global atom survives without a project');
  assert.equal(prepared[0]!.input.scope, 'global');
  assert.equal(prepared[0]!.input.projectKey, null);
});

test('distillTurn drops secret-bearing atoms unless sensitive capture is enabled', async () => {
  const complete = async () =>
    '{"atoms":[{"type":"fact","text":"The api_key = sk-abcdefghijklmnopqrstuvwxyz123456","scope":"project","confidence":0.9,"sensitivity":"normal","entities":[]}]}';
  const prepared = await distillTurn(
    turn('remember this token', 'stored the api key value for you'),
    settings,
    complete
  );
  assert.equal(prepared.length, 0);
});

test('distillTurn dedupes identical normalized atoms within a turn', async () => {
  // Same meaning, different punctuation/casing → one atom. (Text is >= the 18-char safety floor.)
  const complete = async () =>
    '{"atoms":[{"type":"decision","text":"We use JWT auth across all services","scope":"project","confidence":0.8,"sensitivity":"normal","entities":[]},{"type":"decision","text":"we use jwt auth across all services.","scope":"project","confidence":0.7,"sensitivity":"normal","entities":[]}]}';
  const prepared = await distillTurn(
    turn(
      'which auth approach did we land on?',
      'We use JWT auth across all services now, confirmed.'
    ),
    settings,
    complete
  );
  assert.equal(prepared.length, 1);
});

test('distillTurn returns [] when the completion throws (best-effort capture)', async () => {
  const complete = async () => {
    throw new Error('rate limited');
  };
  const prepared = await distillTurn(
    turn('remember this decision', 'We decided to ship weekly releases.'),
    settings,
    complete
  );
  assert.deepEqual(prepared, []);
});
