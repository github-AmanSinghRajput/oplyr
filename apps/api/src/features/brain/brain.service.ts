import crypto from 'node:crypto';
import { gzipSync } from 'node:zlib';
import os from 'node:os';
import fs from 'node:fs/promises';
import type { WorkspaceState } from '../../types.js';
import { generateAssistantReply, getConnectedProviderIds } from '../../assistant-client.js';
import { logger } from '../../lib/logger.js';
import { BrainRepository } from './brain.repository.js';
import { BrainSettingsService, type BrainSettingsUpdate } from './brain-settings.service.js';
import { distillTurn, resolveProjectKey, type PreparedAtom } from './brain-distiller.js';
import { buildBrainRecallBundle, searchCandidates } from './brain-recall.js';
import { buildBrainGraph } from './brain-graph.js';
import { getEmbeddingProvider } from './brain-embedding.service.js';
import { redactMemoryText } from './brain-safety.js';
import { scanAgentMemory } from './import/import-scanner.js';
import {
  distillMemoryFile,
  distillSession,
  type DistillMemoryFileInput
} from './import/import-distiller.js';
import { computeSourceHash, sha256 } from './import/import-ledger.js';
import { readSessionMessages, buildSessionChunks } from './import/session-transcripts.js';
import type { ImportManifest, ImportSelector } from './import/import.types.js';
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

/**
 * "Where were we?" questions. These ask about TIME, not topic — and they carry almost no words to
 * match on semantically ("last", "thing", "doing", "off"), so ranking them by relevance answers a
 * recency question with whatever happened to be most salient, which is usually something old.
 *
 * Matching one of these makes recency the deciding factor instead (see `recencyFirst`).
 */
/** Backfill pacing: small batches with a pause, so re-embedding never competes with a live turn. */
const EMBEDDING_BACKFILL_BATCH = 32;
const EMBEDDING_BACKFILL_PAUSE_MS = 250;

/**
 * Session import budget.
 *
 * A session used to be distilled as ONE 9,000-character blob — roughly the last two exchanges — so
 * the brain's picture of a day's work was whatever happened in the final few minutes. These slice
 * it instead: ~120,000 characters of conversation, oldest slice first, one agent call each.
 *
 * Only the NEWEST session per project per agent is imported (see import-scanner.ts), so a connect
 * costs at most `MAX_SESSION_CHUNKS` calls per project per agent. Raising the chunk count buys more
 * history at a linear cost in the user's own agent quota.
 */
const SESSION_CHUNK_CHARS = 12_000;
const MAX_SESSION_CHUNKS = 10;
/**
 * Chunk budget per session, indexed by how recently the session was worked in (rank 0 = most
 * recent). Importing several sessions per project is what gives the brain a real picture of a repo,
 * but spending ten agent calls on each would be wasteful: the session you were in an hour ago is
 * worth reading deeply, the one from three weeks ago is worth skimming.
 */
const SESSION_CHUNKS_BY_RANK = [MAX_SESSION_CHUNKS, 3, 2];

function sessionChunkBudget(rank: number | undefined): number {
  return SESSION_CHUNKS_BY_RANK[rank ?? 0] ?? SESSION_CHUNKS_BY_RANK.at(-1)!;
}

const RECENCY_QUERY_RE =
  /\b(?:where (?:did|do|were) we|left off|leave off|pick(?:ing)? up where|last (?:thing|time|session|worked|working|doing)|what were we|were we (?:doing|working)|continue (?:where|from where|our)|catch me up|what did we (?:do|finish|last)|since last time|resume(?: our)? (?:work|session))\b/i;

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

export interface ImportProgressEvent {
  phase: 'distill' | 'store' | 'done';
  sourceLabel: string;
  /** Absolute path of the source being processed, so the UI can tick the exact row (null on `done`). */
  sourcePath: string | null;
  current: number;
  total: number;
  atomsAdded: number;
}
type ImportFileJob = Omit<DistillMemoryFileInput, 'workspace'>;

