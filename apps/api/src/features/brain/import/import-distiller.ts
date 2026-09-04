import {
  parseDistilledTurn,
  SALIENCE_BY_TYPE,
  hashAtom,
  type PreparedAtom
} from '../brain-distiller.js';
import { checkBrainAtomSafety, clipAtomText, normalizeAtomKey } from '../brain-safety.js';
import type {
  BrainCompletionFn,
  BrainProvenance,
  BrainSettings,
  DistilledAtom
} from '../brain.types.js';
import type { WorkspaceState } from '../../../types.js';

const CONFIDENCE_FLOOR = 0.7;

export interface DistillMemoryFileInput {
  providerId: 'claude' | 'codex' | 'gemini';
  fileText: string;
  scope: 'global' | 'project';
  /** Absolute project root for project scope; null for global. */
  projectKey: string | null;
  projectName: string | null;
  /** Passed to the completion fn for provider routing. */
  workspace: WorkspaceState;
}

export interface DistillSessionInput {
  providerId: 'claude' | 'codex' | 'gemini';
  /** The recent, bounded tail of a session transcript (see session-transcripts.ts). */
  sessionText: string;
  /** Sessions are always project-scoped, keyed by the absolute project root. */
  projectKey: string;
  projectName: string | null;
  workspace: WorkspaceState;
}

export function buildImportPrompt(
  fileText: string,
  opts: { scope: 'global' | 'project'; projectName: string | null }
): string {
  const target =
    opts.scope === 'project'
      ? `the project "${opts.projectName ?? 'this project'}"`
      : 'how the user works everywhere';
  return [
    "You are Oplyr's memory importer. Below is the user's EXISTING memory/instructions file for " +
      target +
      '.',
    'Extract only DURABLE, reusable memories: decisions, conventions, preferences, stable facts.',
    'Return ONLY a JSON object (no prose, no fences): {"atoms":[{"type":"decision|convention|preference|fact|entity","text":"clean self-contained statement","scope":"' +
      opts.scope +
      '","confidence":0.0,"sensitivity":"normal|sensitive","entities":["name"]}]}',
    '- "text" must stand alone (no "it"/"this" referring back).',
    '- sensitivity "sensitive" if it references secrets/credentials/keys/private data.',
    '- If nothing durable, return {"atoms":[]}.',
    '',
    'Memory file:',
    fileText.slice(0, 12000)
  ].join('\n');
}

export function buildSessionPrompt(sessionText: string, projectName: string | null): string {
  const where = projectName ? ` in the project "${projectName}"` : '';
  return [
    "You are Oplyr's memory importer. Below is the RECENT tail of a coding session" +
      where +
      ' with an AI agent.',
    'Extract durable, reusable memories AND the working state so the user can pick up where they left',
    'off: key decisions, conventions, what was being built, open problems, and the current state.',
    'Return ONLY a JSON object (no prose, no fences): {"atoms":[{"type":"decision|convention|preference|fact|entity","text":"clean self-contained statement","scope":"project","confidence":0.0,"sensitivity":"normal|sensitive","entities":["name"]}]}',
    '- Prefer 3-8 high-signal atoms. Include at least one capturing where the session was left off.',
    '- "text" must stand alone (no "it"/"this"/"we" referring back to the conversation).',
    '- sensitivity "sensitive" if it references secrets/credentials/keys/private data.',
    '- If nothing durable, return {"atoms":[]}.',
    '',
    'Session (recent tail):',
    sessionText
  ].join('\n');
}

/** Offline fallback for curated files: treat markdown bullets / non-heading lines as conventions. */
function structuralAtoms(fileText: string, scope: 'global' | 'project'): DistilledAtom[] {
  return fileText
    .split('\n')
    .map((l) => l.replace(/^[\s>*-]+/, '').trim())
    .filter((l) => l.length >= 8 && !l.startsWith('#'))
    .slice(0, 12)
    .map(
      (text): DistilledAtom => ({
        type: 'convention',
        text,
        scope,
        confidence: CONFIDENCE_FLOOR,
        sensitivity: 'normal',
        entities: []
      })
    );
}

