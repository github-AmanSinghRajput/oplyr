// Lightweight, dependency-free extraction of the "functions a file has" for the file-node expand
// list. Heuristic (regex/line-based), not a full AST — good enough to surface top-level functions,
// arrow-function consts, and classes for a developer to scan and summarize.

export type SymbolKind = 'function' | 'class' | 'component';

export interface FileSymbol {
  name: string;
  kind: SymbolKind;
  line: number;
  exported: boolean;
}

const MAX_SYMBOLS = 200;

// Matchers run per line; the first that hits wins for that line.
const PATTERNS: { re: RegExp; kind: SymbolKind; nameGroup: number }[] = [
  // export default function Foo(
  {
    re: /^\s*export\s+default\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)/,
    kind: 'function',
    nameGroup: 1
  },
  // [export] [async] function foo(
  {
    re: /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(/,
    kind: 'function',
    nameGroup: 1
  },
  // [export] class Foo
  { re: /^\s*(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z0-9_$]+)/, kind: 'class', nameGroup: 1 },
  // [export] const foo = [async] (args) => | function
  {
    re: /^\s*(?:export\s+)?const\s+([A-Za-z0-9_$]+)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z0-9_$]+)\s*=>/,
    kind: 'function',
    nameGroup: 1
  },
  {
    re: /^\s*(?:export\s+)?const\s+([A-Za-z0-9_$]+)\s*(?::[^=]+)?=\s*(?:async\s+)?function\b/,
    kind: 'function',
    nameGroup: 1
  }
];

/** Extract top-level functions / arrow consts / classes from JS/TS source. */
export function extractSymbols(source: string): FileSymbol[] {
  const lines = source.split('\n');
  const out: FileSymbol[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < lines.length; i += 1) {
    if (out.length >= MAX_SYMBOLS) break;
    const line = lines[i];
    for (const pattern of PATTERNS) {
      const match = pattern.re.exec(line);
      if (!match) continue;
      const name = match[pattern.nameGroup];
      if (!name || seen.has(name)) break;
      seen.add(name);
      // A capitalized function/arrow in a .tsx-style file reads as a React component; label it so.
      const kind: SymbolKind =
        pattern.kind === 'function' && /^[A-Z]/.test(name) ? 'component' : pattern.kind;
      out.push({ name, kind, line: i + 1, exported: /^\s*export\b/.test(line) });
      break;
    }
  }

  return out;
}
