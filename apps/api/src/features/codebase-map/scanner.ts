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
  '.ts': 'TypeScript',
  '.tsx': 'TypeScript',
  '.mts': 'TypeScript',
  '.cts': 'TypeScript',
  '.js': 'JavaScript',
  '.jsx': 'JavaScript',
  '.mjs': 'JavaScript',
  '.cjs': 'JavaScript',
  '.py': 'Python',
  '.rb': 'Ruby',
  '.go': 'Go',
  '.rs': 'Rust',
  '.java': 'Java',
  '.kt': 'Kotlin',
  '.swift': 'Swift',
  '.c': 'C',
  '.h': 'C',
  '.cpp': 'C++',
  '.cc': 'C++',
  '.cs': 'C#',
  '.php': 'PHP',
  '.css': 'CSS',
  '.scss': 'CSS',
  '.html': 'HTML',
  '.json': 'JSON',
  '.md': 'Markdown',
  '.sql': 'SQL',
  '.sh': 'Shell',
  '.yml': 'YAML',
  '.yaml': 'YAML'
};

const JS_TS_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']);

export function isSourceFile(ext: string): boolean {
  return JS_TS_EXTENSIONS.has(ext);
}

function languageForExt(ext: string): string {
  return LANGUAGE_BY_EXT[ext] ?? 'Other';
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
          language: languageForExt(ext)
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
