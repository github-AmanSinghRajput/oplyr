import crypto from 'node:crypto';
import { gzipSync } from 'node:zlib';
import type { WorkspaceState } from '../../types.js';
import { generateAssistantReply } from '../../assistant-client.js';
import { logger } from '../../lib/logger.js';
import { BrainRepository } from './brain.repository.js';
import { BrainSettingsService, type BrainSettingsUpdate } from './brain-settings.service.js';
import { distillTurn, resolveProjectKey } from './brain-distiller.js';
import { buildBrainRecallBundle, searchCandidates } from './brain-recall.js';
import { buildBrainGraph } from './brain-graph.js';
import { getEmbeddingProvider } from './brain-embedding.service.js';
import { redactMemoryText } from './brain-safety.js';
import type {
  BrainAtomRecord,
  BrainAtomUpsert,
  BrainCaptureTurnInput,
  BrainCompletionFn,
  BrainEmbeddingProvider,
  BrainProjectSettings,
  BrainRecallBundle,
  BrainRecallInput,
  BrainSettings
} from './brain.types.js';

// The brain's orchestrator: it wires distillation → safety → embedding → storage → graph, and
// exposes recall/search to the chat service and the Memory UI. It never talks to a provider CLI
// directly — capture uses an injected completion function so the whole thing stays testable.

export interface BrainUpdateEvent {
  type: 'brain_update';
  payload: { projectKey: string | null; capturedAtoms: number };
}

let brainEventEmitter: ((event: BrainUpdateEvent) => void) | null = null;

/** Wire the brain to the app's EventBus so the Memory UI can live-update (see createApp). */
export function setBrainEventEmitter(emitter: (event: BrainUpdateEvent) => void) {
  brainEventEmitter = emitter;
}

// Phrases that signal the user wants to pull in past / other-project work, so cross-project memory
// clears the same low bar as this project's memory (the "recall it like a human" case).
const EXPLICIT_RECALL_RE =
  /\b(recall|previously|earlier|used to|(?:other|another|previous|past|last|earlier)\s+project)\b/i;

/** Human label for a project key (its last path segment), used to match the query against it. */
function projectLabel(projectKey: string): string {
  const segment = projectKey.split(/[\\/]/).filter(Boolean).pop() ?? projectKey;
  return segment.trim().toLowerCase();
}

/** True when the query names a project by its folder label as a whole word (e.g. "ragfuse"). */
function queryNamesProject(query: string, projectKey: string): boolean {
  const label = projectLabel(projectKey);
  if (label.length < 3) {
    return false;
  }
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(query);
}

const defaultComplete: BrainCompletionFn = async ({ prompt, workspace }) => {
  const { text } = await generateAssistantReply(prompt, [], workspace);
  return text;
};

export interface BrainServiceDeps {
  complete?: BrainCompletionFn;
  embeddings?: BrainEmbeddingProvider;
}

export class BrainService {
  private readonly complete: BrainCompletionFn;
  private readonly embeddings: BrainEmbeddingProvider;

  constructor(
    private readonly repository: BrainRepository = new BrainRepository(),
    private readonly settingsService: BrainSettingsService = new BrainSettingsService(),
    deps: BrainServiceDeps = {}
  ) {
    this.complete = deps.complete ?? defaultComplete;
    this.embeddings = deps.embeddings ?? getEmbeddingProvider();
  }

  async getStatus(workspace: WorkspaceState) {
    const settings = await this.settingsService.getSettings();
    const projectKey = resolveProjectKey(workspace);
    const [stats, recentAtoms, projectSettings] = await Promise.all([
      this.repository.getStats(projectKey),
      this.repository.listRecentAtoms(40),
      this.settingsService.getProjectSettings(projectKey)
    ]);

    return {
      settings,
      stats,
      recentAtoms,
      project: { key: projectKey, ...projectSettings },
      embeddingsModel: this.embeddings.model
    };
  }

  async getGraph() {
    const atoms = await this.repository.listGraphAtoms(120);
    return buildBrainGraph(atoms);
  }

  async updateSettings(input: BrainSettingsUpdate) {
    return this.settingsService.updateSettings(input);
  }

  async updateProjectSettings(projectKey: string, input: Partial<BrainProjectSettings>) {
    return this.settingsService.updateProjectSettings(projectKey, input);
  }

  async recall(input: BrainRecallInput): Promise<BrainRecallBundle> {
    const settings = await this.settingsService.getSettings();
    if (!settings.enabled || !settings.recallEnabled) {
      return emptyBundle('recall_disabled');
    }

    const projectKey = resolveProjectKey(input.workspace);
    if (!projectKey || !input.workspace.projectRoot) {
      return emptyBundle('missing_project');
    }

    const [projectSettings, isolatedKeys] = await Promise.all([
      this.settingsService.getProjectSettings(projectKey),
      this.settingsService.getIsolatedProjectKeys()
    ]);

    const includeCrossProject = settings.crossProjectEnabled && !projectSettings.isolate;
    const includeSensitive = settings.mode === 'local_god' && settings.allowSensitiveInjection;

    const candidates = await this.repository.listRecallCandidates(projectKey, {
      includeCrossProject,
      includeSensitive,
      embeddingModel: this.embeddings.model
    });
    if (candidates.length === 0) {
      return emptyBundle('no_candidates');
    }

    const queryEmbedding = await this.embedOne(input.query);

    // Explicit recall intent: either the query names another project that has memories, or it uses a
    // recall phrase. When set, cross-project memory is surfaced at the same low bar as this project's.
    const namedProjectKeys = new Set<string>();
    for (const candidate of candidates) {
      const key = candidate.atom.projectKey;
      if (key && key !== projectKey && queryNamesProject(input.query, key)) {
        namedProjectKeys.add(key);
      }
    }
    const explicitRecall = namedProjectKeys.size > 0 || EXPLICIT_RECALL_RE.test(input.query);

    return buildBrainRecallBundle(input.query, candidates, settings, {
      currentProjectKey: projectKey,
      queryEmbedding,
      isolatedProjectKeys: new Set(isolatedKeys),
      currentProjectIsolated: projectSettings.isolate,
      explicitRecall,
      namedProjectKeys
    });
  }

