import fsp from 'node:fs/promises';
import path from 'node:path';
import { buildKeyterms, type Keyterm } from './voice-keyterms.js';
import { logger } from '../../lib/logger.js';

/**
 * Gather the workspace facts that feed speech biasing, then build the vocabulary.
 *
 * Runs on the voice hot path — a session is waiting on it — so everything here is deliberately
 * cheap: no subprocess, no recursive walk, no model, no LLM. The branch comes from reading
 * `.git/HEAD` directly rather than shelling out to git, and file names come from a single shallow
 * listing of the source directories rather than a full scan. Every input is optional; a missing one
 * just means a smaller vocabulary.
 */

/** Directories worth naming aloud. A full walk is far too slow for session start. */
const SOURCE_DIRS = ['src', 'app', 'apps', 'lib', 'components', 'packages'];
const CODE_FILE = /\.(ts|tsx|js|jsx|mjs|cjs|swift|py|go|rs|rb|java|kt|css|scss)$/;
/** Enough names to characterise the project's vocabulary without scanning everything. */
const MAX_FILES = 400;

async function readBranch(projectRoot: string): Promise<string | null> {
  try {
    // "ref: refs/heads/revamp/audit-fixes" → "revamp/audit-fixes". A detached HEAD is a raw sha,
    // which carries no words worth biasing, so it's dropped.
    const head = await fsp.readFile(path.join(projectRoot, '.git', 'HEAD'), 'utf8');
    const match = head.trim().match(/^ref:\s*refs\/heads\/(.+)$/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

async function readDependencies(projectRoot: string): Promise<string[]> {
  try {
    const raw = await fsp.readFile(path.join(projectRoot, 'package.json'), 'utf8');
    const pkg = JSON.parse(raw) as {
      dependencies?: Record<string, unknown>;
      devDependencies?: Record<string, unknown>;
    };
    const names = [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {})
    ];
    // "@xenova/transformers" is said as "transformers" — the scope is never spoken.
    return names.map((name) => (name.startsWith('@') ? name.split('/').pop() || name : name));
  } catch {
    return [];
  }
}

/** Shallow, breadth-limited listing of the usual source directories. */
async function listFileNames(projectRoot: string): Promise<string[]> {
  const found: string[] = [];
  const queue: string[] = [projectRoot];
  let depth = 0;

  while (queue.length > 0 && found.length < MAX_FILES && depth < 4) {
    const level = queue.splice(0, queue.length);
    depth += 1;
    for (const dir of level) {
      if (found.length >= MAX_FILES) break;
      let entries;
      try {
        entries = await fsp.readdir(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (found.length >= MAX_FILES) break;
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          // Below the root, follow anything; at the root, only the conventional source dirs.
          if (dir !== projectRoot || SOURCE_DIRS.includes(entry.name)) queue.push(full);
        } else if (CODE_FILE.test(entry.name)) {
          found.push(entry.name);
        }
      }
    }
  }
  return found;
}

/** The biasing vocabulary for a connected project, or [] when there's nothing to work from. */
export async function collectWorkspaceKeyterms(projectRoot: string | null): Promise<Keyterm[]> {
  if (!projectRoot) {
    // No project: still bias toward the coding terms that get misheard everywhere.
    return buildKeyterms({});
  }

  try {
    const [branch, dependencies, filePaths] = await Promise.all([
      readBranch(projectRoot),
      readDependencies(projectRoot),
      listFileNames(projectRoot)
    ]);

    return buildKeyterms({
      projectName: path.basename(projectRoot),
      branch,
      dependencies,
      filePaths
    });
  } catch (error) {
    // Biasing is an accuracy improvement, never a prerequisite for speaking.
    logger.warn('voice.keyterms.collect_failed', {
      error: error instanceof Error ? error.message : String(error)
    });
    return buildKeyterms({});
  }
}
