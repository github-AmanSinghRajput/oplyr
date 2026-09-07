import { isSecretRelativePath } from '../../lib/path-security.js';

const MAX_ATOM_TEXT_CHARS = 520;
const MIN_ATOM_TEXT_CHARS = 18;
const secretTextPatterns = [
  /-----BEGIN [A-Z ]+PRIVATE KEY-----/i,
  /\b(local_api_auth_token|vite_local_api_auth_token)\b/i,
  /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|secret|password)\s*[:=]\s*['"]?[A-Za-z0-9_\-./+=]{12,}/i,
  /\b[A-Za-z0-9+/]{40,}={0,2}\b/,
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/,
  /\bsk-[A-Za-z0-9]{20,}\b/
] as const;

// Stored memory is re-injected into every future prompt, so an atom that carries an instruction-
// override payload (captured from a hostile repo/turn) is a persistent prompt-injection vector. We
// refuse to store atoms that read like commands to the model. Patterns require a concrete object
// noun ("previous instructions", not just "ignore") to avoid nuking normal dev prose.
const injectionPatterns = [
  /\bignore\s+(all\s+|the\s+)?(previous|prior|above|earlier|preceding)\s+(instructions?|prompts?|messages?|directions?|context)\b/i,
  /\bdisregard\s+(all\s+|the\s+|everything\s+|any\s+)?(previous|prior|above|earlier|instructions?|prompts?)\b/i,
  /\bforget\s+(everything|all\s+(previous|prior)|the\s+(above|previous))\b/i,
  /\b(new|updated)\s+instructions?\s*:/i,
  /\boverride\s+(the\s+|your\s+)?(system|instructions?|rules|guidelines)\b/i,
  /<\/?\s*(system|instructions?|inst|im_start|im_end|assistant)\b/i,
  /\byou\s+are\s+now\s+(a|an|the)\b/i
] as const;

export interface BrainSafetyVerdict {
  safe: boolean;
  sensitivity: 'normal' | 'sensitive';
  reason: string | null;
}

export function normalizeAtomText(value: string) {
  return value
    .replace(/\s+/g, ' ')
    .replace(/^[\s*:]+/, '')
    .replace(/[\s;,.]+$/, '')
    .trim();
}

/**
 * Attribution phrases distillation swaps between runs — "We standardized on X" one time, "The team
 * standardized on X" the next. Stripped BEFORE determiners, so the multi-word forms match.
 */
const LEADING_SUBJECT = /^(?:the team|our team|the user|we|i|you)\s+/;

/**
 * Bare determiners. Stripped SEPARATELY from the subjects above and never together with a following
 * noun: an earlier version matched "the project" as one phrase, which deleted a MEANINGFUL noun and
 * left "The project uses Tailwind" and "Project uses Tailwind" with different keys — the exact
 * duplicate it was meant to collapse.
 */
const LEADING_DETERMINER = /^(?:the|a|an|this|that|it)\s+/;

/**
 * The dedup key for an atom. Two atoms with the same key are the same memory, and `source_hash` is
 * built from it, so this decides what counts as a duplicate.
 *
 * Deliberately LEXICAL, not semantic. Embedding similarity looks like the obvious tool here and is
 * unusable for it: measured on the bundled MiniLM, "Auto-send is off by default" and "Auto-send is
 * on by default" score 0.953 cosine — higher than genuine paraphrases like "Never commit secrets to
 * the repo" / "Do not commit secrets into the repository" at 0.847. The distributions overlap, so
 * any threshold that catches real duplicates also merges facts with their own negations, silently
 * destroying the correct memory. A duplicate is recoverable; a wrong merge is not.
 *
 * Normalising the text instead collapses the rewording that distillation actually produces, and
 * cannot confuse a fact with its negation because "off" and "on" remain different strings.
 */
export function normalizeAtomKey(value: string) {
  let key = normalizeAtomText(value)
    .toLowerCase()
    .replace(/[`"'()[\]{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Subjects first (they contain determiners), then bare determiners. Each can stack, and neither
  // may reduce the key to nothing.
  for (const pattern of [LEADING_SUBJECT, LEADING_DETERMINER]) {
    for (let pass = 0; pass < 2; pass += 1) {
      const stripped = key.replace(pattern, '');
      if (stripped === key || stripped.length === 0) {
        break;
      }
      key = stripped;
    }
  }

  return key.trim();
}

export function clipAtomText(value: string) {
  const normalized = normalizeAtomText(value);
  if (normalized.length <= MAX_ATOM_TEXT_CHARS) {
    return normalized;
  }

  return `${normalized.slice(0, MAX_ATOM_TEXT_CHARS - 3).trim()}...`;
}

export function checkBrainAtomSafety(text: string): BrainSafetyVerdict {
  const normalized = normalizeAtomText(text);
  if (normalized.length < MIN_ATOM_TEXT_CHARS) {
    return { safe: false, sensitivity: 'normal', reason: 'too_short' };
  }

  if (normalized.length > MAX_ATOM_TEXT_CHARS * 2) {
    return { safe: false, sensitivity: 'normal', reason: 'too_long' };
  }

  if (injectionPatterns.some((pattern) => pattern.test(normalized))) {
    return { safe: false, sensitivity: 'normal', reason: 'prompt_injection' };
  }

  if (secretTextPatterns.some((pattern) => pattern.test(normalized))) {
    return { safe: true, sensitivity: 'sensitive', reason: 'secret_like_text' };
  }

  for (const token of extractPathLikeTokens(normalized)) {
    if (isSecretRelativePath(token)) {
      return { safe: true, sensitivity: 'sensitive', reason: 'protected_path' };
    }
  }

  return { safe: true, sensitivity: 'normal', reason: null };
}

export function redactMemoryText(text: string) {
  return text
    .split('\n')
    .map((line) => (checkRawLineSafety(line).safe ? redactSecretAssignments(line) : '[REDACTED]'))
    .join('\n')
    .trim();
}

function checkRawLineSafety(line: string): BrainSafetyVerdict {
  const normalized = normalizeAtomText(line);
  if (!normalized) {
    return { safe: true, sensitivity: 'normal', reason: null };
  }

  if (secretTextPatterns.some((pattern) => pattern.test(normalized))) {
    return { safe: false, sensitivity: 'sensitive', reason: 'secret_like_text' };
  }

  for (const token of extractPathLikeTokens(normalized)) {
    if (isSecretRelativePath(token)) {
      return { safe: false, sensitivity: 'sensitive', reason: 'protected_path' };
    }
  }

  return { safe: true, sensitivity: 'normal', reason: null };
}

function redactSecretAssignments(line: string) {
  return line.replace(
    /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|secret|password)\s*[:=]\s*['"]?[^\s'"]+/gi,
    '$1=[REDACTED]'
  );
}

function extractPathLikeTokens(text: string) {
  return text
    .split(/\s+/)
    .map((token) => token.replace(/^[`'",([{]+|[`'",)\]}:;.!?]+$/g, ''))
    .filter((token) => token.includes('/') || token.startsWith('.') || token.includes('\\'));
}
