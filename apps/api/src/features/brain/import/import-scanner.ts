import fs from 'node:fs/promises';
import path from 'node:path';
import {
  discoverCuratedPaths,
  PROJECT_MEMORY_FILE,
  type ImportProviderId
} from './agent-memory-paths.js';
import type { ImportAgentGroup, ImportFile, ImportManifest } from './import.types.js';

// Cap the Codex session files we read for project roots / newest-session so a huge history can't
// make a scan crawl. Paths embed the date, so the newest sort last — we keep the most recent slice.
const MAX_CODEX_SESSIONS = 1500;
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
      projectName: projectRoot ? path.basename(projectRoot) : null
    };
  } catch {
    return null;
  }
}

/** Read only the first line of a file (a Codex session's `session_meta` line carries the cwd). */
async function firstLine(filePath: string, maxBytes = 65536): Promise<string | null> {
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
  try {
    handle = await fs.open(filePath, 'r');
    const buffer = Buffer.alloc(maxBytes);
    const { bytesRead } = await handle.read(buffer, 0, maxBytes, 0);
    const text = buffer.subarray(0, bytesRead).toString('utf8');
    const newline = text.indexOf('\n');
    return newline >= 0 ? text.slice(0, newline) : text;
  } catch {
    return null;
  } finally {
    await handle?.close();
  }
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

interface CodexIndex {
  roots: string[];
  /** Newest session-transcript path per project cwd. */
  newestByRoot: Map<string, string>;
}

/** One pass over Codex session rollouts → the project roots (session_meta.cwd) and the NEWEST session
 *  file per root (filenames embed the timestamp, so the later one in sorted order is newer). */
async function codexSessionIndex(homeDir: string): Promise<CodexIndex> {
  const sessionsDir = path.join(homeDir, '.codex', 'sessions');
  let names: string[];
  try {
    names = (await fs.readdir(sessionsDir, { recursive: true })).filter((n) =>
      n.endsWith('.jsonl')
    );
  } catch {
    return { roots: [], newestByRoot: new Map() };
  }
  names.sort();
  const recent = names.slice(-MAX_CODEX_SESSIONS);

  const newestByRoot = new Map<string, string>();
  for (const name of recent) {
    const full = path.join(sessionsDir, name);
    const line = await firstLine(full);
    if (!line) continue;
    try {
      const meta = JSON.parse(line) as { payload?: { cwd?: unknown } };
      const cwd = meta.payload?.cwd;
      if (typeof cwd === 'string' && cwd.length > 0) newestByRoot.set(cwd, full); // later = newer
    } catch {
      // skip a malformed session line
    }
  }
  return { roots: [...newestByRoot.keys()], newestByRoot };
}

/** Claude's newest session `.jsonl` for a project root. Claude names its session dir by the cwd with
 *  '/' replaced by '-'. */
async function claudeNewestSession(homeDir: string, projectRoot: string): Promise<string | null> {
  const dir = path.join(homeDir, '.claude', 'projects', projectRoot.replace(/\//g, '-'));
  let files: string[];
  try {
    files = (await fs.readdir(dir)).filter((f) => f.endsWith('.jsonl'));
  } catch {
    return null;
  }
  let newest: { path: string; mtime: number } | null = null;
  for (const file of files) {
    const full = path.join(dir, file);
    try {
      const s = await fs.stat(full);
      if (!newest || s.mtimeMs > newest.mtime) newest = { path: full, mtime: s.mtimeMs };
    } catch {
      // skip
    }
  }
  return newest?.path ?? null;
}

async function newestSessionFile(
  providerId: ImportProviderId,
  root: string,
  codex: CodexIndex,
  homeDir: string
): Promise<ImportFile | null> {
  let sessionPath: string | null = null;
  if (providerId === 'claude') sessionPath = await claudeNewestSession(homeDir, root);
  else if (providerId === 'codex') sessionPath = codex.newestByRoot.get(root) ?? null;
  if (!sessionPath) return null;
  const file = await statFile(sessionPath, 'session', root);
  return file && file.bytes >= MIN_SESSION_BYTES ? file : null;
}

/** Candidate project roots = the UNION of each agent's own project history — accurate and fast, not
 *  a full-disk crawl. */
export async function scanAgentMemory(deps: {
  homeDir: string;
  connected: Record<ImportProviderId, boolean>;
}): Promise<ImportManifest> {
  const globals = discoverCuratedPaths(deps.homeDir);
  const [claudeRoots, codex] = await Promise.all([
    claudeProjectRoots(deps.homeDir),
    codexSessionIndex(deps.homeDir)
  ]);
  const roots = [...new Set([...claudeRoots, ...codex.roots])];

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
      const session = await newestSessionFile(providerId, root, codex, deps.homeDir);
      if (session) sessions.push(session);
    }

    if (!global && projects.length === 0 && sessions.length === 0) continue;
    if (global) totalFiles += 1;
    totalFiles += projects.length + sessions.length;
    agents.push({ providerId, global, projects, sessions });
  }

  return { agents, totalFiles };
}
