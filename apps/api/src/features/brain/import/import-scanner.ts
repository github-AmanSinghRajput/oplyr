import fs from 'node:fs/promises';
import path from 'node:path';
import {
  discoverCuratedPaths,
  PROJECT_MEMORY_FILE,
  type ImportProviderId
} from './agent-memory-paths.js';
import type { ImportAgentGroup, ImportFile, ImportManifest } from './import.types.js';

// Cap the session files we open while indexing, so a huge history can't make a scan crawl. Which
// files fall inside the cap is decided by mtime, never by name: a `resume`d session keeps its
// original name, so a name-ordered window can exclude the very session being worked in today.
const MAX_SESSIONS_SCANNED = 1500;
// How many sessions per project root we offer for import. One was too few: a developer accumulates
// dozens of sessions per repo, and a single file is an arbitrary slice of months of work.
const SESSIONS_PER_ROOT = 3;
// How far into a Claude transcript to look for its `cwd` record.
const CLAUDE_CWD_PROBE_BYTES = 262144;
const CLAUDE_CWD_PROBE_LINES = 40;
// Skip near-empty sessions (just meta / a stray line) — nothing durable to distill, so importing
// them would only waste an agent call.
const MIN_SESSION_BYTES = 2048;

async function statFile(
  filePath: string,
  kind: ImportFile['kind'],
  projectRoot: string | null
): Promise<ImportFile | null> {
  try {
    const s = await fs.stat(filePath);
    if (!s.isFile() || s.size === 0) return null;
    return {
      path: filePath,
      bytes: s.size,
      kind,
      projectRoot,
      projectName: projectRoot ? path.basename(projectRoot) : null,
      modifiedAt: new Date(s.mtimeMs).toISOString()
    };
  } catch {
    return null;
  }
}

/** Read the first `maxBytes` of a file, for peeking at a transcript's opening records. */
async function headText(filePath: string, maxBytes: number): Promise<string | null> {
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
  try {
    handle = await fs.open(filePath, 'r');
    const buffer = Buffer.alloc(maxBytes);
    const { bytesRead } = await handle.read(buffer, 0, maxBytes, 0);
    return buffer.subarray(0, bytesRead).toString('utf8');
  } catch {
    return null;
  } finally {
    await handle?.close();
  }
}

/** Read only the first line of a file (a Codex session's `session_meta` line carries the cwd). */
async function firstLine(filePath: string, maxBytes = 65536): Promise<string | null> {
  const text = await headText(filePath, maxBytes);
  if (text === null) return null;
  const newline = text.indexOf('\n');
  return newline >= 0 ? text.slice(0, newline) : text;
}

/**
 * The working directory a Claude session ran in, read from the transcript itself.
 *
 * Claude names its project directory after the cwd, but the encoding is lossy: it replaces every
 * non-alphanumeric character with '-', so a space, an underscore and a slash all become the same
 * thing. Reconstructing the path from the directory name is therefore guesswork, and reproducing
 * the encoding by hand got it wrong for any root containing a space or an underscore. Measured on
 * a real machine, that hid 76 sessions across three projects. The records carry the real cwd, and
 * it appears within the first few lines (worst case observed: 16KB in).
 */
async function claudeSessionCwd(filePath: string): Promise<string | null> {
  const head = await headText(filePath, CLAUDE_CWD_PROBE_BYTES);
  if (!head) return null;
  for (const line of head.split('\n').slice(0, CLAUDE_CWD_PROBE_LINES)) {
    if (!line.includes('"cwd"')) continue;
    try {
      const cwd = (JSON.parse(line) as { cwd?: unknown }).cwd;
      if (typeof cwd === 'string' && cwd.length > 0) return cwd;
    } catch {
      // a truncated final line in the probe window
    }
  }
  return null;
}

/** Claude's project roots: `~/.claude.json`'s `projects` keys (absolute paths). */
async function claudeProjectRoots(homeDir: string): Promise<string[]> {
  try {
    const raw = await fs.readFile(path.join(homeDir, '.claude.json'), 'utf8');
    const parsed = JSON.parse(raw) as { projects?: Record<string, unknown> };
    return Object.keys(parsed.projects ?? {});
  } catch {
    return [];
  }
}

interface SessionIndex {
  roots: string[];
  /** Session-transcript paths per project cwd, most recently WRITTEN first. */
  recentByRoot: Map<string, string[]>;
}

/** Stat every candidate and keep the `limit` most recently written. Stats are far cheaper than the
 *  reads that follow, so the cap can be applied on real recency rather than on a name heuristic. */
async function mostRecentlyWritten(
  paths: string[],
  limit: number
): Promise<Array<{ path: string; mtime: number }>> {
  const stamped: Array<{ path: string; mtime: number }> = [];
  for (const filePath of paths) {
    try {
      stamped.push({ path: filePath, mtime: (await fs.stat(filePath)).mtimeMs });
    } catch {
      // vanished between listing and stat
    }
  }
  stamped.sort((a, b) => b.mtime - a.mtime);
  return stamped.slice(0, limit);
}

/** Newest-written first, capped per root. */
function rankRecent(
  byRoot: Map<string, Array<{ path: string; mtime: number }>>
): Map<string, string[]> {
  const ranked = new Map<string, string[]>();
  for (const [root, list] of byRoot) {
    list.sort((a, b) => b.mtime - a.mtime);
    ranked.set(
      root,
      list.slice(0, SESSIONS_PER_ROOT).map((entry) => entry.path)
    );
  }
  return ranked;
}

