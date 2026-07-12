// Types for the instant codebase map: a workspace scanned into a file tree + a JS/TS import graph.

export interface ScannedFile {
  /** Workspace-relative POSIX path, e.g. "apps/api/src/index.ts". */
  path: string;
  /** File name, e.g. "index.ts". */
  name: string;
  /** Lowercase extension including the dot, e.g. ".ts". */
  ext: string;
  /** Top-level folder the file lives under ("." for repo root). */
  dir: string;
  /** Human language label derived from the extension. */
  language: string;
}

export interface CodebaseNode {
  /** Stable id = workspace-relative path. */
  id: string;
  label: string;
  dir: string;
  language: string;
  /** Number of import edges touching this file (in + out). */
  degree: number;
}

export interface CodebaseEdge {
  from: string;
  to: string;
  /** `import` = a real dependency (JS/TS/Python). `directory` = a soft folder-cluster link so
   *  non-source files (configs, docs, data) still attach to their neighborhood on the canvas. */
  kind?: 'import' | 'directory';
}

export interface CodebaseTreeNode {
  name: string;
  path: string;
  type: 'dir' | 'file';
  language?: string;
  children?: CodebaseTreeNode[];
}

export interface CodebaseStats {
  totalFiles: number;
  /** Count of JS/TS/Python files that receive import-edge + symbol analysis — NOT the node count
   *  (nodes now include every mappable file type; this is only the import-traced subset). */
  sourceFiles: number;
  edges: number;
  /** Per-language file counts across the WHOLE scan (incl. unsupported languages, for messaging). */
  languages: Record<string, number>;
  /** Languages the map can currently graph (e.g. TypeScript, JavaScript, Python). */
  supportedLanguages: string[];
  /** True when the graph was capped (very large repo) and only the most-connected files are shown. */
  truncated: boolean;
}

export interface CodebaseMap {
  rootPath: string;
  projectName: string;
  nodes: CodebaseNode[];
  edges: CodebaseEdge[];
  tree: CodebaseTreeNode[];
  stats: CodebaseStats;
  scannedAt: string;
}

export interface FileSummaryResult {
  path: string;
  summary: string | null;
  cached: boolean;
  error?: string;
  errorKind?: 'auth' | 'rate_limit' | 'service' | 'unknown';
}
