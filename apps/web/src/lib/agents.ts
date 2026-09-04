import type { AssistantProviderId } from '@/containers/voice-console/lib/types';

/**
 * Per-agent identity metadata — the vendor line and brand accent that go alongside the vendor logo.
 *
 * The logos themselves live in `@/components/providers/ProviderLogo` (real vendor artwork). This
 * module carries only what the logo can't: who makes the agent, and a color the UI can tint with so
 * agents are told apart at a glance in lists and cards.
 */

interface AgentIdentity {
  /** Full product name, e.g. "Claude Code". */
  label: string;
  /** One-word name for tight spaces (chips, mentions, the topbar). */
  short: string;
  vendor: string;
  /** Brand accent, matched to the vendor mark. Drives eyebrow text and card accent rules. */
  accent: string;
}

export const AGENTS: Record<AssistantProviderId, AgentIdentity> = {
  codex: { label: 'Codex', short: 'Codex', vendor: 'OpenAI', accent: '#10a37f' },
  claude: { label: 'Claude Code', short: 'Claude', vendor: 'Anthropic', accent: '#d97757' },
  gemini: { label: 'Gemini CLI', short: 'Gemini', vendor: 'Google', accent: '#4285f4' }
};

export const AGENT_ORDER: AssistantProviderId[] = ['codex', 'claude', 'gemini'];

export function agentAccent(id: AssistantProviderId): string {
  return AGENTS[id]?.accent ?? 'var(--color-accent)';
}

/** A translucent wash of the agent's accent — safe on both light and dark surfaces. */
export function agentTint(id: AssistantProviderId, percent = 14): string {
  return `color-mix(in oklab, ${agentAccent(id)} ${percent}%, transparent)`;
}
