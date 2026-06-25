import ELK, { type ElkExtendedEdge, type ElkNode } from 'elkjs/lib/elk.bundled.js';
import type { Edge, Node } from '@xyflow/react';
import type { CodebaseMapEdge, CodebaseMapNode } from '@/containers/voice-console/lib/types';
import type { FileNodeData, FolderNodeData } from './nodes';
import { representativeOf } from './shared';

// Lazy so importing this module (e.g. in a test) doesn't allocate the ELK engine until a layout runs.
let elkInstance: ELK | null = null;
const getElk = (): ELK => (elkInstance ??= new ELK());

const FILE_W = 172;
const FILE_H = 34;
const FOLDER_COLLAPSED_W = 196;
const FOLDER_COLLAPSED_H = 42;

const ROOT_OPTIONS = {
  'elk.algorithm': 'layered',
  // Top-to-bottom: layers stack vertically and files spread horizontally across each layer, which
  // uses the wide canvas better than a left→right tree.
  'elk.direction': 'DOWN',
  'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
  'elk.layered.spacing.nodeNodeBetweenLayers': '72',
  'elk.spacing.nodeNode': '26',
  'elk.layered.spacing.edgeNodeBetweenLayers': '28',
  'elk.padding': '[top=14,left=14,bottom=14,right=14]'
};
const FOLDER_OPTIONS = {
  // Extra top padding leaves room for the folder's header strip.
  'elk.padding': '[top=36,left=14,bottom=14,right=14]',
  'elk.spacing.nodeNode': '18'
};

interface FolderModel {
  id: string;
  name: string;
  folders: Map<string, FolderModel>;
  files: CodebaseMapNode[];
}

function buildModel(nodes: CodebaseMapNode[]): FolderModel {
  const root: FolderModel = { id: '', name: '.', folders: new Map(), files: [] };
  for (const node of nodes) {
    const segments = node.id.split('/');
    segments.pop(); // drop the file name; what's left is the folder chain
    let cursor = root;
    let prefix = '';
    for (const segment of segments) {
      prefix = prefix ? `${prefix}/${segment}` : segment;
      let child = cursor.folders.get(segment);
      if (!child) {
        child = { id: prefix, name: segment, folders: new Map(), files: [] };
        cursor.folders.set(segment, child);
      }
      cursor = child;
    }
    cursor.files.push(node);
  }
  return root;
}

function countFiles(folder: FolderModel): number {
  let total = folder.files.length;
  for (const child of folder.folders.values()) {
    total += countFiles(child);
  }
  return total;
}

/** All directory prefixes present (for expand/collapse-all). */
export function allFolderIds(nodes: CodebaseMapNode[]): string[] {
  const ids = new Set<string>();
  for (const node of nodes) {
    const segments = node.id.split('/');
    segments.pop();
    let prefix = '';
    for (const segment of segments) {
      prefix = prefix ? `${prefix}/${segment}` : segment;
      ids.add(prefix);
    }
  }
  return [...ids];
}

function buildElkNode(folder: FolderModel, collapsed: Set<string>): ElkNode {
  if (collapsed.has(folder.id)) {
    return { id: folder.id, width: FOLDER_COLLAPSED_W, height: FOLDER_COLLAPSED_H };
  }
  const children: ElkNode[] = [];
  for (const child of folder.folders.values()) {
    children.push(buildElkNode(child, collapsed));
  }
  for (const file of folder.files) {
    children.push({ id: file.id, width: FILE_W, height: FILE_H });
  }
  return { id: folder.id, layoutOptions: FOLDER_OPTIONS, children };
}

function remapEdges(edges: CodebaseMapEdge[], collapsed: Set<string>): ElkExtendedEdge[] {
  const seen = new Set<string>();
  const out: ElkExtendedEdge[] = [];
  for (const edge of edges) {
    const a = representativeOf(edge.from, (id) => collapsed.has(id));
    const b = representativeOf(edge.to, (id) => collapsed.has(id));
    if (a === b) continue;
    const key = `${a}>${b}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: `e_${out.length}`, sources: [a], targets: [b] });
  }
  return out;
}

export interface LayoutResult {
  nodes: Node[];
  edges: Edge[];
}

/**
 * Lay out the codebase as a structured tree+graph: folders are (collapsible) container nodes, files
 * are leaves inside them, and import edges connect files (or the collapsed folder that stands in for
 * them). Uses ELK's layered algorithm with hierarchy so connected files sit near each other.
 */
export async function layoutCodebase(
  nodes: CodebaseMapNode[],
  edges: CodebaseMapEdge[],
  collapsed: Set<string>
): Promise<LayoutResult> {
  const model = buildModel(nodes);
  const fileById = new Map(nodes.map((node) => [node.id, node]));
  const fileCountById = new Map<string, number>();
  const collectCounts = (folder: FolderModel) => {
    if (folder.id) fileCountById.set(folder.id, countFiles(folder));
    for (const child of folder.folders.values()) collectCounts(child);
  };
  collectCounts(model);

  const rootChildren: ElkNode[] = [];
  for (const folder of model.folders.values()) {
    rootChildren.push(buildElkNode(folder, collapsed));
  }
  for (const file of model.files) {
    rootChildren.push({ id: file.id, width: FILE_W, height: FILE_H });
  }

  const graph: ElkNode = {
    id: 'root',
    layoutOptions: ROOT_OPTIONS,
    children: rootChildren,
    edges: remapEdges(edges, collapsed)
  };

  const laid = await getElk().layout(graph);

  const rfNodes: Node[] = [];
  const walk = (elkNode: ElkNode, parentId?: string) => {
    if (elkNode.id === 'root') {
      elkNode.children?.forEach((child) => walk(child, undefined));
      return;
    }
    const file = fileById.get(elkNode.id);
    const position = { x: elkNode.x ?? 0, y: elkNode.y ?? 0 };

    if (file) {
      const data: FileNodeData = {
        kind: 'file',
        label: file.label,
        dir: file.dir,
        language: file.language,
        degree: file.degree
      };
      rfNodes.push({
        id: file.id,
        type: 'file',
        position,
        data,
        ...(parentId ? { parentId, extent: 'parent' as const } : {})
      });
      return;
    }

    // Folder node (collapsed leaf or expanded container).
    const isCollapsed = collapsed.has(elkNode.id);
    const data: FolderNodeData = {
      kind: 'folder',
      name: elkNode.id.split('/').pop() ?? elkNode.id,
      collapsed: isCollapsed,
      fileCount: fileCountById.get(elkNode.id) ?? 0
    };
    rfNodes.push({
      id: elkNode.id,
      type: 'folder',
      position,
      data,
      draggable: false,
      selectable: true,
      style: {
        width: elkNode.width ?? FOLDER_COLLAPSED_W,
        height: elkNode.height ?? FOLDER_COLLAPSED_H
      },
      ...(parentId ? { parentId } : {})
    });
    if (!isCollapsed) {
      elkNode.children?.forEach((child) => walk(child, elkNode.id));
    }
  };
  walk(laid);

  const rfEdges: Edge[] = (laid.edges ?? graph.edges ?? []).map((edge) => ({
    id: edge.id,
    source: edge.sources[0],
    target: edge.targets[0],
    // Orthogonal routing reads cleanly in a left→right dependency tree (fewer crossings).
    type: 'smoothstep'
  }));

  return { nodes: rfNodes, edges: rfEdges };
}
