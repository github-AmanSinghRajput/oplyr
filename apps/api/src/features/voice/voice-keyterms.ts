/**
 * Keyterm extraction for on-device speech biasing.
 *
 * Parakeet transcribes general English well and mangles the words that matter most in a coding
 * session: the project's own name, its branch, its filenames, its libraries. FluidAudio can bias
 * decoding toward a supplied vocabulary, so we hand it the terms this workspace actually uses.
 *
 * Deliberately PURE and I/O-free: callers pass the workspace facts in, which keeps extraction fast
 * (no model, no LLM, no disk walk on the voice path) and makes the behaviour testable. Distilling
 * memory is the slow, model-driven job; this is not that, and the two must not be conflated.
 */

/** A term plus how hard to bias toward it. Weight range matches FluidAudio's rescorer. */
export interface Keyterm {
  text: string;
  weight: number;
}

export interface KeytermInput {
  /** Basename of the connected project folder, e.g. "vocod". */
  projectName?: string | null;
  /** Current git branch, e.g. "revamp/audit-fixes". */
  branch?: string | null;
  /** Workspace-relative file paths. Only the leaf names are used. */
  filePaths?: string[];
  /** Dependency names from package.json / imports, already de-scoped. */
  dependencies?: string[];
}

/** FluidAudio's rescorer degrades with very large vocabularies, and this runs per session. */
export const MAX_KEYTERMS = 100;

const WEIGHT = {
  project: 3.5,
  branch: 2.5,
  dependency: 2.2,
  filename: 2,
  fragment: 1.4,
  base: 1.6
} as const;

/**
 * Terms a coding session leans on that general English models routinely mishear
 * ("depend and see" for "dependency", "get hub" for "GitHub"). Kept small and stable — this is not
 * a dictionary, it is the short list that actually breaks.
 */
const BASE_CODING_TERMS = [
  'refactor',
  'repo',
  'commit',
  'rebase',
  'merge conflict',
  'pull request',
  'TypeScript',
  'JavaScript',
  'Python',
  'Swift',
  'async',
  'await',
  'boolean',
  'enum',
  'schema',
  'migration',
  'endpoint',
  'middleware',
  'dependency',
  'lint',
  'stack trace',
  'null',
  'undefined',
  'regex',
  'JSON',
  'YAML',
  'SQL',
  'SQLite',
  'API',
  'CLI',
  'UUID',
  'localhost',
  'GitHub',
  'npm',
  'Electron',
  'React'
];

/** Words too short or too generic to be worth biasing — they only add false positives. */
const STOP_FRAGMENTS = new Set([
  'src',
  'lib',
  'app',
  'apps',
  'index',
  'main',
  'test',
  'tests',
  'spec',
  'util',
  'utils',
  'type',
  'types',
  'the',
  'and',
  'new',
  'old',
  'tmp',
  'temp',
  'dist',
  'build',
  'node',
  'js',
  'ts',
  'tsx',
  'css'
]);

/** Split camelCase / PascalCase / kebab-case / snake_case / dot.case into component words. */
export function splitIdentifier(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
}

/** Strip a path down to its filename without extension. */
function leafName(filePath: string): string {
  const leaf = filePath.split(/[\\/]/).filter(Boolean).pop() ?? '';
  // Drop only the final extension: "voice-keyterms.test.ts" → "voice-keyterms.test".
  return leaf.replace(/\.[A-Za-z0-9]+$/, '');
}

function isUsefulFragment(word: string): boolean {
  return word.length >= 4 && !STOP_FRAGMENTS.has(word.toLowerCase()) && !/^\d+$/.test(word);
}

/**
 * Build the biasing vocabulary for a workspace, highest-value terms first so a caller that trims
 * the list keeps the ones that matter. Names are emitted whole AND split into their component words,
 * because a user says "the memory import panel", not "MemoryImportPanel".
 */
export function buildKeyterms(input: KeytermInput): Keyterm[] {
  const byKey = new Map<string, Keyterm>();

  // First write wins, so higher-value sources are added first and never demoted by a later repeat.
  const add = (text: string, weight: number) => {
    const trimmed = text.trim();
    if (trimmed.length < 2) {
      return;
    }
    const key = trimmed.toLowerCase();
    if (!byKey.has(key)) {
      byKey.set(key, { text: trimmed, weight });
    }
  };

  if (input.projectName) {
    add(input.projectName, WEIGHT.project);
    for (const word of splitIdentifier(input.projectName)) {
      if (isUsefulFragment(word)) {
        add(word, WEIGHT.project);
      }
    }
  }

  if (input.branch) {
    // "revamp/audit-fixes" is never said aloud whole — the words in it are.
    for (const word of splitIdentifier(input.branch)) {
      if (isUsefulFragment(word)) {
        add(word, WEIGHT.branch);
      }
    }
  }

  for (const dependency of input.dependencies ?? []) {
    add(dependency, WEIGHT.dependency);
  }

  const fragments = new Map<string, number>();
  for (const filePath of input.filePaths ?? []) {
    const leaf = leafName(filePath);
    if (!leaf) {
      continue;
    }
    const words = splitIdentifier(leaf);
    // A multi-word identifier read aloud as a phrase ("memory import panel").
    const phrase = words.filter(isUsefulFragment).join(' ');
    if (words.length > 1 && phrase.includes(' ')) {
      add(phrase, WEIGHT.filename);
    }
    for (const word of words) {
      if (isUsefulFragment(word)) {
        fragments.set(word, (fragments.get(word) ?? 0) + 1);
      }
    }
  }

  // Recurring fragments are the project's real vocabulary; one-offs are noise.
  for (const [word] of [...fragments.entries()].sort((a, b) => b[1] - a[1])) {
    add(word, WEIGHT.fragment);
  }

  for (const term of BASE_CODING_TERMS) {
    add(term, WEIGHT.base);
  }

  return [...byKey.values()].slice(0, MAX_KEYTERMS);
}
