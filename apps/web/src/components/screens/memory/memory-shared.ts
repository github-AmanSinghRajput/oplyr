import type {
  AssistantProviderId,
  BrainAtom,
  BrainAtomScope,
  BrainAtomType,
  BrainRecallAtom
} from '@/containers/voice-console/lib/types';

/** Full agent display names (mirrors getProviderLabel in use-app-settings). */
export const providerLabels: Record<AssistantProviderId, string> = {
  codex: 'Codex',
  claude: 'Claude Code',
  gemini: 'Gemini CLI'
};

export const providerOrder: AssistantProviderId[] = ['codex', 'claude', 'gemini'];

/** Human-readable "who asserted this" label, e.g. "Claude Code · Codex". */
export function formatContributors(contributors: AssistantProviderId[]): string {
  if (contributors.length === 0) {
    return 'Unknown';
  }
  return contributors.map((id) => providerLabels[id] ?? id).join(' · ');
}

/** Accent color per atom type — reused by both the graph and the detail/feed chips. */
export function colorForType(type: BrainAtomType): string {
  switch (type) {
    case 'decision':
      return '#6ffbbe';
    case 'preference':
      return '#f2d070';
    case 'convention':
      return 'var(--color-accent)';
    case 'entity':
      return '#a7b7ff';
    case 'fact':
    default:
      return '#8fd8ff';
  }
}

export function formatDateTime(value: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(value));
  } catch {
    return value;
  }
}

/** Strip a leading "decision:" / "preference -" prefix and collapse whitespace for compact labels. */
export function cleanAtomText(text: string): string {
  return text
    .replace(/^\s*(decision|decided|preference|convention|fact|entity)\s*[:-]\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * One row in the memory drawer. Recent captures and search results are different shapes from the
 * API but read identically in the UI, so they are normalised here and the drawer stays presentational.
 */
export interface MemoryDrawerItem {
  id: string;
  type: BrainAtomType;
  scope: BrainAtomScope;
  text: string;
  /** Who asserted it. */
  meta: string;
  sensitive: boolean;
  /** Right-aligned hint: a timestamp for recent captures, a relevance score for results. */
  trailing: string;
  /** Set when a result comes from a different project than the one being searched from. */
  otherProject: string | null;
}

export function recentToDrawerItems(atoms: BrainAtom[]): MemoryDrawerItem[] {
  return atoms.map((atom) => ({
    id: atom.id,
    type: atom.type,
    scope: atom.scope,
    text: cleanAtomText(atom.text) || atom.text,
    meta: formatContributors(atom.contributors.map((c) => c.providerId)),
    sensitive: atom.sensitivity === 'sensitive',
    trailing: formatDateTime(atom.lastSeenAt),
    otherProject: null
  }));
}

export function resultsToDrawerItems(atoms: BrainRecallAtom[]): MemoryDrawerItem[] {
  return atoms.map((atom) => ({
    id: atom.id,
    type: atom.type,
    scope: atom.scope,
    text: cleanAtomText(atom.text) || atom.text,
    meta: formatContributors(atom.contributors),
    sensitive: atom.sensitivity === 'sensitive',
    trailing: `${Math.round(atom.score * 100)}%`,
    otherProject: atom.crossProject ? (atom.projectKey ?? 'other project') : null
  }));
}
