import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBrainRecallBundle,
  searchCandidates,
  type BrainRecallContext
} from './brain-recall.js';
import { getDefaultBrainSettings } from './brain-settings.repository.js';
import type { BrainRecallCandidate } from './brain.types.js';

function candidate(
  id: string,
  text: string,
  projectKey: string | null,
  extras: { entities?: string[]; providerId?: 'codex' | 'claude' | 'gemini' } = {}
): BrainRecallCandidate {
  return {
    atom: {
      id,
      type: 'decision',
      text,
      normalizedText: text.toLowerCase(),
      scope: projectKey ? 'project' : 'global',
      projectKey,
      sourceHash: id,
      sensitivity: 'normal',
      confidence: 0.9,
      salience: 0.9,
      provenance: {
        source: 'chat_turn',
        providerId: extras.providerId ?? 'codex',
        sessionId: 'session-1',
        userMessageId: 'u1',
        assistantMessageId: 'a1',
        projectRoot: '/tmp/oplyr',
        capturedAt: new Date().toISOString()
      },
      entities: extras.entities ?? [],
      contributors: [
        {
          providerId: extras.providerId ?? 'codex',
          sessionId: 'session-1',
          lastAssertedAt: new Date().toISOString()
        }
      ],
      createdAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      deletedAt: null
    },
    // No embedding in these unit tests → recall uses deterministic keyword overlap.
    embedding: null
  };
}

function context(overrides: Partial<BrainRecallContext> = {}): BrainRecallContext {
  return {
    currentProjectKey: 'workspace-1',
    queryEmbedding: null,
    isolatedProjectKeys: new Set(),
    currentProjectIsolated: false,
    ...overrides
  };
}

test('recall treats an atom keyed by the current projectRoot as current-project (imported memory)', () => {
  const settings = { ...getDefaultBrainSettings(), maxRecallAtoms: 3, maxRecallCharacters: 500 };
  // Imported project memory is keyed by the absolute project root, not the synthetic workspace id.
  const imported = candidate(
    'imp1',
    'The billing retry keeps an idempotency key on every attempt.',
    '/tmp/oplyr'
  );
  const query = 'billing retry idempotency key';

  // Without the root fallback, an isolated project excludes any atom not keyed by the workspace id.
  const excluded = buildBrainRecallBundle(
    query,
    [imported],
    settings,
    context({ currentProjectIsolated: true })
  );
  assert.equal(excluded.injected, false);

  // With the root fallback, the same atom is current-project → it surfaces and is NOT cross-project.
  const included = buildBrainRecallBundle(
    query,
    [imported],
    settings,
    context({ currentProjectIsolated: true, currentProjectRootKey: '/tmp/oplyr' })
  );
  assert.equal(included.injected, true);
  assert.equal(included.atoms.length, 1);
  assert.equal(included.atoms[0]!.crossProject, false);
});

test('buildBrainRecallBundle returns relevant bounded memory text (keyword fallback)', () => {
  const settings = { ...getDefaultBrainSettings(), maxRecallAtoms: 1, maxRecallCharacters: 500 };
  const bundle = buildBrainRecallBundle(
    'How should we store brain memory in sqlite?',
    [
      candidate(
        'a1',
        'Decision: use a separate brain.db SQLite file for Oplyr memory',
        'workspace-1'
      ),
      candidate('a2', 'Decision: website cards should avoid generic layouts', 'workspace-1')
    ],
    settings,
    context()
  );

  assert.equal(bundle.injected, true);
  assert.equal(bundle.atoms.length, 1);
  assert.match(bundle.text, /separate brain\.db SQLite/i);
  assert.match(bundle.text, /this project/);
});

test('buildBrainRecallBundle respects character caps', () => {
  const settings = { ...getDefaultBrainSettings(), maxRecallAtoms: 5, maxRecallCharacters: 190 };
  const bundle = buildBrainRecallBundle(
    'brain sqlite memory',
    [
      candidate(
        'a1',
        'Decision: use a separate brain.db SQLite file for Oplyr memory',
        'workspace-1'
      )
    ],
    settings,
    context()
  );
  assert.ok(bundle.text.length <= settings.maxRecallCharacters);
});

