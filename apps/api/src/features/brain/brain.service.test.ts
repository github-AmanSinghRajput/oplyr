import test from 'node:test';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { BrainService } from './brain.service.js';
import { NullEmbeddingProvider } from './brain-embedding.service.js';
import { getDefaultBrainSettings } from './brain-settings.repository.js';
import type {
  BrainAtomRecord,
  BrainAtomUpsert,
  BrainCompletionFn,
  BrainProjectSettings,
  BrainRecallCandidate,
  BrainSettings
} from './brain.types.js';
import type { ChatMessage, WorkspaceState } from '../../types.js';

interface RecallOptions {
  includeCrossProject: boolean;
  includeSensitive: boolean;
  embeddingModel: string;
}

class BrainRepositoryStub {
  atoms: BrainAtomRecord[] = [];
  recallProjectKey: string | null = null;
  recallOptions: RecallOptions | null = null;
  archivedSources: Array<{ compressedBlob: Buffer; metadata: Record<string, unknown> }> = [];

  async getStats() {
    return {
      totalAtoms: this.atoms.length,
      projectAtoms: this.atoms.length,
      globalAtoms: 0,
      deletedAtoms: 0
    };
  }

  async listRecentAtoms() {
    return this.atoms;
  }

  async listGraphAtoms() {
    return this.atoms;
  }

  async listRecallCandidates(
    projectKey: string,
    options: RecallOptions
  ): Promise<BrainRecallCandidate[]> {
    this.recallProjectKey = projectKey;
    this.recallOptions = options;
    return this.atoms.map((atom) => ({ atom, embedding: null }));
  }

  async upsertAtoms(atoms: BrainAtomUpsert[]): Promise<BrainAtomRecord[]> {
    this.atoms = atoms.map(({ contributor, entities, ...input }, index) => ({
      ...input,
      entities,
      contributors: [contributor],
      id: `atom-${index + 1}`,
      createdAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      deletedAt: null
    }));
    return this.atoms;
  }

  async upsertEmbedding() {
    /* no-op in tests */
  }

  async deleteAtom() {
    return true;
  }

  async archiveRawSource(input: { compressedBlob: Buffer; metadata: Record<string, unknown> }) {
    this.archivedSources.push(input);
  }

  async resetAll() {
    this.atoms = [];
    this.archivedSources = [];
  }
}

class BrainSettingsServiceStub {
  projectSettings: BrainProjectSettings = { isolate: false, captureEnabled: true };
  isolatedKeys: string[] = [];

  constructor(public settings: BrainSettings = getDefaultBrainSettings()) {}

  async getSettings() {
    return structuredClone(this.settings);
  }

  async updateSettings() {
    return structuredClone(this.settings);
  }

  async getProjectSettings() {
    return structuredClone(this.projectSettings);
  }

  async getIsolatedProjectKeys() {
    return this.isolatedKeys;
  }

  async updateProjectSettings() {
    return structuredClone(this.projectSettings);
  }
}

function workspace(): WorkspaceState {
  return {
    id: 'workspace-1',
    projectRoot: '/tmp/oplyr',
    projectName: 'oplyr',
    isGitRepo: true,
    writeAccessEnabled: true,
    secretPolicy: ['.env']
  };
}

function message(id: string, text: string): ChatMessage {
  return {
    id,
    role: id.startsWith('u') ? 'user' : 'assistant',
    text,
    source: 'text',
    createdAt: new Date().toISOString()
  };
}

/** A mock distiller completion returning one clean decision atom. */
function completionWith(atomText: string): BrainCompletionFn {
  return async () =>
    JSON.stringify({
      atoms: [
        {
          type: 'decision',
          text: atomText,
          scope: 'project',
          confidence: 0.9,
          sensitivity: 'normal',
          entities: ['brain']
        }
      ]
    });
}

function makeService(
  settings: BrainSettings,
  complete: BrainCompletionFn,
  repository = new BrainRepositoryStub(),
  settingsStub = new BrainSettingsServiceStub(settings)
) {
  const service = new BrainService(repository as never, settingsStub as never, {
    complete,
    embeddings: new NullEmbeddingProvider()
  });
  return { service, repository, settingsStub };
}

