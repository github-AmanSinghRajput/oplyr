/**
 * Playful "the agent is working" phrases, shown to keep the user engaged during stretches where the
 * agent emits no concrete activity event (e.g. long model reasoning). When a real activity IS known
 * (`Reading page.tsx`, `Searching for …`), that is shown verbatim instead — see AgentActivityIndicator.
 */
export const AGENT_FALLBACK_PHRASES: readonly string[] = [
  'Thinking it through…',
  'Digging deeper…',
  'Reading between the lines…',
  'Connecting the dots…',
  'Consulting the codebase…',
  'Following the thread…',
  'Untangling the logic…',
  'Piecing it together…',
  'Weighing the options…',
  'Chasing down the details…',
  'Lining things up…',
  'Almost there…'
];

/**
 * Pick a fallback phrase for a rotation tick. Pure + wrapping so callers can drive it from a simple
 * incrementing counter without bounds-checking.
 */
export function getFallbackPhrase(tick: number): string {
  const count = AGENT_FALLBACK_PHRASES.length;
  const index = ((tick % count) + count) % count;
  return AGENT_FALLBACK_PHRASES[index];
}
