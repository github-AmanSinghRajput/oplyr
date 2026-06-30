import fs from 'node:fs/promises';
import path from 'node:path';

import type { CodebaseEdge, ScannedFile } from './codebase-map.types.js';
import { isPythonFile } from './scanner.js';

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

// ── Python import resolution ─────────────────────────────────────────────────────────────────
const PY_INIT = '__init__.py';

/** Map a dotted/relative module base (POSIX path, no extension) to a known .py file, if any. */
function pyFileCandidate(base: string, known: Set<string>): string | null {
  const norm = base.replace(/^\.\//, '').replace(/^\/+/, '');
  if (!norm) return null;
  for (const candidate of [`${norm}.py`, `${norm}.pyi`, path.posix.join(norm, PY_INIT)]) {
    if (known.has(candidate)) return candidate;
  }
  return null;
}

/**
 * Resolve an absolute dotted module (`a.b.c`) by trying it as a path from the repo root, then
 * progressively dropping leading segments — so it works whether the package sits at the repo root,
 * under `src/`, or is referenced by its full dotted path. Most-specific (longest) match wins.
 */
function resolveAbsolutePython(segments: string[], known: Set<string>): string | null {
  for (let start = 0; start < segments.length; start += 1) {
    const hit = pyFileCandidate(segments.slice(start).join('/'), known);
    if (hit) return hit;
  }
  return null;
}

/** Best-effort Python import edges: handles `import a.b`, `from a.b import c`, and relative `from .x`. */
function resolvePythonEdges(fromPath: string, source: string, known: Set<string>): string[] {
  const targets = new Set<string>();

  for (const line of source.split('\n')) {
    // from <dots><module> import <names>
    const fromMatch = /^[ \t]*from[ \t]+(\.*)([\w.]*)[ \t]+import[ \t]+(.+)$/.exec(line);
    if (fromMatch) {
      const dots = fromMatch[1].length;
      const moduleSegs = fromMatch[2] ? fromMatch[2].split('.') : [];
      const names = fromMatch[3]
        .replace(/[()\\]/g, ' ')
        .split(',')
        .map((entry) =>
          entry
            .trim()
            .split(/\s+as\s+/)[0]
            .trim()
        )
        .filter((entry) => entry && entry !== '*');

      if (dots > 0) {
        // Relative import: base dir = this file's dir, then up (dots - 1) levels.
        let dir = path.posix.dirname(fromPath);
        for (let i = 1; i < dots; i += 1) dir = path.posix.dirname(dir);
        if (moduleSegs.length > 0) {
          const moduleHit = pyFileCandidate(path.posix.join(dir, ...moduleSegs), known);
          if (moduleHit) targets.add(moduleHit);
          for (const name of names) {
            const submoduleHit = pyFileCandidate(path.posix.join(dir, ...moduleSegs, name), known);
            if (submoduleHit) targets.add(submoduleHit);
          }
        } else {
          // `from . import x, y` → sibling modules.
          for (const name of names) {
            const hit = pyFileCandidate(path.posix.join(dir, name), known);
            if (hit) targets.add(hit);
          }
        }
      } else if (moduleSegs.length > 0) {
        const moduleHit = resolveAbsolutePython(moduleSegs, known);
        if (moduleHit) targets.add(moduleHit);
        // `from a.b import c` where c is itself a submodule file.
        for (const name of names) {
          const submoduleHit = resolveAbsolutePython([...moduleSegs, name], known);
          if (submoduleHit) targets.add(submoduleHit);
        }
      }
      continue;
    }

    // import a, a.b.c, a as x
    const importMatch = /^[ \t]*import[ \t]+(.+)$/.exec(line);
    if (importMatch) {
      const body = importMatch[1].split('#')[0];
      for (const part of body.split(',')) {
        const moduleName = part
          .trim()
          .split(/\s+as\s+/)[0]
          .trim();
        if (!moduleName || !/^[\w.]+$/.test(moduleName)) continue;
        const hit = resolveAbsolutePython(moduleName.split('.'), known);
        if (hit) targets.add(hit);
      }
    }
  }

  targets.delete(fromPath);
  return [...targets];
}

/**
 * Parse dependency edges between source files. JS/TS files resolve import/require/export-from
 * (relative + tsconfig alias + baseUrl); Python files resolve import / from-import (absolute +
 * relative). Only edges between two files present in `sourceFiles` are returned. Best-effort and
 * resilient — an unreadable file is skipped, never thrown.
 */
export async function parseDependencies(
  rootPath: string,
  sourceFiles: ScannedFile[]
): Promise<CodebaseEdge[]> {
  const config = await loadAliasConfig(rootPath);
  const known = new Set(sourceFiles.map((file) => file.path));
  const seen = new Set<string>();
  const edges: CodebaseEdge[] = [];

  const addEdge = (from: string, to: string) => {
    if (!to || to === from) return;
    const key = `${from} ${to}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ from, to });
  };

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

    if (isPythonFile(file.ext)) {
      for (const target of resolvePythonEdges(file.path, source, known)) {
        addEdge(file.path, target);
      }
      continue;
    }

    for (const specifier of extractSpecifiers(source)) {
      const target = resolveSpecifier(file.path, specifier, known, config);
      if (target) addEdge(file.path, target);
    }
  }

  return edges;
}
