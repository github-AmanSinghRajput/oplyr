import fs from 'node:fs/promises';

import { generateAssistantReply, AssistantClientError } from '../../assistant-client.js';
import { logger } from '../../lib/logger.js';
import { isSecretRelativePath, resolveWorkspacePath } from '../../lib/path-security.js';
import { getRuntimeState } from '../../runtime.js';
import { CodebaseMapRepository } from './codebase-map.repository.js';
import type {
  CodebaseEdge,
  CodebaseMap,
  CodebaseNode,
  FileSummaryResult,
  ScannedFile
} from './codebase-map.types.js';
import {
  buildTree,
  isMappableFile,
  isSourceFile,
  scanWorkspace,
  SUPPORTED_MAP_LANGUAGES
} from './scanner.js';
import { parseDependencies } from './dependency-parser.js';
import { extractSymbols, type FileSymbol } from './symbol-parser.js';

// Cap graph nodes so a huge repo stays renderable; keep the most-connected files when over.
const MAX_NODES = 600;
// Truncate file contents sent to the model for a summary.
const MAX_SUMMARY_INPUT_CHARS = 16_000;

export class CodebaseMapService {
  constructor(private readonly repository: CodebaseMapRepository = new CodebaseMapRepository()) {}

  /** Return the cached map for a root, scanning + caching on a miss. */
  async getMap(rootPath: string, projectName: string): Promise<CodebaseMap> {
    const cached = this.repository.getMap(rootPath);
    if (cached) {
      return cached;
    }
    return this.rescan(rootPath, projectName);
  }

  /** Scan fresh, cache, and return. */
  async rescan(rootPath: string, projectName: string): Promise<CodebaseMap> {
    const map = await this.buildMap(rootPath, projectName);
    this.repository.saveMap(rootPath, map);
    return map;
  }

  /**
   * Fire-and-forget scan used on workspace connect, so the map is warm by the time the user opens
   * the screen. Never throws (logs and moves on).
   */
  async ensureScan(rootPath: string, projectName: string): Promise<void> {
    try {
      if (this.repository.getMap(rootPath)) {
        return;
      }
      await this.rescan(rootPath, projectName);
      logger.info('codebase_map.scanned', { rootPath, projectName });
    } catch (error) {
      logger.warn('codebase_map.scan_failed', {
        rootPath,
        message: error instanceof Error ? error.message : 'Unknown scan error.'
      });
    }
  }

  private async buildMap(rootPath: string, projectName: string): Promise<CodebaseMap> {
    const files = await scanWorkspace(rootPath);
    const tree = buildTree(files);
    // Every non-binary file becomes a node (max coverage); only real source files get import edges.
    const mappableFiles = files.filter((file) => isMappableFile(file.name, file.ext));
    const sourceFiles = files.filter((file) => isSourceFile(file.ext));

    const importEdges: CodebaseEdge[] = (await parseDependencies(rootPath, sourceFiles)).map(
      (edge) => ({ ...edge, kind: 'import' as const })
    );
    // Soft folder-cluster links so configs/docs/data attach to their neighborhood instead of floating.
    const directoryEdges = buildDirectoryEdges(mappableFiles, importEdges);
    const edges = [...importEdges, ...directoryEdges];

    const degree = new Map<string, number>();
    for (const edge of edges) {
      degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
      degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
    }

    let nodes: CodebaseNode[] = mappableFiles.map((file) => ({
      id: file.path,
      label: file.name,
      dir: file.dir,
      language: file.language,
      degree: degree.get(file.path) ?? 0
    }));

    let keptEdges: CodebaseEdge[] = edges;
    let truncated = false;
    if (nodes.length > MAX_NODES) {
      truncated = true;
      nodes = [...nodes].sort((a, b) => b.degree - a.degree).slice(0, MAX_NODES);
      const keep = new Set(nodes.map((node) => node.id));
      keptEdges = edges.filter((edge) => keep.has(edge.from) && keep.has(edge.to));
    }

    const languages: Record<string, number> = {};
    for (const file of files) {
      languages[file.language] = (languages[file.language] ?? 0) + 1;
    }

    return {
      rootPath,
      projectName,
      nodes,
      edges: keptEdges,
      tree,
      stats: {
        totalFiles: files.length,
        sourceFiles: sourceFiles.length,
        edges: keptEdges.length,
        languages,
        supportedLanguages: SUPPORTED_MAP_LANGUAGES,
        truncated
      },
      scannedAt: new Date().toISOString()
    };
  }

