import path from 'node:path';

export type ImportProviderId = 'claude' | 'codex' | 'gemini';

export interface AgentMemorySource {
  providerId: ImportProviderId;
  scope: 'global' | 'project';
  path: string;
  projectRoot: string | null;
  projectName: string | null;
}

/** Home-global curated files only. Per-project sources are discovered by import-scanner (it needs
 *  to read ~/.claude/projects to know which projects exist). */
export function discoverCuratedPaths(homeDir: string): AgentMemorySource[] {
  const g = (providerId: ImportProviderId, ...segs: string[]): AgentMemorySource => ({
    providerId,
    scope: 'global',
    path: path.join(homeDir, ...segs),
    projectRoot: null,
    projectName: null
  });
  return [
    g('claude', '.claude', 'CLAUDE.md'),
    g('codex', '.codex', 'AGENTS.md'),
    g('gemini', '.gemini', 'GEMINI.md')
  ];
}

/** Per-agent project-level memory filename (lives at the repo root, not in the agent's home dir). */
export const PROJECT_MEMORY_FILE: Record<ImportProviderId, string> = {
  claude: 'CLAUDE.md',
  codex: 'AGENTS.md',
  gemini: 'GEMINI.md'
};
