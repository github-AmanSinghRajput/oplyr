import type { AssistantProviderId } from '../../types.js';
import type { BrainAtomRecord } from './brain.types.js';

// Builds the Memory graph shown in the UI. Nodes are memories; an edge connects two memories that
// share a named entity (a file, tool, project, or person the distiller tagged). The edges are a
// deterministic function of REAL stored entities — not frontend text-similarity guesswork — so the
// picture reflects how the brain actually relates things.

const MAX_EDGES_PER_NODE = 6;

export interface BrainGraphNode {
  id: string;
  label: string;
  type: BrainAtomRecord['type'];
  scope: BrainAtomRecord['scope'];
  projectKey: string | null;
  salience: number;
  confidence: number;
  contributors: AssistantProviderId[];
  entities: string[];
}

export interface BrainGraphEdge {
  id: string;
  source: string;
  target: string;
  weight: number;
  sharedEntities: string[];
}

export interface BrainGraphData {
  nodes: BrainGraphNode[];
  edges: BrainGraphEdge[];
}

export function buildBrainGraph(atoms: BrainAtomRecord[]): BrainGraphData {
  const nodes = atoms.map(toNode);

  // Candidate edges: every pair sharing >= 1 entity, scored by how much they overlap.
  const candidates: BrainGraphEdge[] = [];
  for (let i = 0; i < atoms.length; i += 1) {
    const a = atoms[i]!;
    const aEntities = new Set(a.entities.map((entity) => entity.toLowerCase()));
    if (aEntities.size === 0) {
      continue;
    }
    for (let j = i + 1; j < atoms.length; j += 1) {
      const b = atoms[j]!;
      const shared = b.entities.filter((entity) => aEntities.has(entity.toLowerCase()));
      if (shared.length === 0) {
        continue;
      }
      const denominator = Math.max(a.entities.length, b.entities.length, 1);
      candidates.push({
        id: `${a.id}:${b.id}`,
        source: a.id,
        target: b.id,
        weight: shared.length / denominator,
        sharedEntities: shared
      });
    }
  }

  // Keep the strongest edges but cap per-node degree so dense hubs don't create a hairball.
  candidates.sort((a, b) => b.weight - a.weight);
  const degree = new Map<string, number>();
  const edges: BrainGraphEdge[] = [];
  for (const edge of candidates) {
    if ((degree.get(edge.source) ?? 0) >= MAX_EDGES_PER_NODE) {
      continue;
    }
    if ((degree.get(edge.target) ?? 0) >= MAX_EDGES_PER_NODE) {
      continue;
    }
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
    edges.push(edge);
  }

  return { nodes, edges };
}

function toNode(atom: BrainAtomRecord): BrainGraphNode {
  return {
    id: atom.id,
    label: atom.text.length > 80 ? `${atom.text.slice(0, 77)}...` : atom.text,
    type: atom.type,
    scope: atom.scope,
    projectKey: atom.projectKey,
    salience: atom.salience,
    confidence: atom.confidence,
    contributors: atom.contributors.map((contributor) => contributor.providerId),
    entities: atom.entities
  };
}
