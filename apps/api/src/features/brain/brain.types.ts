import type { AssistantProviderId, ChatMessage, WorkspaceState } from '../../types.js';

export type BrainAtomType = 'fact' | 'entity' | 'preference' | 'convention' | 'decision';
export type BrainAtomScope = 'global' | 'project';
export type BrainAtomSensitivity = 'normal' | 'sensitive';
/**
 * `standard` = the everyday brain: capture + recall, cross-project gated by `crossProjectEnabled`,
 * sensitive atoms never captured or injected. `local_god` = the explicit power-user unlock that
 * makes sensitive capture/injection settable (still off until toggled). The old `safe`/`connected`/
 * `deep` modes collapse into `standard` during settings normalization.
 */
export type BrainMode = 'standard' | 'local_god';
export type BrainSourceType = 'chat_turn' | 'diff' | 'transcript' | 'file_snapshot' | 'meeting';
export type BrainEdgeType =
  | 'relates-to'
  | 'caused-by'
  | 'supersedes'
  | 'contradicts'
  | 'decided-in'
  | 'about-file'
  | 'about-project'
  | 'asserted-by'
  | 'mentions';
export type BrainEntityType = 'user' | 'machine' | 'project' | 'agent' | 'session';

export interface BrainAgentWritePermission {
  writeEnabled: boolean;
  updatedAt: string | null;
}

export interface BrainSettings {
  mode: BrainMode;
  enabled: boolean;
  recallEnabled: boolean;
  captureEnabled: boolean;
  /** Tiered + labeled cross-project recall (global atoms everywhere; project atoms cross only when
   *  strongly relevant, labeled with their source project). Per-project `isolate` overrides this. */
  crossProjectEnabled: boolean;
  rawArchiveEnabled: boolean;
  allowSensitiveCapture: boolean;
  allowSensitiveInjection: boolean;
  maxRecallAtoms: number;
  maxRecallCharacters: number;
  maxGraphHops: number;
  agentWritePermissions: Record<AssistantProviderId, BrainAgentWritePermission>;
}

/** Per-project overrides, keyed by project key. Stored in brain_preferences (not one row/project). */
export interface BrainProjectSettings {
  /** Isolated projects neither leak their atoms to other projects nor pull in others' atoms. */
  isolate: boolean;
  /** Turn off capture for just this project while keeping it on globally. */
  captureEnabled: boolean;
}

export interface BrainProvenance {
  source: BrainSourceType;
  providerId: AssistantProviderId;
  sessionId: string | null;
  userMessageId: string | null;
  assistantMessageId: string | null;
  projectRoot: string | null;
  capturedAt: string;
}

export interface BrainAtomInput {
  type: BrainAtomType;
  text: string;
  normalizedText: string;
  scope: BrainAtomScope;
  projectKey: string | null;
  sourceHash: string;
  sensitivity: BrainAtomSensitivity;
  confidence: number;
  salience: number;
  provenance: BrainProvenance;
}

/** One agent's assertion of an atom. Deduped by providerId; multiple = corroboration. */
export interface BrainContributor {
  providerId: AssistantProviderId;
  sessionId: string | null;
  lastAssertedAt: string;
}

/** What the service hands the repository to store: the atom plus its entities + the asserting agent. */
export interface BrainAtomUpsert extends BrainAtomInput {
  /** Named things this atom is about (distiller-extracted); the graph's edges derive from these. */
  entities: string[];
  contributor: BrainContributor;
}

export interface BrainAtomRecord extends BrainAtomInput {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  deletedAt: string | null;
  entities: string[];
  contributors: BrainContributor[];
}

/** A recall candidate: the atom plus its stored embedding for the active model (null → keyword-only). */
export interface BrainRecallCandidate {
  atom: BrainAtomRecord;
  embedding: Float32Array | null;
}

export interface BrainStats {
  totalAtoms: number;
  projectAtoms: number;
  globalAtoms: number;
  deletedAtoms: number;
}

export interface BrainRecallAtom {
  id: string;
  type: BrainAtomType;
  text: string;
  scope: BrainAtomScope;
  projectKey: string | null;
  sensitivity: BrainAtomSensitivity;
  score: number;
  provenance: BrainProvenance;
  lastSeenAt: string;
  /** True when this atom belongs to a different project than the one being recalled into. */
  crossProject: boolean;
  /** Agents that have asserted this atom (deduped), for the "which AI said what" affordance. */
  contributors: AssistantProviderId[];
}

export interface BrainRecallBundle {
  injected: boolean;
  text: string;
  atoms: BrainRecallAtom[];
  reason: string | null;
}

export interface BrainCaptureTurnInput {
  providerId: AssistantProviderId;
  workspace: WorkspaceState;
  sessionId: string | null;
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
}

export interface BrainRecallInput {
  providerId: AssistantProviderId;
  workspace: WorkspaceState;
  query: string;
}

export interface BrainStatus {
  settings: BrainSettings;
  stats: BrainStats;
  recentAtoms: BrainAtomRecord[];
}

// ── Distillation (agent-authored memory) ──────────────────────────────────────────────────────

/** A single memory the distiller proposes from a turn, before safety + embedding + storage. */
export interface DistilledAtom {
  type: BrainAtomType;
  /** Clean, self-contained statement (no dangling pronouns). */
  text: string;
  scope: BrainAtomScope;
  /** Model's stated confidence, 0..1. Clamped on ingest. */
  confidence: number;
  sensitivity: BrainAtomSensitivity;
  /** Display names of entities this memory is about (files, projects, tools, people). */
  entities: string[];
}

export interface DistilledTurn {
  atoms: DistilledAtom[];
}

/** The one function the distiller needs from the outside world: a text completion from a provider. */
export type BrainCompletionFn = (input: {
  providerId: AssistantProviderId;
  prompt: string;
  workspace: WorkspaceState;
}) => Promise<string>;

// ── Embeddings (on-device semantic recall) ────────────────────────────────────────────────────

export interface BrainEmbedding {
  model: string;
  dim: number;
  vector: Float32Array;
}

export interface BrainEmbeddingProvider {
  /** Stable id of the active model, e.g. `minilm-l6-v2-q`. */
  readonly model: string;
  /** Embed texts to unit-length vectors, or return null if embeddings are unavailable (offline
   *  fallback to keyword scoring — never a hard failure, never a network call). */
  embed(texts: string[]): Promise<Float32Array[] | null>;
}

// ── Graph (entities + typed edges the distiller populates) ────────────────────────────────────

export interface BrainEntityInput {
  type: BrainEntityType;
  /** Stable dedup key within a type (e.g. providerId for agents, project key for projects). */
  stableKey: string;
  displayName: string;
  metadata?: Record<string, unknown>;
}

export interface BrainEdgeInput {
  sourceAtomId: string;
  targetAtomId: string;
  type: BrainEdgeType;
  weight: number;
  /** Entity id of the agent asserting this edge, when applicable (for `asserted-by`). */
  asserterAgentId?: string | null;
}