test('captureTurn skips when provider write permission is disabled', async () => {
  const settings = getDefaultBrainSettings();
  settings.agentWritePermissions.codex.writeEnabled = false;
  const { service, repository } = makeService(
    settings,
    completionWith('Oplyr stores memory in a separate brain.db file')
  );

  const result = await service.captureTurn({
    providerId: 'codex',
    workspace: workspace(),
    sessionId: 'session-1',
    userMessage: message('u1', 'We decided to keep all memory local to the machine going forward.'),
    assistantMessage: message('a1', 'Understood, memory will stay on-device in a brain database.')
  });

  assert.equal(result.captured, false);
  assert.equal(result.reason, 'agent_write_disabled');
  assert.equal(repository.atoms.length, 0);
});

test('captureTurn distills and stores atoms with the asserting agent as contributor', async () => {
  const { service, repository } = makeService(
    getDefaultBrainSettings(),
    completionWith('Oplyr stores memory in a separate brain.db file')
  );

  const result = await service.captureTurn({
    providerId: 'claude',
    workspace: workspace(),
    sessionId: 'session-1',
    userMessage: message('u1', 'We decided to keep all memory local to the machine going forward.'),
    assistantMessage: message('a1', 'Understood, memory will stay on-device in a brain database.')
  });

  assert.equal(result.captured, true);
  assert.equal(repository.atoms.length, 1);
  assert.equal(repository.atoms[0]!.projectKey, 'workspace-1');
  assert.equal(repository.atoms[0]!.contributors[0]!.providerId, 'claude');
  assert.deepEqual(repository.atoms[0]!.entities, ['brain']);
});

test('captureTurn respects a per-project capture-disabled override', async () => {
  const { service, repository, settingsStub } = makeService(
    getDefaultBrainSettings(),
    completionWith('Oplyr stores memory in a separate brain.db file')
  );
  settingsStub.projectSettings = { isolate: false, captureEnabled: false };

  const result = await service.captureTurn({
    providerId: 'codex',
    workspace: workspace(),
    sessionId: 'session-1',
    userMessage: message('u1', 'We decided to keep all memory local to the machine going forward.'),
    assistantMessage: message('a1', 'Understood, memory will stay on-device in a brain database.')
  });

  assert.equal(result.captured, false);
  assert.equal(result.reason, 'project_capture_disabled');
  assert.equal(repository.atoms.length, 0);
});

test('recall enables cross-project by default and passes the active embedding model', async () => {
  const { service, repository } = makeService(getDefaultBrainSettings(), completionWith('x'));

  await service.recall({ providerId: 'codex', workspace: workspace(), query: 'brain memory' });

  assert.equal(repository.recallProjectKey, 'workspace-1');
  assert.deepEqual(repository.recallOptions, {
    includeCrossProject: true,
    includeSensitive: false,
    embeddingModel: 'none',
    projectRootKey: '/tmp/oplyr'
  });
});

test('recall disables cross-project when the current project is isolated', async () => {
  const { service, repository, settingsStub } = makeService(
    getDefaultBrainSettings(),
    completionWith('x')
  );
  settingsStub.projectSettings = { isolate: true, captureEnabled: true };

  await service.recall({ providerId: 'codex', workspace: workspace(), query: 'brain memory' });

  assert.equal(repository.recallOptions?.includeCrossProject, false);
});

test('recall includes sensitive atoms only under local_god injection', async () => {
  const settings = getDefaultBrainSettings();
  settings.mode = 'local_god';
  settings.allowSensitiveInjection = true;
  const { service, repository } = makeService(settings, completionWith('x'));

  await service.recall({ providerId: 'codex', workspace: workspace(), query: 'brain memory' });

  assert.equal(repository.recallOptions?.includeSensitive, true);
});

test('raw archive is redacted by default', async () => {
  const settings = getDefaultBrainSettings();
  settings.rawArchiveEnabled = true;
  const { service, repository } = makeService(
    settings,
    completionWith('Oplyr keeps memory local on the machine')
  );

  await service.captureTurn({
    providerId: 'codex',
    workspace: workspace(),
    sessionId: 'session-1',
    userMessage: message(
      'u1',
      'Keep memory local. API_KEY=sk-12345678901234567890abcdef please remember.'
    ),
    assistantMessage: message('a1', 'Understood, memory stays on-device in a brain database file.')
  });

  assert.equal(repository.archivedSources.length, 1);
  assert.equal(repository.archivedSources[0]!.metadata.redacted, true);
  assert.doesNotMatch(
    gunzipSync(repository.archivedSources[0]!.compressedBlob).toString('utf8'),
    /sk-123/
  );
});