  /** Free-form semantic search for the Memory UI (browse, not inject). */
  async search(workspace: WorkspaceState, query: string, limit = 20) {
    const settings = await this.settingsService.getSettings();
    const projectKey = resolveProjectKey(workspace) ?? '';
    const includeSensitive = settings.mode === 'local_god';
    const candidates = await this.repository.listRecallCandidates(projectKey || '__none__', {
      includeCrossProject: true,
      includeSensitive,
      embeddingModel: this.embeddings.model,
      limit: 400
    });
    const queryEmbedding = await this.embedOne(query);
    return searchCandidates(query, candidates, queryEmbedding, projectKey, limit);
  }

  async captureTurn(input: BrainCaptureTurnInput) {
    const settings = await this.settingsService.getSettings();
    if (!settings.enabled || !settings.captureEnabled) {
      return skipped('capture_disabled');
    }
    if (settings.agentWritePermissions[input.providerId]?.writeEnabled !== true) {
      return skipped('agent_write_disabled');
    }

    // A project is NOT required: with no project connected we still capture GLOBAL memories
    // (preferences/conventions about how the user works). Project-scoped atoms are dropped by the
    // distiller when there's no project. Only enforce the per-project capture toggle when a
    // project is actually connected.
    const projectKey = resolveProjectKey(input.workspace);
    if (projectKey) {
      const projectSettings = await this.settingsService.getProjectSettings(projectKey);
      if (!projectSettings.captureEnabled) {
        return skipped('project_capture_disabled');
      }
    }

    const prepared = await distillTurn(input, settings, this.complete);
    if (prepared.length === 0) {
      return skipped('no_safe_atoms');
    }

    const contributor = {
      providerId: input.providerId,
      sessionId: input.sessionId,
      lastAssertedAt: new Date().toISOString()
    };
    const upserts: BrainAtomUpsert[] = prepared.map((atom) => ({
      ...atom.input,
      entities: atom.entities,
      contributor
    }));

    const stored = await this.repository.upsertAtoms(upserts);
    await this.embedAtoms(stored);

    if (settings.rawArchiveEnabled) {
      await archiveTurn(this.repository, input, { redact: shouldRedactRawArchive(settings) });
    }

    brainEventEmitter?.({
      type: 'brain_update',
      payload: { projectKey, capturedAtoms: stored.length }
    });
    logger.info('brain.capture.completed', {
      providerId: input.providerId,
      atomCount: stored.length
    });

    return { captured: true as const, atoms: stored, reason: null };
  }

  async deleteAtom(atomId: string) {
    return this.repository.deleteAtom(atomId);
  }

  async resetAll() {
    await this.repository.resetAll();
  }

  private async embedOne(text: string): Promise<Float32Array | null> {
    const vectors = await this.embeddings.embed([text]);
    return vectors?.[0] ?? null;
  }

  private async embedAtoms(atoms: BrainAtomRecord[]) {
    if (atoms.length === 0) {
      return;
    }
    const vectors = await this.embeddings.embed(atoms.map((atom) => atom.text));
    if (!vectors) {
      return;
    }
    for (let i = 0; i < atoms.length; i += 1) {
      const vector = vectors[i];
      if (!vector) {
        continue;
      }
      await this.repository.upsertEmbedding(atoms[i]!.id, {
        model: this.embeddings.model,
        dim: vector.length,
        vector
      });
    }
  }
}

// ── helpers ───────────────────────────────────────────────────────────────────────────────────

function emptyBundle(reason: string): BrainRecallBundle {
  return { injected: false, text: '', atoms: [], reason };
}

function skipped(reason: string) {
  return { captured: false as const, atoms: [] as BrainAtomRecord[], reason };
}

async function archiveTurn(
  repository: BrainRepository,
  input: BrainCaptureTurnInput,
  options: { redact: boolean }
) {
  const raw = [`User: ${input.userMessage.text}`, '', `Assistant: ${input.assistantMessage.text}`]
    .join('\n')
    .trim();
  const archivedText = options.redact ? redactMemoryText(raw) : raw;
  if (!archivedText || archivedText === '[REDACTED]') {
    return;
  }

  const sourceHash = crypto
    .createHash('sha256')
    .update(
      [
        'chat_turn',
        input.providerId,
        input.sessionId ?? '',
        input.userMessage.id,
        input.assistantMessage.id
      ].join(':')
    )
    .digest('hex');

  await repository.archiveRawSource({
    sourceType: 'chat_turn',
    sourceHash,
    compressedBlob: gzipSync(Buffer.from(archivedText, 'utf8')),
    metadata: {
      providerId: input.providerId,
      sessionId: input.sessionId,
      userMessageId: input.userMessage.id,
      assistantMessageId: input.assistantMessage.id,
      projectRoot: input.workspace.projectRoot,
      redacted: options.redact
    }
  });
}

function shouldRedactRawArchive(settings: BrainSettings) {
  return !(settings.mode === 'local_god' && settings.allowSensitiveCapture);
}
