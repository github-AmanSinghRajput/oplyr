import fs from 'node:fs/promises';
import path from 'node:path';

import { isSecretRelativePath } from '../../lib/path-security.js';
import type { CodebaseTreeNode, ScannedFile } from './codebase-map.types.js';

// Directories that never belong in a code map (build output, deps, VCS, caches).
const IGNORED_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  'out',
  '.next',
  '.turbo',
  '.cache',
  '.vercel',
  '.git',
  '.idea',
  '.vscode',
  'coverage',
  'vendor',
  '.venv',
  'venv',
  '__pycache__',
  'target',
  '.gradle',
  'Pods'
]);

// Safety cap so an enormous monorepo can't make a scan run unbounded.
const MAX_FILES = 6000;

const LANGUAGE_BY_EXT: Record<string, string> = {
  // Source
  '.ts': 'TypeScript',
  '.tsx': 'TypeScript',
  '.mts': 'TypeScript',
  '.cts': 'TypeScript',
  '.js': 'JavaScript',
  '.jsx': 'JavaScript',
  '.mjs': 'JavaScript',
  '.cjs': 'JavaScript',
  '.py': 'Python',
  '.pyi': 'Python',
  '.rb': 'Ruby',
  '.go': 'Go',
  '.rs': 'Rust',
  '.java': 'Java',
  '.kt': 'Kotlin',
  '.kts': 'Kotlin',
  '.swift': 'Swift',
  '.c': 'C',
  '.h': 'C',
  '.hpp': 'C++',
  '.cpp': 'C++',
  '.cc': 'C++',
  '.cs': 'C#',
  '.php': 'PHP',
  '.lua': 'Lua',
  '.r': 'R',
  '.dart': 'Dart',
  '.ex': 'Elixir',
  '.exs': 'Elixir',
  '.scala': 'Scala',
  '.clj': 'Clojure',
  '.hs': 'Haskell',
  '.pl': 'Perl',
  '.jl': 'Julia',
  '.zig': 'Zig',
  '.nim': 'Nim',
  // Web / styles / markup
  '.css': 'CSS',
  '.scss': 'CSS',
  '.sass': 'CSS',
  '.less': 'CSS',
  '.html': 'HTML',
  '.htm': 'HTML',
  '.vue': 'Vue',
  '.svelte': 'Svelte',
  '.astro': 'Astro',
  '.xml': 'XML',
  // Config / data
  '.json': 'JSON',
  '.jsonc': 'JSON',
  '.json5': 'JSON',
  '.yml': 'YAML',
  '.yaml': 'YAML',
  '.toml': 'TOML',
  '.ini': 'Config',
  '.cfg': 'Config',
  '.conf': 'Config',
  '.properties': 'Config',
  '.lock': 'Lockfile',
  '.csv': 'Data',
  '.tsv': 'Data',
  '.graphql': 'GraphQL',
  '.gql': 'GraphQL',
  '.proto': 'Protobuf',
  // Infra
  '.tf': 'Terraform',
  '.hcl': 'HCL',
  '.gradle': 'Gradle',
  '.cmake': 'CMake',
  // Docs / text
  '.md': 'Markdown',
  '.mdx': 'Markdown',
  '.rst': 'reStructuredText',
  '.txt': 'Text',
  '.adoc': 'AsciiDoc',
  '.tex': 'LaTeX',
  // Query / scripts
  '.sql': 'SQL',
  '.sh': 'Shell',
  '.bash': 'Shell',
  '.zsh': 'Shell',
  '.fish': 'Shell',
  '.ps1': 'PowerShell',
  '.bat': 'Batch'
};

// Files with no extension (or a leading-dot name) still worth mapping, keyed by exact basename.
const LANGUAGE_BY_FILENAME: Record<string, string> = {
  dockerfile: 'Docker',
  makefile: 'Make',
  rakefile: 'Ruby',
  gemfile: 'Ruby',
  procfile: 'Config',
  license: 'Docs',
  // NB: entries here only become nodes if they also pass isSecretRelativePath. Secret-ish dotfiles
  // (.npmrc, .netrc, …) are blocked upstream by the secret policy and intentionally omitted here.
  '.gitignore': 'Config',
  '.dockerignore': 'Config',
  '.nvmrc': 'Config',
  '.editorconfig': 'Config',
  '.prettierrc': 'Config',
  '.eslintrc': 'Config'
};

// Binary/media/generated extensions — never useful as map nodes (kept out to avoid noise).
const NON_MAPPABLE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.webp',
  '.ico',
  '.bmp',
  '.tiff',
  '.avif',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.eot',
  '.mp4',
  '.mov',
  '.avi',
  '.mp3',
  '.wav',
  '.flac',
  '.ogg',
  '.webm',
  '.zip',
  '.tar',
  '.gz',
  '.tgz',
  '.bz2',
  '.7z',
  '.rar',
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.bin',
  '.o',
  '.a',
  '.class',
  '.pyc',
  '.pyo',
  '.map',
  '.wasm',
  '.node',
  '.pack',
  '.snap'
]);

