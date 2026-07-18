import fs from 'node:fs/promises';
import path from 'node:path';

// When a workspace folder holds several projects (e.g. a parent with a backend repo AND a frontend
// repo), the codebase map needs to know which repos live inside so the user can pick one to render —
// mapping the whole parent at once would flatten unrelated repos into one graph. This walks the
// connected folder and finds git repos, stopping the moment it hits a .git (a repo's own nested
// submodules/vendored repos are not split out). Dirs that are noise (node_modules, build output)
// are skipped, and depth is bounded so a huge tree can't stall the scan.

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  '.next',
  '.turbo',
  'vendor',
  'target',
  '.venv',
  'venv',
  '__pycache__',
  '.cache',
  'coverage'
]);
const MAX_DEPTH = 4;

export interface DetectedRepo {
  /** Directory basename — shown in the repo picker. */
  name: string;
  /** Absolute path to the repo root. */
  path: string;
  /** Path relative to the connected workspace folder (`.` when the workspace itself is the repo). */
  relativePath: string;
}

async function isGitRepo(dir: string): Promise<boolean> {
  try {
    // .git is a directory in a normal repo and a file in a worktree/submodule — either counts.
    await fs.stat(path.join(dir, '.git'));
    return true;
  } catch {
    return false;
  }
}

/**
 * Find git repos under `root`. If `root` itself is a repo, returns just it. If `root` is a plain
 * parent folder, returns each nested repo (not descending into a repo once found). Returns [] when
 * there's no git repo anywhere (a non-git folder) — callers then map the folder itself.
 */
export async function detectRepos(root: string): Promise<DetectedRepo[]> {
  const repos: DetectedRepo[] = [];

  async function walk(dir: string, depth: number): Promise<void> {
    if (await isGitRepo(dir)) {
      repos.push({
        name: path.basename(dir),
        path: dir,
        relativePath: path.relative(root, dir) || '.'
      });
      return; // don't descend into a repo
    }
    if (depth >= MAX_DEPTH) {
      return;
    }
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || IGNORED_DIRS.has(entry.name) || entry.name.startsWith('.')) {
        continue;
      }
      await walk(path.join(dir, entry.name), depth + 1);
    }
  }

  await walk(root, 0);
  // Stable, shallow-first ordering so the picker lists top-level repos before deeper ones.
  repos.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return repos;
}