test('buildBrainRecallBundle reports no_relevant_atoms when nothing matches', () => {
  const bundle = buildBrainRecallBundle(
    'music recommendations',
    [candidate('a1', 'Decision: use SQLite for memory storage', 'workspace-1')],
    getDefaultBrainSettings(),
    context()
  );
  assert.equal(bundle.injected, false);
  assert.equal(bundle.reason, 'no_relevant_atoms');
});

test('cross-project atoms are labeled with their source project', () => {
  const bundle = buildBrainRecallBundle(
    'brain memory sqlite',
    [candidate('a1', 'brain memory is stored in a sqlite database file', 'workspace-2')],
    getDefaultBrainSettings(),
    context()
  );
  assert.equal(bundle.injected, true);
  assert.equal(bundle.atoms[0]!.crossProject, true);
  assert.match(bundle.text, /from project: workspace-2/);
});

test('an isolated current project never pulls in other projects', () => {
  const bundle = buildBrainRecallBundle(
    'brain memory sqlite',
    [candidate('a1', 'brain memory is stored in a sqlite database file', 'workspace-2')],
    getDefaultBrainSettings(),
    context({ currentProjectIsolated: true })
  );
  assert.equal(bundle.injected, false);
});

test('cross-project recall skips projects the user marked isolated', () => {
  const bundle = buildBrainRecallBundle(
    'brain memory sqlite',
    [candidate('a1', 'brain memory is stored in a sqlite database file', 'workspace-2')],
    getDefaultBrainSettings(),
    context({ isolatedProjectKeys: new Set(['workspace-2']) })
  );
  assert.equal(bundle.injected, false);
});

// A cross-project atom with only modest relevance (0.25) clears the same-project bar (0.22) but not
// the strict cross-project bar (0.45) — so by default it stays hidden.
test('cross-project memory below the strict bar stays hidden by default', () => {
  const bundle = buildBrainRecallBundle(
    'ragfuse retrieval strategy',
    [candidate('a1', 'ragfuse indexes documents with embeddings', 'workspace-2')],
    getDefaultBrainSettings(),
    context()
  );
  assert.equal(bundle.injected, false);
});

test('explicit recall surfaces cross-project memory at the low bar', () => {
  const bundle = buildBrainRecallBundle(
    'ragfuse retrieval strategy',
    [candidate('a1', 'ragfuse indexes documents with embeddings', 'workspace-2')],
    getDefaultBrainSettings(),
    context({ explicitRecall: true })
  );
  assert.equal(bundle.injected, true);
  assert.equal(bundle.atoms[0]!.crossProject, true);
});

test('naming a past project surfaces its cross-project memory', () => {
  const bundle = buildBrainRecallBundle(
    'ragfuse retrieval strategy',
    [candidate('a1', 'ragfuse indexes documents with embeddings', 'workspace-2')],
    getDefaultBrainSettings(),
    context({ namedProjectKeys: new Set(['workspace-2']) })
  );
  assert.equal(bundle.injected, true);
  assert.equal(bundle.atoms[0]!.crossProject, true);
});

test('recall text surfaces multiple contributing agents', () => {
  const item = candidate(
    'a1',
    'Decision: the team standardized on JWT auth everywhere',
    'workspace-1'
  );
  item.atom.contributors = [
    { providerId: 'claude', sessionId: 's1', lastAssertedAt: new Date().toISOString() },
    { providerId: 'codex', sessionId: 's2', lastAssertedAt: new Date().toISOString() }
  ];
  const bundle = buildBrainRecallBundle(
    'what auth did the team standardize on',
    [item],
    getDefaultBrainSettings(),
    context()
  );
  assert.match(bundle.text, /claude\+codex/);
});

test('searchCandidates ranks by relevance without injection thresholds', () => {
  const results = searchCandidates(
    'sqlite memory',
    [
      candidate('a1', 'brain memory lives in a sqlite database', 'workspace-1'),
      candidate('a2', 'the footer uses a horizontal layout', 'workspace-1')
    ],
    null,
    'workspace-1',
    10
  );
  assert.equal(results[0]!.id, 'a1');
});