  /**
   * Generate (or return cached) a plain-English summary for one file via the active assistant
   * provider. Enforces the workspace boundary + secret policy. Never throws — provider/availability
   * problems come back as `{ summary: null, error }` so the UI can degrade gracefully.
   */
  async summarizeFile(
    rootPath: string,
    filePath: string,
    symbol?: string
  ): Promise<FileSummaryResult> {
    const resolved = await this.resolveInWorkspace(rootPath, filePath);
    if (!resolved.ok) {
      return { path: resolved.normalized, summary: null, cached: false, error: resolved.error };
    }
    const { normalized, absolute } = resolved;
    const cacheKey = symbol ? `${normalized}#${symbol}` : normalized;

    const cached = this.repository.getSummary(rootPath, cacheKey);
    if (cached) {
      return { path: normalized, summary: cached, cached: true };
    }

    let content: string;
    try {
      content = await fs.readFile(absolute, 'utf8');
    } catch {
      return { path: normalized, summary: null, cached: false, error: 'Could not read this file.' };
    }
    const clipped = content.slice(0, MAX_SUMMARY_INPUT_CHARS);

    const instruction = symbol
      ? `Summarize what the function/symbol \`${symbol}\` in this file does in 1–2 plain-English sentences — its purpose, inputs/outputs, and notable side effects. No preamble, no markdown.`
      : 'Summarize what this source file does in 1–2 plain-English sentences for a developer who is new to the codebase. Focus on responsibility and what it connects to. No preamble, no markdown.';

    const prompt = [instruction, '', `File: ${normalized}`, '', '```', clipped, '```'].join('\n');

    try {
      const workspace = getRuntimeState().workspace;
      const reply = await generateAssistantReply(prompt, [], workspace);
      const summary = reply.text.trim();
      if (summary) {
        this.repository.saveSummary(rootPath, cacheKey, summary);
      }
      return { path: normalized, summary: summary || null, cached: false };
    } catch (error) {
      // Surface the assistant's error classification (e.g. rate_limit) + its friendly message so the
      // UI can show a clear "limit reached for <agent>" notice instead of a silent failure.
      if (error instanceof AssistantClientError) {
        return {
          path: normalized,
          summary: null,
          cached: false,
          error: error.friendlyMessage,
          errorKind: error.kind
        };
      }
      return {
        path: normalized,
        summary: null,
        cached: false,
        error: error instanceof Error ? error.message : 'Could not generate a summary.'
      };
    }
  }

  /** Top-level functions / classes a file declares (for the file-node expand list). Lazy + boundary-safe. */
  async getFileSymbols(
    rootPath: string,
    filePath: string
  ): Promise<{ path: string; symbols: FileSymbol[]; error?: string }> {
    const resolved = await this.resolveInWorkspace(rootPath, filePath);
    if (!resolved.ok) {
      return { path: resolved.normalized, symbols: [], error: resolved.error };
    }
    try {
      const content = await fs.readFile(resolved.absolute, 'utf8');
      return { path: resolved.normalized, symbols: extractSymbols(content, resolved.normalized) };
    } catch {
      return { path: resolved.normalized, symbols: [], error: 'Could not read this file.' };
    }
  }

  /**
   * Resolve a workspace-relative path safely. Delegates boundary enforcement to the shared
   * path-security helper, which resolves symlinks via realpath — so a symlink inside the workspace
   * pointing outside it is rejected (a plain string-prefix check would miss that).
   */
  private async resolveInWorkspace(
    rootPath: string,
    filePath: string
  ): Promise<
    | { ok: true; normalized: string; absolute: string }
    | { ok: false; normalized: string; error: string }
  > {
    const normalized = filePath.replace(/\\/g, '/').replace(/^\/+/, '');
    if (isSecretRelativePath(normalized)) {
      return { ok: false, normalized, error: 'This file is protected by the secret policy.' };
    }
    const resolved = await resolveWorkspacePath(rootPath, normalized);
    if (resolved.escapesWorkspace || !resolved.realPath) {
      return { ok: false, normalized, error: 'File is outside the workspace.' };
    }
    return { ok: true, normalized, absolute: resolved.absolutePath };
  }
}

/**
 * For each directory holding 2+ files, link its files to a single anchor (the most import-connected
 * file, else the first). This clusters every folder on the canvas and gives non-source files a
 * degree so they survive the node cap — without exploding into a fully-connected mesh.
 */
function buildDirectoryEdges(files: ScannedFile[], importEdges: CodebaseEdge[]): CodebaseEdge[] {
  const importDegree = new Map<string, number>();
  for (const edge of importEdges) {
    importDegree.set(edge.from, (importDegree.get(edge.from) ?? 0) + 1);
    importDegree.set(edge.to, (importDegree.get(edge.to) ?? 0) + 1);
  }
  const existing = new Set(importEdges.map((edge) => edgeKey(edge.from, edge.to)));

  const byDir = new Map<string, ScannedFile[]>();
  for (const file of files) {
    const parent = parentDir(file.path);
    const list = byDir.get(parent);
    if (list) {
      list.push(file);
    } else {
      byDir.set(parent, [file]);
    }
  }

  const edges: CodebaseEdge[] = [];
  for (const list of byDir.values()) {
    if (list.length < 2) {
      continue;
    }
    // Files arrive path-sorted from scanWorkspace, so `list[0]` is a stable default anchor.
    let anchor = list[0]!;
    let bestDegree = importDegree.get(anchor.path) ?? 0;
    for (const file of list) {
      const degree = importDegree.get(file.path) ?? 0;
      if (degree > bestDegree) {
        bestDegree = degree;
        anchor = file;
      }
    }
    for (const file of list) {
      const key = edgeKey(file.path, anchor.path);
      if (file.path === anchor.path || existing.has(key)) {
        continue;
      }
      existing.add(key); // defensive: cross-dir dupes are structurally impossible, but keep the set truthful
      edges.push({ from: file.path, to: anchor.path, kind: 'directory' });
    }
  }
  return edges;
}

function parentDir(relPath: string): string {
  const index = relPath.lastIndexOf('/');
  return index === -1 ? '.' : relPath.slice(0, index);
}

function edgeKey(a: string, b: string): string {
  return a < b ? `${a} ${b}` : `${b} ${a}`;
}