test('raw archive is unredacted in local_god with sensitive capture', async () => {
  const settings = getDefaultBrainSettings();
  settings.mode = 'local_god';
  settings.rawArchiveEnabled = true;
  settings.allowSensitiveCapture = true;
  const { service, repository } = makeService(
    settings,
    completionWith('Oplyr keeps memory local on the machine')
  );

  await service.captureTurn({
    providerId: 'codex',
    workspace: workspace(),
    sessionId: 'session-1',
    userMessage: message(
      'u1',
      'Keep API_KEY=sk-12345678901234567890abcdef in local memory please and remember it.'
    ),
    assistantMessage: message('a1', 'Understood, memory stays on-device in a brain database file.')
  });

  assert.equal(repository.archivedSources.length, 1);
  assert.equal(repository.archivedSources[0]!.metadata.redacted, false);
  assert.match(
    gunzipSync(repository.archivedSources[0]!.compressedBlob).toString('utf8'),
    /sk-12345678901234567890abcdef/
  );
});

/** Repository holding N un-embedded atoms, draining as the backfill embeds them. */
class BackfillRepositoryStub {
  readonly embedded: string[] = [];
  private pending: Array<{ id: string; text: string }>;

  constructor(count: number) {
    this.pending = Array.from({ length: count }, (_, i) => ({
      id: `atom-${i}`,
      text: `memory ${i}`
    }));
  }

  async listAtomsMissingEmbedding(_model: string, limit: number) {
    return this.pending.slice(0, limit);
  }

  async upsertEmbedding(atomId: string) {
    this.embedded.push(atomId);
    this.pending = this.pending.filter((atom) => atom.id !== atomId);
  }
}

/** Embedding provider that always succeeds, so the backfill's own loop is what's under test. */
const workingEmbeddings = {
  model: 'test-model',
  available: true,
  unavailableReason: null,
  embed: async (texts: string[]) => texts.map(() => new Float32Array([1, 0, 0]))
};

function makeBackfillService(repository: BackfillRepositoryStub, embeddings: unknown) {
  return new BrainService(
    repository as never,
    new BrainSettingsServiceStub(getDefaultBrainSettings()) as never,
    { complete: async () => '', embeddings: embeddings as never }
  );
}

test('backfillEmbeddings re-embeds every memory left without a vector', async () => {
  // 70 atoms across a batch size of 32 — it must page rather than stop after the first round.
  const repository = new BackfillRepositoryStub(70);
  const service = makeBackfillService(repository, workingEmbeddings);

  const result = await service.backfillEmbeddings();

  assert.equal(result.embedded, 70);
  assert.equal(repository.embedded.length, 70);
  assert.equal(new Set(repository.embedded).size, 70, 'no atom embedded twice');
});

test('backfillEmbeddings does nothing when embeddings are known unavailable', async () => {
  const repository = new BackfillRepositoryStub(10);
  const service = makeBackfillService(repository, {
    model: 'test-model',
    available: false,
    unavailableReason: "Cannot find package 'onnxruntime-node'",
    embed: async () => {
      throw new Error('embeddings should not be called');
    }
  });

  assert.deepEqual(await service.backfillEmbeddings(), { embedded: 0 });
  assert.equal(repository.embedded.length, 0);
});

test('backfillEmbeddings stops instead of spinning when embedding fails mid-run', async () => {
  const repository = new BackfillRepositoryStub(70);
  let call = 0;
  const service = makeBackfillService(repository, {
    model: 'test-model',
    available: true,
    unavailableReason: null,
    // Succeeds once, then the runtime goes away — the loop must exit, not retry the same page.
    embed: async (texts: string[]) => {
      call += 1;
      if (call > 1) return null;
      return texts.map(() => new Float32Array([1, 0, 0]));
    }
  });

  const result = await service.backfillEmbeddings();

  assert.equal(result.embedded, 32, 'kept the page that worked');
  assert.equal(call, 2, 'stopped after the failing page rather than looping on it');
});
