import fs from 'node:fs/promises';
import path from 'node:path';

import { isSecretRelativePath, resolveWorkspacePath } from '../../lib/path-security.js';
import { scanWorkspace } from '../codebase-map/scanner.js';

const MARKDOWN_EXTENSIONS = new Set(['.md', '.mdx', '.markdown']);
// Don't stream an unbounded file into the renderer; markdown docs are small in practice.
const MAX_CONTENT_BYTES = 1_000_000;

export interface MarkdownFileEntry {
  path: string;
  name: string;
  dir: string;
}

export interface MarkdownContentResult {
  path: string;
  content: string | null;
  error?: string;
}

export class MarkdownService {
  /**
   * List every markdown file in the workspace. Reuses the codebase scanner's boundary-safe walk,
   * which already skips build/VCS/cache dirs, hidden dirs, and secret-policy paths.
   */
  async listFiles(rootPath: string): Promise<MarkdownFileEntry[]> {
    const files = await scanWorkspace(rootPath);
    return files
      .filter((file) => MARKDOWN_EXTENSIONS.has(file.ext))
      .map((file) => ({ path: file.path, name: file.name, dir: file.dir }));
  }

  /** Read one markdown file's contents, enforcing the workspace boundary + secret policy + a size cap. */
  async readFile(rootPath: string, filePath: string): Promise<MarkdownContentResult> {
    const normalized = filePath.replace(/\\/g, '/').replace(/^\/+/, '');

    if (!MARKDOWN_EXTENSIONS.has(path.extname(normalized).toLowerCase())) {
      return { path: normalized, content: null, error: 'Not a markdown file.' };
    }
    if (isSecretRelativePath(normalized)) {
      return {
        path: normalized,
        content: null,
        error: 'This file is protected by the secret policy.'
      };
    }

    const resolved = await resolveWorkspacePath(rootPath, normalized);
    if (resolved.escapesWorkspace || !resolved.realPath) {
      return { path: normalized, content: null, error: 'File is outside the workspace.' };
    }

    try {
      const stats = await fs.stat(resolved.absolutePath);
      if (!stats.isFile()) {
        return { path: normalized, content: null, error: 'Not a file.' };
      }
      if (stats.size > MAX_CONTENT_BYTES) {
        return { path: normalized, content: null, error: 'File is too large to preview.' };
      }
      const content = await fs.readFile(resolved.absolutePath, 'utf8');
      return { path: normalized, content };
    } catch {
      return { path: normalized, content: null, error: 'Could not read this file.' };
    }
  }
}