/** Shared: turn distilled atoms into storable PreparedAtoms — safety redaction, dedup, provenance. */
function prepareImportedAtoms(
  atoms: DistilledAtom[],
  opts: {
    providerId: 'claude' | 'codex' | 'gemini';
    scope: 'global' | 'project';
    projectKey: string | null;
    allowSensitiveCapture: boolean;
  }
): PreparedAtom[] {
  const provenance: BrainProvenance = {
    source: 'imported',
    providerId: opts.providerId,
    sessionId: null,
    userMessageId: null,
    assistantMessageId: null,
    projectRoot: opts.scope === 'project' ? opts.projectKey : null,
    capturedAt: new Date().toISOString()
  };

  const prepared: PreparedAtom[] = [];
  const seen = new Set<string>();
  for (const atom of atoms) {
    const text = clipAtomText(atom.text);
    const safety = checkBrainAtomSafety(text);
    if (!safety.safe) continue;
    const sensitivity =
      safety.sensitivity === 'sensitive' || atom.sensitivity === 'sensitive'
        ? 'sensitive'
        : 'normal';
    if (sensitivity === 'sensitive' && !opts.allowSensitiveCapture) continue;

    const scope = opts.scope;
    if (scope === 'project' && !opts.projectKey) continue;
    const normalizedText = normalizeAtomKey(text);
    const projectKey = scope === 'project' ? opts.projectKey : null;
    const sourceHash = hashAtom({ type: atom.type, scope, projectKey, normalizedText });
    if (seen.has(sourceHash)) continue;
    seen.add(sourceHash);

    prepared.push({
      input: {
        type: atom.type,
        text,
        normalizedText,
        scope,
        projectKey,
        sourceHash,
        sensitivity,
        confidence: Math.max(atom.confidence, CONFIDENCE_FLOOR),
        salience: SALIENCE_BY_TYPE[atom.type],
        provenance
      },
      entities: atom.entities
    });
  }
  return prepared;
}

/** Distill one curated memory file into atoms, via the user's own agent. Structural fallback when
 *  the agent is unreachable. Never throws. */
export async function distillMemoryFile(
  input: DistillMemoryFileInput,
  settings: BrainSettings,
  complete: BrainCompletionFn
): Promise<PreparedAtom[]> {
  let atoms: DistilledAtom[];
  try {
    const raw = await complete({
      providerId: input.providerId,
      prompt: buildImportPrompt(input.fileText, input),
      workspace: input.workspace
    });
    atoms = parseDistilledTurn(raw).atoms;
    if (atoms.length === 0) atoms = structuralAtoms(input.fileText, input.scope);
  } catch {
    atoms = structuralAtoms(input.fileText, input.scope);
  }

  return prepareImportedAtoms(atoms, {
    providerId: input.providerId,
    scope: input.scope,
    projectKey: input.projectKey,
    allowSensitiveCapture: settings.allowSensitiveCapture
  });
}

/** Distill the recent tail of a session transcript into project-scoped atoms (the "where you left
 *  off" memory). No structural fallback — raw chat lines aren't atoms, so a failed call is skipped. */
export async function distillSession(
  input: DistillSessionInput,
  settings: BrainSettings,
  complete: BrainCompletionFn
): Promise<PreparedAtom[]> {
  let atoms: DistilledAtom[];
  try {
    const raw = await complete({
      providerId: input.providerId,
      prompt: buildSessionPrompt(input.sessionText, input.projectName),
      workspace: input.workspace
    });
    atoms = parseDistilledTurn(raw).atoms;
  } catch {
    return [];
  }

  return prepareImportedAtoms(atoms, {
    providerId: input.providerId,
    scope: 'project',
    projectKey: input.projectKey,
    allowSensitiveCapture: settings.allowSensitiveCapture
  });
}
