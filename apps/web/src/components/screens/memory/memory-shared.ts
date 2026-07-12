import type { AssistantProviderId, BrainAtomType } from '@/containers/voice-console/lib/types';

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
