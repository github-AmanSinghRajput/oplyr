import type {
  AssistantProviderId,
  BrainAtom,
  BrainAtomScope,
  BrainAtomSensitivity,
  BrainAtomType,
  BrainGraphNode,
  BrainRecallAtom
} from '@/containers/voice-console/lib/types';

/**
 * A normalized view of a selected atom for the detail panel. The same id may be selected from the
 * graph, the search results, or the live feed — each carries a different slice of the record — so we
 * resolve the richest available fields and mark what's missing.
 */
export interface AtomDetail {
  id: string;
  text: string;
  type: BrainAtomType;
  scope: BrainAtomScope;
  projectKey: string | null;
  sensitivity: BrainAtomSensitivity | null;
  confidence: number | null;
  crossProject: boolean | null;
  contributors: AssistantProviderId[];
  entities: string[];
  capturedAt: string | null;
  lastSeenAt: string | null;
  source: string | null;
}

function fromRecord(atom: BrainAtom, currentProjectKey: string | null): AtomDetail {
  return {
    id: atom.id,
    text: atom.text,
    type: atom.type,
    scope: atom.scope,
    projectKey: atom.projectKey,
    sensitivity: atom.sensitivity,
    confidence: atom.confidence,
    crossProject:
      atom.scope === 'project' && atom.projectKey !== null && atom.projectKey !== currentProjectKey,
    contributors: atom.contributors.map((contributor) => contributor.providerId),
    entities: atom.entities,
    capturedAt: atom.provenance.capturedAt,
    lastSeenAt: atom.lastSeenAt,
    source: atom.provenance.source
  };
}

function fromRecall(atom: BrainRecallAtom): AtomDetail {
  return {
    id: atom.id,
    text: atom.text,
    type: atom.type,
    scope: atom.scope,
    projectKey: atom.projectKey,
    sensitivity: atom.sensitivity,
    confidence: null,
    crossProject: atom.crossProject,
    contributors: atom.contributors,
    entities: [],
    capturedAt: atom.provenance.capturedAt,
    lastSeenAt: atom.lastSeenAt,
    source: atom.provenance.source
  };
}

function fromNode(node: BrainGraphNode, currentProjectKey: string | null): AtomDetail {
  return {
    id: node.id,
    text: node.label,
    type: node.type,
    scope: node.scope,
    projectKey: node.projectKey,
    sensitivity: null,
    confidence: node.confidence,
    crossProject:
      node.scope === 'project' && node.projectKey !== null && node.projectKey !== currentProjectKey,
    contributors: node.contributors,
    entities: node.entities,
    capturedAt: null,
    lastSeenAt: null,
    source: null
  };
}

/** Resolve the richest available detail for `atomId`: feed record → search result → graph node. */
export function resolveAtomDetail(
  atomId: string,
  sources: {
    recentAtoms: BrainAtom[];
    searchResults: BrainRecallAtom[];
    graphNodes: BrainGraphNode[];
    currentProjectKey: string | null;
  }
): AtomDetail | null {
  const record = sources.recentAtoms.find((atom) => atom.id === atomId);
  if (record) {
    return fromRecord(record, sources.currentProjectKey);
  }

  const recall = sources.searchResults.find((atom) => atom.id === atomId);
  if (recall) {
    return fromRecall(recall);
  }

  const node = sources.graphNodes.find((graphNode) => graphNode.id === atomId);
  if (node) {
    return fromNode(node, sources.currentProjectKey);
  }

  return null;
}