interface ImportTask {
  label: string;
  providerId: 'claude' | 'codex' | 'gemini';
  scope: 'global' | 'project';
  projectKey: string | null;
  projectName: string | null;
  distill: () => Promise<PreparedAtom[]>;
  /** Import-ledger fields — set on the real disk-backed path (`runImport`), absent for the in-memory
   *  test core (`runImportFiles`). When present, a successful distill records the source. */
  path?: string;
  kind?: 'global' | 'project' | 'session';
  contentHash?: string | null;
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
      embeddingsModel: this.embeddings.model,
      // Semantic recall is the whole point of the brain — say plainly when it isn't running rather
      // than letting keyword-only recall pass for the real thing.
      embeddingsAvailable: this.embeddings.available !== false,
      embeddingsUnavailableReason: this.embeddings.unavailableReason ?? null
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
      embeddingModel: this.embeddings.model,
      projectRootKey: input.workspace.projectRoot ?? undefined
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
    const recencyFirst = RECENCY_QUERY_RE.test(input.query);
    // A continuation question is also an explicit request to look back, so it clears the same
    // cross-project bar.
    const explicitRecall =
      namedProjectKeys.size > 0 || recencyFirst || EXPLICIT_RECALL_RE.test(input.query);

    return buildBrainRecallBundle(input.query, candidates, settings, {
      currentProjectKey: projectKey,
      currentProjectRootKey: input.workspace.projectRoot,
      queryEmbedding,
      isolatedProjectKeys: new Set(isolatedKeys),
      currentProjectIsolated: projectSettings.isolate,
      explicitRecall,
      recencyFirst,
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
    return searchCandidates(
      query,
      candidates,
      queryEmbedding,
      projectKey,
      limit,
      workspace.projectRoot
    );
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

  /** Read-only scan of installed agents' curated memory on disk (paths/counts, never bodies). */
  async scanImport(homeDir: string = os.homedir()): Promise<ImportManifest> {
    const connectedIds = await getConnectedProviderIds();
    const connected: Record<'claude' | 'codex' | 'gemini', boolean> = {
      claude: false,
      codex: false,
      gemini: false
    };
    for (const id of connectedIds) {
      if (id in connected) connected[id as 'claude' | 'codex' | 'gemini'] = true;
    }
    const manifest = await scanAgentMemory({ homeDir, connected });
    await this.annotateImportStatus(manifest);
    return manifest;
  }

  /** Tag every discovered source with `new` / `added` / `changed` from the import ledger. Only files
   *  that were imported before get hashed (a `new` file skips the read), so a first-run scan of a
   *  fresh install does no extra I/O. */
  private async annotateImportStatus(manifest: ImportManifest): Promise<void> {
    const ledger = this.repository.listImportSources();
    for (const agent of manifest.agents) {
      const files = [agent.global, ...agent.projects, ...agent.sessions].filter(
        (f): f is NonNullable<typeof f> => Boolean(f)
      );
      for (const file of files) {
        const record = ledger.get(file.path);
        if (!record) {
          file.status = 'new';
          continue;
        }
        const currentHash = await computeSourceHash(file);
        file.status = currentHash && currentHash === record.contentHash ? 'added' : 'changed';
        file.atomsAdded = record.atomsAdded;
      }
    }
  }

  /** Store loop shared by curated-file + session import: distill → upsert → embed, with progress. */
  private async runImportTasks(
    tasks: ImportTask[],
    onProgress?: (event: ImportProgressEvent) => void
  ) {
    const byProject: Record<string, number> = {};
    const skipped: string[] = [];
    let atomsAdded = 0;
    const total = tasks.length;

    for (let i = 0; i < tasks.length; i += 1) {
      const task = tasks[i]!;
      onProgress?.({
        phase: 'distill',
        sourceLabel: task.label,
        sourcePath: task.path ?? null,
        current: i,
        total,
        atomsAdded
      });
      let prepared: PreparedAtom[];
      try {
        prepared = await task.distill();
      } catch (error) {
        logger.warn('brain.import.distill_failed', {
          source: task.label,
          message: error instanceof Error ? error.message : String(error)
        });
        skipped.push(task.label);
        continue;
      }
      logger.info('brain.import.distilled', { source: task.label, atoms: prepared.length });

      let storedCount = 0;
      if (prepared.length > 0) {
        const contributor = {
          providerId: task.providerId,
          sessionId: null,
          lastAssertedAt: new Date().toISOString()
        };
        const upserts = prepared.map((atom) => ({
          ...atom.input,
          entities: atom.entities,
          contributor
        }));
        onProgress?.({
          phase: 'store',
          sourceLabel: task.label,
          sourcePath: task.path ?? null,
          current: i,
          total,
          atomsAdded
        });
        const stored = await this.repository.upsertAtoms(upserts);
        await this.embedAtoms(stored);
        storedCount = stored.length;
        logger.info('brain.import.stored', {
          source: task.label,
          projectKey: task.projectKey,
          stored: storedCount
        });
        atomsAdded += storedCount;
        if (task.scope === 'project' && task.projectName) {
          byProject[task.projectName] = (byProject[task.projectName] ?? 0) + storedCount;
        }
        brainEventEmitter?.({
          type: 'brain_update',
          payload: { projectKey: task.projectKey, capturedAtoms: storedCount }
        });
      } else {
        skipped.push(task.label);
      }

      // Record the source in the import ledger (best-effort) so a re-scan reports it as `added`
      // rather than re-offering it. Only present on the real disk-backed path; a distill failure
      // `continue`s above and stays retryable (no ledger row).
      if (task.path && task.contentHash) {
        try {
          this.repository.upsertImportSource({
            path: task.path,
            providerId: task.providerId,
            kind: task.kind ?? (task.scope === 'global' ? 'global' : 'project'),
            projectKey: task.projectKey,
            contentHash: task.contentHash,
            atomsAdded: storedCount
          });
        } catch (error) {
          logger.warn('brain.import.ledger_failed', {
            source: task.label,
            message: error instanceof Error ? error.message : String(error)
          });
        }
      }
    }
    logger.info('brain.import.completed', {
      atomsAdded,
      sources: total,
      skipped: skipped.length
    });
    onProgress?.({
      phase: 'done',
      sourceLabel: '',
      sourcePath: null,
      current: total,
      total,
      atomsAdded
    });
    return { atomsAdded, byProject, skipped };
  }

  /** Unit-testable core: distill already-loaded curated files → upsert → embed. */
  async runImportFiles(
    files: ImportFileJob[],
    workspace: WorkspaceState,
    onProgress?: (event: ImportProgressEvent) => void
  ) {
    const settings = await this.settingsService.getSettings();
    const tasks: ImportTask[] = files.map((file) => ({
      label:
        file.scope === 'global'
          ? `${file.providerId} · global`
          : `${file.providerId} · ${file.projectName ?? 'project'}`,
      providerId: file.providerId,
      scope: file.scope,
      projectKey: file.projectKey,
      projectName: file.projectName,
      distill: () => distillMemoryFile({ ...file, workspace }, settings, this.complete)
    }));
    return this.runImportTasks(tasks, onProgress);
  }

  /** Scan → build distill tasks for the selected curated files AND session transcripts → run.
   *  Sessions are read from disk as a bounded tail (transcripts can be hundreds of MB). */
  async runImport(
    input: {
      selectors: ImportSelector[];
      workspace: WorkspaceState;
      includeProjectScope: boolean;
      /** Re-distill sources the ledger says are unchanged. Off by default — see below. */
      reimportUnchanged?: boolean;
    },
    onProgress?: (event: ImportProgressEvent) => void
  ) {
    const settings = await this.settingsService.getSettings();
    const manifest = await this.scanImport();
    const tasks: ImportTask[] = [];
    /** Selected but byte-identical to the last import — reported back, never re-distilled. */
    const alreadyCurrent: string[] = [];

    for (const sel of input.selectors) {
      const group = manifest.agents.find((a) => a.providerId === sel.providerId);
      if (!group) continue;
      const providerId = sel.providerId;
      const selectedPaths = new Set(sel.paths);
      const candidates = [group.global, ...group.projects, ...group.sessions].filter(
        Boolean
      ) as NonNullable<typeof group.global>[];

      for (const file of candidates) {
        if (!selectedPaths.has(file.path)) continue;
        // Everything but the global file is project-scoped → gated behind the project-scope opt-in.
        if (file.kind !== 'global' && !input.includeProjectScope) continue;

        // Never re-distill a source the ledger says is byte-identical to what we already consumed.
        //
        // This invariant used to live only in the UI (the panel hides `added` sources). But
        // distillation is LLM-driven and therefore NOT deterministic: re-running it on the same file
        // yields differently-worded atoms, which hash differently, which INSERT as new rows. One
        // stray re-import and the brain carries two copies of every fact, and the Memory canvas —
        // whose edges are derived from atoms — doubles with it. So the rule belongs here.
        if (file.status === 'added' && !input.reimportUnchanged) {
          alreadyCurrent.push(file.path);
          continue;
        }

        if (file.kind === 'session') {
          const projectKey = file.projectRoot;
          if (!projectKey) continue;
          const format = providerId === 'claude' ? 'claude' : 'codex';
          tasks.push({
            label: `${providerId} · ${file.projectName ?? 'project'} session`,
            providerId,
            scope: 'project',
            projectKey,
            projectName: file.projectName,
            path: file.path,
            kind: 'session',
            contentHash: await computeSourceHash(file),
            distill: async () => {
              const maxChunks = sessionChunkBudget(file.sessionRank);
              const messages = await readSessionMessages(file.path, format, {
                enoughChars: SESSION_CHUNK_CHARS * maxChunks
              });
              const sessionChunks = buildSessionChunks(messages, SESSION_CHUNK_CHARS, maxChunks);
              if (sessionChunks.length === 0) return [];
              return distillSession(
                {
                  providerId,
                  sessionChunks,
                  projectKey,
                  projectName: file.projectName,
                  workspace: input.workspace
                },
                settings,
                this.complete
              );
            }
          });
        } else {
          let fileText: string;
          try {
            fileText = await fs.readFile(file.path, 'utf8');
          } catch {
            continue;
          }
          const scope = file.kind === 'project' ? 'project' : 'global';
          tasks.push({
            label:
              scope === 'global'
                ? `${providerId} · global`
                : `${providerId} · ${file.projectName ?? 'project'}`,
            providerId,
            scope,
            projectKey: file.projectRoot,
            projectName: file.projectName,
            path: file.path,
            kind: file.kind,
            contentHash: sha256(fileText),
            distill: () =>
              distillMemoryFile(
                {
                  providerId,
                  fileText,
                  scope,
                  projectKey: file.projectRoot,
                  projectName: file.projectName,
                  workspace: input.workspace
                },
                settings,
                this.complete
              )
          });
        }
      }
    }
    if (alreadyCurrent.length > 0) {
      logger.info('brain.import.already_current', { sources: alreadyCurrent.length });
    }

    const result = await this.runImportTasks(tasks, onProgress);
    return { ...result, alreadyCurrent };
  }

  async deleteAtom(atomId: string) {
    return this.repository.deleteAtom(atomId);
  }

  async resetAll() {
    await this.repository.resetAll();
  }

  /**
   * Embed memories that were stored without a vector.
   *
   * Packaged builds through 0.4.1 shipped without `onnxruntime-node`, so the embedding path failed
   * at load and every memory written by them has no vector — for those users recall is keyword-only
   * across their entire history, and fixing the packaging alone would not have changed that. Runs
   * once in the background at boot.
   *
   * Deliberately unhurried: batches are small and yield between rounds, because this competes with
   * a user who may be mid-turn. Never throws — a brain that cannot embed is the state we are
   * already recovering from.
   */
  async backfillEmbeddings(): Promise<{ embedded: number }> {
    // `available` is optional on the provider, so only an explicit false means "don't bother";
    // undefined is "unknown", and the embed call itself reports failure.
    if (this.embeddings.available === false) {
      return { embedded: 0 };
    }

    let embedded = 0;
    for (;;) {
      let batch: Array<{ id: string; text: string }>;
      try {
        batch = await this.repository.listAtomsMissingEmbedding(
          this.embeddings.model,
          EMBEDDING_BACKFILL_BATCH
        );
      } catch {
        break;
      }
      if (batch.length === 0) break;

      let stored: number;
      try {
        stored = await this.embedAtoms(batch);
      } catch {
        // Embeddings went away mid-run; the next launch picks up where this stopped.
        break;
      }

      // Progress must be measured in atoms actually embedded. `embedAtoms` reports 0 rather than
      // throwing when the runtime is gone, and the query re-returns the same unembedded page every
      // round — so treating a handed-off page as progress spins forever.
      if (stored === 0) break;
      embedded += stored;
      // A short page means the table is drained.
      if (batch.length < EMBEDDING_BACKFILL_BATCH) break;
      await new Promise((resolve) => setTimeout(resolve, EMBEDDING_BACKFILL_PAUSE_MS));
    }

    if (embedded > 0) {
      logger.info('brain.embeddings.backfilled', { count: embedded });
    }
    return { embedded };
  }

  private async embedOne(text: string): Promise<Float32Array | null> {
    const vectors = await this.embeddings.embed([text]);
    return vectors?.[0] ?? null;
  }

  /** Returns how many atoms actually got a vector — 0 when the embedding runtime is unavailable. */
  private async embedAtoms(atoms: Array<{ id: string; text: string }>): Promise<number> {
    if (atoms.length === 0) {
      return 0;
    }
    const vectors = await this.embeddings.embed(atoms.map((atom) => atom.text));
    if (!vectors) {
      return 0;
    }
    let stored = 0;
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
      stored += 1;
    }
    return stored;
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