/**
 * One pass over Codex session rollouts → the project roots (session_meta.cwd) and the most recent
 * sessions per root.
 *
 * Ranked by mtime, never by filename. A rollout file is named for when the session STARTED, but
 * `codex resume` appends to that same file for as long as you keep coming back to it. Ranking by
 * name therefore treats a session you worked in an hour ago as months old, and it loses exactly the
 * long-running sessions that carry the most context. Observed: a 0.1MB session named one minute
 * earlier beat the 883MB session that held the actual work.
 */
async function codexSessionIndex(homeDir: string): Promise<SessionIndex> {
  const sessionsDir = path.join(homeDir, '.codex', 'sessions');
  let names: string[];
  try {
    names = (await fs.readdir(sessionsDir, { recursive: true })).filter((n) =>
      n.endsWith('.jsonl')
    );
  } catch {
    return { roots: [], recentByRoot: new Map() };
  }
  const candidates = await mostRecentlyWritten(
    names.map((name) => path.join(sessionsDir, name)),
    MAX_SESSIONS_SCANNED
  );

  const byRoot = new Map<string, Array<{ path: string; mtime: number }>>();
  for (const candidate of candidates) {
    const line = await firstLine(candidate.path);
    if (!line) continue;
    let cwd: unknown;
    try {
      cwd = (JSON.parse(line) as { payload?: { cwd?: unknown } }).payload?.cwd;
    } catch {
      continue; // malformed session line
    }
    if (typeof cwd !== 'string' || cwd.length === 0) continue;
    const list = byRoot.get(cwd);
    if (list) list.push(candidate);
    else byRoot.set(cwd, [candidate]);
  }

  return { roots: [...byRoot.keys()], recentByRoot: rankRecent(byRoot) };
}

/**
 * Index Claude's transcripts the same way we index Codex's: group by the cwd each session actually
 * ran in, ranked by when it was last written.
 *
 * Walking the project directories rather than deriving one per root also surfaces projects Claude
 * has history for but `.claude.json` does not list.
 */
async function claudeSessionIndex(homeDir: string): Promise<SessionIndex> {
  const projectsDir = path.join(homeDir, '.claude', 'projects');
  let entries: string[];
  try {
    entries = await fs.readdir(projectsDir);
  } catch {
    return { roots: [], recentByRoot: new Map() };
  }

  const paths: string[] = [];
  for (const entry of entries) {
    const dir = path.join(projectsDir, entry);
    try {
      for (const file of await fs.readdir(dir)) {
        if (file.endsWith('.jsonl')) paths.push(path.join(dir, file));
      }
    } catch {
      // a stray file rather than a project directory
    }
  }

  const byRoot = new Map<string, Array<{ path: string; mtime: number }>>();
  for (const candidate of await mostRecentlyWritten(paths, MAX_SESSIONS_SCANNED)) {
    const cwd = await claudeSessionCwd(candidate.path);
    if (!cwd) continue;
    const list = byRoot.get(cwd);
    if (list) list.push(candidate);
    else byRoot.set(cwd, [candidate]);
  }

  return { roots: [...byRoot.keys()], recentByRoot: rankRecent(byRoot) };
}

/** The recent sessions for one root, newest first, each tagged with its rank so the distiller can
 *  spend its budget on the session the user actually worked in last. */
async function recentSessionFiles(
  providerId: ImportProviderId,
  root: string,
  indexes: { claude: SessionIndex; codex: SessionIndex }
): Promise<ImportFile[]> {
  const index =
    providerId === 'claude' ? indexes.claude : providerId === 'codex' ? indexes.codex : null;
  const paths = index?.recentByRoot.get(root) ?? [];

  const files: ImportFile[] = [];
  for (const sessionPath of paths) {
    const file = await statFile(sessionPath, 'session', root);
    if (file && file.bytes >= MIN_SESSION_BYTES) {
      files.push({ ...file, sessionRank: files.length });
    }
  }
  return files;
}

/** Candidate project roots = the UNION of each agent's own project history — accurate and fast, not
 *  a full-disk crawl. */
export async function scanAgentMemory(deps: {
  homeDir: string;
  connected: Record<ImportProviderId, boolean>;
}): Promise<ImportManifest> {
  const globals = discoverCuratedPaths(deps.homeDir);
  const [declaredRoots, claude, codex] = await Promise.all([
    claudeProjectRoots(deps.homeDir),
    claudeSessionIndex(deps.homeDir),
    codexSessionIndex(deps.homeDir)
  ]);
  // `.claude.json` still contributes, because a project can be declared there with a CLAUDE.md
  // worth importing and no session history yet.
  const roots = [...new Set([...declaredRoots, ...claude.roots, ...codex.roots])];
  const indexes = { claude, codex };

  const agents: ImportAgentGroup[] = [];
  let totalFiles = 0;

  for (const providerId of ['claude', 'codex', 'gemini'] as const) {
    if (!deps.connected[providerId]) continue;
    const globalSpec = globals.find((g) => g.providerId === providerId)!;
    const global = await statFile(globalSpec.path, 'global', null);

    const projectFileName = PROJECT_MEMORY_FILE[providerId];
    const projects: ImportFile[] = [];
    const sessions: ImportFile[] = [];
    for (const root of roots) {
      const projectFile = await statFile(path.join(root, projectFileName), 'project', root);
      if (projectFile) projects.push(projectFile);
      sessions.push(...(await recentSessionFiles(providerId, root, indexes)));
    }

    if (!global && projects.length === 0 && sessions.length === 0) continue;
    if (global) totalFiles += 1;
    totalFiles += projects.length + sessions.length;
    agents.push({ providerId, global, projects, sessions });
  }

  return { agents, totalFiles };
}
