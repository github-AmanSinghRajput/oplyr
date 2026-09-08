import type { ImportProviderId } from './agent-memory-paths.js';

/** Where a source stands relative to the brain: never imported, already in, or changed since import. */
export type ImportFileStatus = 'new' | 'added' | 'changed';

export interface ImportFile {
  path: string;
  bytes: number;
  kind: 'global' | 'project' | 'session';
  projectRoot: string | null;
  projectName: string | null;
  /** For `kind: 'session'` only: 0 is the most recently worked-in session for this root, 1 the next,
   *  and so on. The distiller reads deepest into rank 0 and skims the rest. */
  sessionRank?: number;
  /** ISO timestamp the file was last written. Sessions are listed several per project, so the date
   *  is what tells two of them apart in the picker. */
  modifiedAt?: string;
  /** Set by `scanImport` from the import ledger. Absent until the ledger join runs (defaults `new`). */
  status?: ImportFileStatus;
  /** Memories this source contributed on its last import (from the ledger); present when `added`/`changed`. */
  atomsAdded?: number;
}

export interface ImportAgentGroup {
  providerId: ImportProviderId;
  global: ImportFile | null;
  projects: ImportFile[];
  /** Newest session transcript per project — the "where you left off" content (distilled, not raw). */
  sessions: ImportFile[];
}

export interface ImportManifest {
  agents: ImportAgentGroup[];
  totalFiles: number;
}

export interface ImportSelector {
  providerId: ImportProviderId;
  paths: string[];
}
