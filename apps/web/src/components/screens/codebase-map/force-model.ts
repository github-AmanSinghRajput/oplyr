import type { CodebaseMapEdge, CodebaseMapNode } from '@/containers/voice-console/lib/types';
import { representativeOf } from './shared';

// Folder/file hierarchy + the "what's visible given which folders are expanded" computation that
// drives the collapsible force graph. Pure functions (no React, no d3) so they're easy to reason about.

export interface FolderModel {
  id: string;
  name: string;
  parentId: string | null;
  childFolderIds: string[];
  fileIds: string[];
  descendantFileCount: number;
}

export interface FileModel {
  id: string;
  label: string;
  dir: string;
  language: string;
  degree: number;
  parentFolderId: string | null;
}

export interface Hierarchy {
  folders: Map<string, FolderModel>;
  files: Map<string, FileModel>;
  topFolderIds: string[];
  rootFileIds: string[];
}

export function buildHierarchy(nodes: CodebaseMapNode[]): Hierarchy {
  const folders = new Map<string, FolderModel>();
  const files = new Map<string, FileModel>();
  const topFolderIds: string[] = [];
  const rootFileIds: string[] = [];

  const ensureFolder = (id: string, name: string, parentId: string | null): FolderModel => {
    let folder = folders.get(id);
    if (!folder) {
      folder = { id, name, parentId, childFolderIds: [], fileIds: [], descendantFileCount: 0 };
      folders.set(id, folder);
      if (parentId === null) topFolderIds.push(id);
      else folders.get(parentId)?.childFolderIds.push(id);
    }
    return folder;
  };

  for (const node of nodes) {
    const segments = node.id.split('/');
    segments.pop(); // file name; remaining = folder chain
    let parentId: string | null = null;
    let prefix = '';
    for (const segment of segments) {
      prefix = prefix ? `${prefix}/${segment}` : segment;
      ensureFolder(prefix, segment, parentId);
      parentId = prefix;
    }
    files.set(node.id, {
      id: node.id,
      label: node.label,
      dir: node.dir,
      language: node.language,
      degree: node.degree,
      parentFolderId: parentId
    });
    if (parentId === null) rootFileIds.push(node.id);
    else folders.get(parentId)?.fileIds.push(node.id);
  }

  // Descendant file counts (for sizing folder circles).
  const countDescendants = (id: string): number => {
    const folder = folders.get(id);
    if (!folder) return 0;
    let total = folder.fileIds.length;
    for (const childId of folder.childFolderIds) total += countDescendants(childId);
    folder.descendantFileCount = total;
    return total;
  };
  for (const id of topFolderIds) countDescendants(id);

  return { folders, files, topFolderIds, rootFileIds };
}

export interface VisibleNode {
  id: string;
  kind: 'folder' | 'file';
  parentId: string | null;
  // folder-only
  collapsed?: boolean;
  childCount?: number;
  descendantFileCount?: number;
  name?: string;
  // file-only
  label?: string;
  dir?: string;
  language?: string;
  degree?: number;
}

export interface VisibleGraph {
  nodes: VisibleNode[];
  edges: { id: string; from: string; to: string }[];
}

export function computeVisibleGraph(
  hierarchy: Hierarchy,
  expanded: Set<string>,
  edges: CodebaseMapEdge[]
): VisibleGraph {
  const nodes: VisibleNode[] = [];

  for (const fileId of hierarchy.rootFileIds) {
    const file = hierarchy.files.get(fileId);
    if (file) {
      nodes.push({
        id: file.id,
        kind: 'file',
        parentId: null,
        label: file.label,
        dir: file.dir,
        language: file.language,
        degree: file.degree
      });
    }
  }

  const addFolder = (folderId: string, parentId: string | null) => {
    const folder = hierarchy.folders.get(folderId);
    if (!folder) return;
    const isExpanded = expanded.has(folderId);
    const childCount = folder.fileIds.length + folder.childFolderIds.length;
    nodes.push({
      id: folder.id,
      kind: 'folder',
      parentId,
      collapsed: !isExpanded,
      childCount,
      descendantFileCount: folder.descendantFileCount,
      name: folder.name
    });
    if (!isExpanded) return;
    for (const childFolderId of folder.childFolderIds) addFolder(childFolderId, folder.id);
    for (const fileId of folder.fileIds) {
      const file = hierarchy.files.get(fileId);
      if (!file) continue;
      nodes.push({
        id: file.id,
        kind: 'file',
        parentId: folder.id,
        label: file.label,
        dir: file.dir,
        language: file.language,
        degree: file.degree
      });
    }
  };
  for (const folderId of hierarchy.topFolderIds) addFolder(folderId, null);

  // Remap edges to visible representatives; drop self-loops; dedupe.
  const seen = new Set<string>();
  const visibleEdges: VisibleGraph['edges'] = [];
  for (const edge of edges) {
    const a = representativeOf(edge.from, (id) => !expanded.has(id));
    const b = representativeOf(edge.to, (id) => !expanded.has(id));
    if (a === b) continue;
    const key = `${a}>${b}`;
    if (seen.has(key)) continue;
    seen.add(key);
    visibleEdges.push({ id: `e_${visibleEdges.length}`, from: a, to: b });
  }

  return { nodes, edges: visibleEdges };
}
