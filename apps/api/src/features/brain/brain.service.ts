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
import { readTail, extractMessages, buildSessionText } from './import/session-transcripts.js';
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
    const explicitRecall = namedProjectKeys.size > 0 || EXPLICIT_RECALL_RE.test(input.query);

    return buildBrainRecallBundle(input.query, candidates, settings, {
      currentProjectKey: projectKey,
      currentProjectRootKey: input.workspace.projectRoot,
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
    },
    onProgress?: (event: ImportProgressEvent) => void
  ) {
    const settings = await this.settingsService.getSettings();
    const manifest = await this.scanImport();
    const tasks: ImportTask[] = [];

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
              const tail = await readTail(file.path);
              const sessionText = buildSessionText(extractMessages(tail, format));
              if (!sessionText) return [];
              return distillSession(
                {
                  providerId,
                  sessionText,
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
    return this.runImportTasks(tasks, onProgress);
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