const JS_TS_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']);
const PYTHON_EXTENSIONS = new Set(['.py', '.pyi']);
// Languages the codebase map parses for dependency EDGES + symbols. Other file types still render
// as nodes (so the whole repo is visible) — they just carry no import edges.
const SUPPORTED_SOURCE_EXTENSIONS = new Set([...JS_TS_EXTENSIONS, ...PYTHON_EXTENSIONS]);

// Human-readable list for the UI banner: the languages we can trace imports for.
export const SUPPORTED_MAP_LANGUAGES = ['TypeScript', 'JavaScript', 'Python'];

export function isSourceFile(ext: string): boolean {
  return SUPPORTED_SOURCE_EXTENSIONS.has(ext);
}

export function isPythonFile(ext: string): boolean {
  return PYTHON_EXTENSIONS.has(ext);
}

/**
 * Whether a file is worth rendering as a graph node. Broad on purpose ("max coverage"): everything
 * except known binary/media/generated files and minified bundles. This is why a Python repo's
 * .yml / .txt / .json / lockfiles / Dockerfiles all appear on the canvas, not just .py sources.
 */
export function isMappableFile(name: string, ext: string): boolean {
  if (NON_MAPPABLE_EXTENSIONS.has(ext)) {
    return false;
  }
  const lower = name.toLowerCase();
  if (lower.endsWith('.min.js') || lower.endsWith('.min.css') || lower.endsWith('.map')) {
    return false;
  }
  return true;
}

function languageForFile(name: string, ext: string): string {
  if (ext && LANGUAGE_BY_EXT[ext]) {
    return LANGUAGE_BY_EXT[ext];
  }
  return LANGUAGE_BY_FILENAME[name.toLowerCase()] ?? 'Other';
}

function topLevelDir(relPath: string): string {
  const segments = relPath.split('/');
  return segments.length > 1 ? segments[0] : '.';
}

/**
 * Walk the workspace within its boundary and collect files. Skips ignored build/VCS/cache
 * directories, every hidden directory, and any path flagged by the secret policy (those file
 * contents are never read or surfaced).
 */
export async function scanWorkspace(rootPath: string): Promise<ScannedFile[]> {
  const files: ScannedFile[] = [];

  async function walk(absDir: string, relDir: string): Promise<void> {
    if (files.length >= MAX_FILES) {
      return;
    }
    const entries = await fs.readdir(absDir, { withFileTypes: true }).catch(() => null);
    if (!entries) {
      return;
    }

    for (const entry of entries) {
      if (files.length >= MAX_FILES) {
        return;
      }
      const name = entry.name;
      const rel = relDir ? `${relDir}/${name}` : name;

      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(name) || name.startsWith('.')) {
          continue;
        }
        await walk(path.join(absDir, name), rel);
      } else if (entry.isFile()) {
        if (isSecretRelativePath(rel)) {
          continue;
        }
        const ext = path.extname(name).toLowerCase();
        files.push({
          path: rel,
          name,
          ext,
          dir: topLevelDir(rel),
          language: languageForFile(name, ext)
        });
      }
    }
  }

  await walk(rootPath, '');
  files.sort((a, b) => a.path.localeCompare(b.path));
  return files;
}

/** Build a nested folder/file tree from a flat scanned-file list (for the sidebar). */
export function buildTree(files: ScannedFile[]): CodebaseTreeNode[] {
  const root: CodebaseTreeNode = { name: '.', path: '', type: 'dir', children: [] };

  for (const file of files) {
    const segments = file.path.split('/');
    let cursor = root;
    let cursorPath = '';

    for (let i = 0; i < segments.length; i += 1) {
      const segment = segments[i];
      const isLeaf = i === segments.length - 1;
      cursorPath = cursorPath ? `${cursorPath}/${segment}` : segment;

      if (isLeaf) {
        cursor.children?.push({
          name: segment,
          path: file.path,
          type: 'file',
          language: file.language
        });
        continue;
      }

      let child = cursor.children?.find((node) => node.type === 'dir' && node.name === segment);
      if (!child) {
        child = { name: segment, path: cursorPath, type: 'dir', children: [] };
        cursor.children?.push(child);
      }
      cursor = child;
    }
  }

  // Folders first, then files; alphabetical within each group.
  const sortChildren = (node: CodebaseTreeNode): void => {
    if (!node.children) {
      return;
    }
    node.children.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'dir' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
    for (const child of node.children) {
      sortChildren(child);
    }
  };
  sortChildren(root);

  return root.children ?? [];
}
