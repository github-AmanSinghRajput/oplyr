import fs from 'node:fs/promises';
import path from 'node:path';

import type { CodebaseEdge, ScannedFile } from './codebase-map.types.js';

// Matches the specifier string in: `import ... from 'x'`, `import 'x'`, `export ... from 'x'`,
// `require('x')`, and dynamic `import('x')`. We capture every quoted module specifier and classify
// it later (relative / tsconfig-alias / baseUrl / external).
// `import x from 'm'`, `export … from 'm'`, side-effect `import 'm'` (requires whitespace so it
// doesn't match the word "import" mid-text), dynamic `import('m')`, and `require('m')`.
const SPECIFIER_PATTERN =
  /(?:import\s+[^;'"]*?\s+from\s*|export\s+[^;'"]*?\s+from\s*|import\s+|import\s*\(\s*|require\s*\(\s*)['"]([^'"\n]+)['"]/g;

const RESOLVE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts'];
const INDEX_FILES = RESOLVE_EXTENSIONS.map((ext) => `index${ext}`);
const MAX_PARSE_BYTES = 400_000;

interface AliasEntry {
  /** Prefix to match, e.g. "@/" or an exact specifier like "config". */
  prefix: string;
  /** Workspace-relative POSIX base the prefix maps to, e.g. "src" or "". */
  target: string;
  /** Whether the original pattern ended with "*" (prefix match) vs an exact mapping. */
  wildcard: boolean;
}

interface AliasConfig {
  /** Workspace-relative POSIX baseUrl directory ("" = repo root), or null if unset. */
  baseUrl: string | null;
  aliases: AliasEntry[];
}

/** Strip // and /* *\/ comments and trailing commas so a JSONC tsconfig parses. */
function parseJsonc(raw: string): unknown {
  const withoutComments = raw
    .replace(/\\"|"(?:\\"|[^"])*"|(\/\/[^\n\r]*|\/\*[\s\S]*?\*\/)/g, (match, comment) =>
      comment ? '' : match
    )
    .replace(/,(\s*[}\]])/g, '$1');
  return JSON.parse(withoutComments);
}

async function loadAliasConfig(rootPath: string): Promise<AliasConfig> {
  for (const file of ['tsconfig.json', 'jsconfig.json']) {
    try {
      const raw = await fs.readFile(path.join(rootPath, file), 'utf8');
      const parsed = parseJsonc(raw) as {
        compilerOptions?: { baseUrl?: string; paths?: Record<string, string[]> };
      };
      const options = parsed.compilerOptions ?? {};
      const baseUrlRaw = typeof options.baseUrl === 'string' ? options.baseUrl : null;
      const baseUrl =
        baseUrlRaw === null
          ? null
          : path.posix
              .normalize(baseUrlRaw.replace(/\\/g, '/'))
              .replace(/^\.\/?/, '')
              .replace(/\/$/, '');
      // Paths are resolved relative to baseUrl (default ".").
      const baseDir = baseUrl ?? '';
      const aliases: AliasEntry[] = [];
      for (const [pattern, targets] of Object.entries(options.paths ?? {})) {
        const target = targets[0];
        if (!target) continue;
        const wildcard = pattern.endsWith('*');
        const prefix = wildcard ? pattern.slice(0, -1) : pattern;
        const targetClean = target.replace(/\*$/, '').replace(/\\/g, '/').replace(/^\.\//, '');
        const resolvedTarget = path.posix
          .normalize(path.posix.join(baseDir, targetClean))
          .replace(/^\.?\/?/, '')
          .replace(/\/$/, '');
        aliases.push({ prefix, target: resolvedTarget === '.' ? '' : resolvedTarget, wildcard });
      }
      // Longer prefixes first so the most specific alias wins.
      aliases.sort((a, b) => b.prefix.length - a.prefix.length);
      return { baseUrl: baseUrl === '' ? '' : baseUrl, aliases };
    } catch {
      /* try next config file */
    }
  }
  return { baseUrl: null, aliases: [] };
}

function extractSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  let match: RegExpExecArray | null;
  SPECIFIER_PATTERN.lastIndex = 0;
  while ((match = SPECIFIER_PATTERN.exec(source)) !== null) {
    specifiers.push(match[1]);
  }
  return specifiers;
}

function tryCandidates(base: string, known: Set<string>): string | null {
  // TS/ESM source commonly imports './foo.js' even though the file on disk is 'foo.ts'. Try the
  // written base first, then the same base with the JS-ish extension stripped, against TS extensions.
  const bases = [base];
  const jsLess = base.replace(/\.(m|c)?js$/, '');
  if (jsLess !== base) bases.push(jsLess);

  for (const b of bases) {
    const candidates = [
      b,
      ...RESOLVE_EXTENSIONS.map((ext) => `${b}${ext}`),
      ...INDEX_FILES.map((index) => path.posix.join(b, index))
    ];
    for (const candidate of candidates) {
      const normalized = candidate.replace(/^\.\//, '');
      if (known.has(normalized)) {
        return normalized;
      }
    }
  }
  return null;
}

/**
 * Resolve an import specifier to a known workspace file, handling: relative imports, tsconfig path
 * aliases (e.g. "@/components/x"), and baseUrl-relative bare imports. Returns null for external
 * packages / unresolved specifiers.
 */
function resolveSpecifier(
  fromPath: string,
  specifier: string,
  known: Set<string>,
  config: AliasConfig
): string | null {
  // 1. Relative imports.
  if (specifier.startsWith('.')) {
    const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromPath), specifier));
    return tryCandidates(base, known);
  }

  // 2. tsconfig path aliases (longest prefix first).
  for (const alias of config.aliases) {
    if (alias.wildcard) {
      if (specifier.startsWith(alias.prefix)) {
        const rest = specifier.slice(alias.prefix.length);
        const base = path.posix.normalize(path.posix.join(alias.target, rest));
        const hit = tryCandidates(base, known);
        if (hit) return hit;
      }
    } else if (specifier === alias.prefix) {
      const hit = tryCandidates(alias.target, known);
      if (hit) return hit;
    }
  }

  // 3. baseUrl-relative bare imports (e.g. baseUrl "src" → "components/x").
  if (config.baseUrl !== null) {
    const base = path.posix.normalize(path.posix.join(config.baseUrl, specifier));
    const hit = tryCandidates(base, known);
    if (hit) return hit;
  }

  // Otherwise it's an external package / protocol import — not part of the repo graph.
  return null;
}

/**
 * Parse import/require/export-from edges between JS/TS source files, resolving relative + aliased +
 * baseUrl imports. Only edges between two files present in `sourceFiles` are returned. Best-effort
 * and resilient — an unreadable file is skipped, never thrown.
 */
export async function parseDependencies(
  rootPath: string,
  sourceFiles: ScannedFile[]
): Promise<CodebaseEdge[]> {
  const config = await loadAliasConfig(rootPath);
  const known = new Set(sourceFiles.map((file) => file.path));
  const seen = new Set<string>();
  const edges: CodebaseEdge[] = [];

  for (const file of sourceFiles) {
    let source: string;
    try {
      const absPath = path.join(rootPath, file.path);
      const stat = await fs.stat(absPath);
      if (stat.size > MAX_PARSE_BYTES) {
        continue;
      }
      source = await fs.readFile(absPath, 'utf8');
    } catch {
      continue;
    }

    for (const specifier of extractSpecifiers(source)) {
      const target = resolveSpecifier(file.path, specifier, known, config);
      if (!target || target === file.path) {
        continue;
      }
      const key = `${file.path} ${target}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      edges.push({ from: file.path, to: target });
    }
  }

  return edges;
}
