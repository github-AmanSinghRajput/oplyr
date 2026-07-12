import crypto from 'node:crypto';
import type {
  BrainAtomInput,
  BrainAtomScope,
  BrainAtomType,
  BrainCaptureTurnInput,
  BrainCompletionFn,
  BrainSettings,
  DistilledAtom,
  DistilledTurn
} from './brain.types.js';
import {
  checkBrainAtomSafety,
  clipAtomText,
  normalizeAtomKey,
  normalizeAtomText
} from './brain-safety.js';

// The agent-distiller turns a conversation turn into clean, durable memory atoms. Unlike the old
// regex extractor, it asks the active local model to read the turn and emit structured JSON — so
// memories read like a human curated them and carry the entities they're about (which become the
// graph). A cheap gate skips trivial turns so we never spend a model call on "thanks".

const MAX_ATOMS_PER_TURN = 12;
const MAX_ENTITIES_PER_ATOM = 8;
// Bound how much turn text goes to the distiller so a huge reply (big diff, long log) can't blow the
// model's context window or waste tokens. The tail is dropped — the durable claims are usually early.
const MAX_USER_CHARS = 4000;
const MAX_ASSISTANT_CHARS = 8000;

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}\n…[truncated]`;
}
const ATOM_TYPES: readonly BrainAtomType[] = [
  'fact',
  'entity',
  'preference',
  'convention',
  'decision'
];

// Salience = how important a memory is (independent of how sure we are). Decisions/preferences
// outrank incidental facts when recall has to choose what to inject within a budget.
const SALIENCE_BY_TYPE: Record<BrainAtomType, number> = {
  decision: 0.85,
  preference: 0.8,
  convention: 0.75,
  fact: 0.6,
  entity: 0.55
};

/** An atom ready to store, plus the entity names it links to (materialized into graph edges later). */
export interface PreparedAtom {
  input: BrainAtomInput;
  entities: string[];
}

export function resolveProjectKey(workspace: { id: string | null; projectRoot: string | null }) {
  return workspace.id ?? workspace.projectRoot;
}

/**
 * Cheap heuristic gate: is this turn worth a distillation call at all? Conservative on purpose —
 * when unsure we distill (a wasted call is cheaper than a missed memory), we only skip clearly
 * trivial exchanges.
 */
export function shouldDistillTurn(input: BrainCaptureTurnInput): boolean {
  const user = input.userMessage.text.trim();
  const assistant = input.assistantMessage.text.trim();
  const combinedLength = user.length + assistant.length;
  if (combinedLength < 60) {
    return false;
  }

  // A pure acknowledgement turn (short user "thanks", short assistant "you're welcome") carries
  // nothing durable.
  const trivialAck =
    /^(thanks?|thank you|ok(ay)?|great|cool|nice|got it|sure|yes|no|yep|nope|done)\b/i;
  if (user.length < 12 && assistant.length < 60 && trivialAck.test(user)) {
    return false;
  }

  return true;
}

export function buildDistillPrompt(input: BrainCaptureTurnInput): string {
  return [
    "You are Oplyr's memory distiller. Read one conversation turn and extract only DURABLE, reusable",
    'memories a teammate would want remembered later: decisions, conventions, preferences, and stable',
    'facts about this project or how the user works. Ignore chit-chat, transient status, and anything',
    'only true for this single turn.',
    '',
    'Return ONLY a JSON object (no prose, no markdown fences) matching exactly:',
    '{"atoms":[{"type":"decision|convention|preference|fact|entity","text":"clean self-contained statement","scope":"project|global","confidence":0.0,"sensitivity":"normal|sensitive","entities":["name"]}]}',
    '',
    'Rules:',
    '- scope "global" = a preference/convention about how the USER works everywhere (e.g. "prefers tabs over spaces"). scope "project" = specific to this project/codebase.',
    '- "text" must stand alone: no "it"/"that"/"this" referring back to the conversation.',
    '- Set sensitivity "sensitive" if it contains or references secrets, credentials, tokens, keys, or private personal data.',
    '- "entities" = the files, tools, projects, or people the memory is about (short names).',
    '- Prefer fewer, higher-quality atoms. If nothing is worth remembering, return {"atoms":[]}.',
    '',
    'Conversation turn:',
    `User: ${clip(input.userMessage.text, MAX_USER_CHARS)}`,
    '',
    `Assistant: ${clip(input.assistantMessage.text, MAX_ASSISTANT_CHARS)}`
  ].join('\n');
}

/** Resilient parse: tolerate markdown fences and surrounding prose, validate shape, drop junk. */
export function parseDistilledTurn(raw: string): DistilledTurn {
  const jsonText = extractJsonObject(raw);
  if (!jsonText) {
    return { atoms: [] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { atoms: [] };
  }

  const atomsRaw =
    parsed && typeof parsed === 'object' && Array.isArray((parsed as { atoms?: unknown }).atoms)
      ? (parsed as { atoms: unknown[] }).atoms
      : [];

  const atoms: DistilledAtom[] = [];
  for (const candidate of atomsRaw) {
    const atom = coerceDistilledAtom(candidate);
    if (atom) {
      atoms.push(atom);
    }
    if (atoms.length >= MAX_ATOMS_PER_TURN) {
      break;
    }
  }

  return { atoms };
}

/**
 * Full capture pipeline for one turn: gate → prompt → model → parse → safety → storable atoms.
 * Returns [] (never throws) on any failure so capture stays fire-and-forget and best-effort.
 */
export async function distillTurn(
  input: BrainCaptureTurnInput,
  settings: BrainSettings,
  complete: BrainCompletionFn
): Promise<PreparedAtom[]> {
  const projectKey = resolveProjectKey(input.workspace);
  if (!projectKey || !shouldDistillTurn(input)) {
    return [];
  }

  let raw: string;
  try {
    raw = await complete({
      providerId: input.providerId,
      prompt: buildDistillPrompt(input),
      workspace: input.workspace
    });
  } catch {
    return [];
  }

  const distilled = parseDistilledTurn(raw);
  return prepareAtoms(distilled, input, settings, projectKey);
}

// ── internals ─────────────────────────────────────────────────────────────────────────────────

function prepareAtoms(
  distilled: DistilledTurn,
  input: BrainCaptureTurnInput,
  settings: BrainSettings,
  projectKey: string
): PreparedAtom[] {
  const provenance = {
    source: 'chat_turn' as const,
    providerId: input.providerId,
    sessionId: input.sessionId,
    userMessageId: input.userMessage.id,
    assistantMessageId: input.assistantMessage.id,
    projectRoot: input.workspace.projectRoot,
    capturedAt: new Date().toISOString()
  };

  const prepared: PreparedAtom[] = [];
  const seen = new Set<string>();

  for (const atom of distilled.atoms) {
    const text = clipAtomText(atom.text);

    // Never trust the model on secrets: re-run our own safety filter and take the stricter verdict.
    const safety = checkBrainAtomSafety(text);
    if (!safety.safe) {
      continue;
    }
    const sensitivity =
      safety.sensitivity === 'sensitive' || atom.sensitivity === 'sensitive'
        ? 'sensitive'
        : 'normal';
    if (sensitivity === 'sensitive' && !settings.allowSensitiveCapture) {
      continue;
    }

    const scope = atom.scope;
    const normalizedText = normalizeAtomKey(text);
    const sourceHash = hashAtom({
      type: atom.type,
      scope,
      projectKey: scope === 'project' ? projectKey : null,
      normalizedText
    });
    if (seen.has(sourceHash)) {
      continue;
    }
    seen.add(sourceHash);

    prepared.push({
      input: {
        type: atom.type,
        text,
        normalizedText,
        scope,
        projectKey: scope === 'project' ? projectKey : null,
        sourceHash,
        sensitivity,
        confidence: atom.confidence,
        salience: SALIENCE_BY_TYPE[atom.type],
        provenance
      },
      entities: atom.entities
    });
  }

  return prepared;
}

function coerceDistilledAtom(value: unknown): DistilledAtom | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;

  const type = ATOM_TYPES.includes(record.type as BrainAtomType)
    ? (record.type as BrainAtomType)
    : null;
  const text = typeof record.text === 'string' ? normalizeAtomText(record.text) : '';
  if (!type || text.length === 0) {
    return null;
  }

  const scope: BrainAtomScope = record.scope === 'global' ? 'global' : 'project';
  const sensitivity = record.sensitivity === 'sensitive' ? 'sensitive' : 'normal';

  return {
    type,
    text,
    scope,
    sensitivity,
    confidence: clampConfidence(record.confidence, type),
    entities: coerceEntities(record.entities)
  };
}

function coerceEntities(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const entities: string[] = [];
  for (const raw of value) {
    if (typeof raw !== 'string') {
      continue;
    }
    const name = raw.trim().slice(0, 80);
    const key = name.toLowerCase();
    if (name.length < 2 || seen.has(key)) {
      continue;
    }
    seen.add(key);
    entities.push(name);
    if (entities.length >= MAX_ENTITIES_PER_ATOM) {
      break;
    }
  }
  return entities;
}

function clampConfidence(value: unknown, type: BrainAtomType): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return SALIENCE_BY_TYPE[type];
  }
  return Math.max(0.05, Math.min(1, parsed));
}

/** Extract the first balanced top-level JSON object from arbitrary model output. */
function extractJsonObject(raw: string): string | null {
  const withoutFences = raw.replace(/```(?:json)?/gi, '');
  const start = withoutFences.indexOf('{');
  const end = withoutFences.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  return withoutFences.slice(start, end + 1);
}

function hashAtom(input: {
  type: BrainAtomType;
  scope: string;
  projectKey: string | null;
  normalizedText: string;
}) {
  return crypto
    .createHash('sha256')
    .update(`${input.type}:${input.scope}:${input.projectKey ?? 'global'}:${input.normalizedText}`)
    .digest('hex');
}
