import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum
} from 'd3-force';
import type {
  BrainAtomType,
  BrainGraphEdge,
  BrainGraphNode
} from '@/containers/voice-console/lib/types';

export interface GraphSimNode extends SimulationNodeDatum {
  id: string;
}

export type GraphSimLink = SimulationLinkDatum<GraphSimNode> & { weight: number };

// The brain's OWN layout logic (not a flat blob and not the codebase map's folder hierarchy): atoms
// cluster by TYPE into neighborhoods around a ring — decisions with decisions, conventions with
// conventions, and so on — so the *shape* of your memory reads at a glance. Ordered so related kinds
// sit next to each other.
export const TYPE_CLUSTER_ORDER: BrainAtomType[] = [
  'decision',
  'convention',
  'preference',
  'fact',
  'entity'
];

export interface ClusterAnchors {
  anchorFor: (type: BrainAtomType | undefined) => { x: number; y: number };
}

/** A ring of per-type anchor points, sized to the graph so clusters don't collide as it grows. */
export function buildClusterAnchors(nodeCount: number): ClusterAnchors {
  const radius = Math.max(260, Math.min(700, nodeCount * 26));
  const anchors = new Map<BrainAtomType, { x: number; y: number }>();
  TYPE_CLUSTER_ORDER.forEach((type, index) => {
    // Start at the top (−90°) and go clockwise so the arrangement is stable + predictable.
    const angle = (index / TYPE_CLUSTER_ORDER.length) * Math.PI * 2 - Math.PI / 2;
    anchors.set(type, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
  });
  const center = { x: 0, y: 0 };
  return { anchorFor: (type) => (type ? (anchors.get(type) ?? center) : center) };
}

export interface MemorySimulationOptions {
  /** Live per-node collision radius from React Flow's measured node size (so labels never overlap). */
  radiusOf: (id: string) => number;
  /** The type-cluster anchor a node is pulled toward. */
  anchorOf: (id: string) => { x: number; y: number };
  /** Prior positions to keep the layout stable across graph updates; new atoms seed at their anchor. */
  seed?: Map<string, { x: number; y: number }>;
}

/**
 * Force layout for the REAL backend brain graph. Edges are used verbatim (link strength/distance
 * reflect the backend `weight`). Mirrors the codebase-map engine — measured collision, firm charge,
 * high friction, cool-to-stop — plus a type-clustering force that gives the brain its own shape.
 */
export function createMemorySimulation(
  nodes: BrainGraphNode[],
  edges: BrainGraphEdge[],
  options: MemorySimulationOptions
): {
  simulation: Simulation<GraphSimNode, GraphSimLink>;
  simNodes: GraphSimNode[];
} {
  const simNodes: GraphSimNode[] = nodes.map((node) => {
    const existing = options.seed?.get(node.id);
    if (existing) {
      return { id: node.id, x: existing.x, y: existing.y };
    }
    const anchor = options.anchorOf(node.id);
    return {
      id: node.id,
      x: anchor.x + (Math.random() - 0.5) * 90,
      y: anchor.y + (Math.random() - 0.5) * 90
    };
  });

  const nodeIds = new Set(simNodes.map((node) => node.id));
  const simLinks: GraphSimLink[] = edges
    .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
    .map((edge) => ({ source: edge.source, target: edge.target, weight: edge.weight }));

  const simulation = forceSimulation<GraphSimNode>(simNodes)
    .force('charge', forceManyBody<GraphSimNode>().strength(-240).distanceMax(720))
    // Per-node collision sized to each dot+label's MEASURED footprint (+MIN_GAP) so labels never
    // stack on neighbours — the main thing that made the old layout read as cheap.
    .force(
      'collide',
      forceCollide<GraphSimNode>()
        .radius((node) => options.radiusOf(node.id))
        .strength(0.9)
        .iterations(4)
    )
    .force(
      'link',
      forceLink<GraphSimNode, GraphSimLink>(simLinks)
        .id((node) => node.id)
        // Stronger shared-entity overlap (higher weight) pulls atoms closer together.
        .distance((link) => 150 - Math.min(70, link.weight * 90))
        .strength((link) => Math.min(0.5, 0.12 + link.weight * 0.3))
    )
    // Type-clustering: gently pull each atom toward its type's neighborhood anchor. Weaker than the
    // links, so a strong shared-entity edge can still draw two different-type atoms together.
    .force('cluster-x', forceX<GraphSimNode>((node) => options.anchorOf(node.id).x).strength(0.13))
    .force('cluster-y', forceY<GraphSimNode>((node) => options.anchorOf(node.id).y).strength(0.13))
    .alpha(0.9)
    .alphaDecay(0.028)
    // Higher friction = calmer settle, no perpetual drift (alphaTarget stays 0 unless dragging).
    .velocityDecay(0.55);

  return { simulation, simNodes };
}

/** Node degree map (for sizing hubs), derived from the backend edges. */
export function computeDegrees(edges: BrainGraphEdge[]): Map<string, number> {
  const degree = new Map<string, number>();
  for (const edge of edges) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  }
  return degree;
}
