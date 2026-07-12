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
import type { BrainGraphEdge, BrainGraphNode } from '@/containers/voice-console/lib/types';

export interface GraphSimNode extends SimulationNodeDatum {
  id: string;
}

export type GraphSimLink = SimulationLinkDatum<GraphSimNode> & { weight: number };

/**
 * Builds a lightweight force layout from the REAL backend graph. Edges are used verbatim — never
 * recomputed here — so link strength/distance simply reflect the backend `weight`. Node positions
 * are seeded on a ring so the first tick starts spread out rather than collapsed at the origin.
 */
export function createGraphSimulation(
  nodes: BrainGraphNode[],
  edges: BrainGraphEdge[]
): {
  simulation: Simulation<GraphSimNode, GraphSimLink>;
  simNodes: GraphSimNode[];
} {
  const count = Math.max(nodes.length, 1);
  const radius = Math.max(160, Math.min(520, count * 16));

  const simNodes: GraphSimNode[] = nodes.map((node, index) => {
    const angle = (index / count) * Math.PI * 2;
    return {
      id: node.id,
      x: Math.cos(angle) * radius + (Math.random() - 0.5) * 40,
      y: Math.sin(angle) * radius + (Math.random() - 0.5) * 40
    };
  });

  const nodeIds = new Set(simNodes.map((node) => node.id));
  const simLinks: GraphSimLink[] = edges
    .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
    .map((edge) => ({ source: edge.source, target: edge.target, weight: edge.weight }));

  const simulation = forceSimulation<GraphSimNode>(simNodes)
    .force('charge', forceManyBody<GraphSimNode>().strength(-260).distanceMax(640))
    // Dots are small but carry a label beneath them; keep enough breathing room that labels don't
    // stack on neighbouring dots.
    .force('collide', forceCollide<GraphSimNode>().radius(52).strength(0.9).iterations(3))
    .force(
      'link',
      forceLink<GraphSimNode, GraphSimLink>(simLinks)
        .id((node) => node.id)
        // Stronger shared-entity overlap (higher weight) pulls atoms closer together.
        .distance((link) => 150 - Math.min(70, link.weight * 90))
        .strength((link) => Math.min(0.5, 0.12 + link.weight * 0.3))
    )
    .force('x', forceX<GraphSimNode>(0).strength(0.045))
    .force('y', forceY<GraphSimNode>(0).strength(0.045))
    .alpha(0.9)
    .alphaDecay(0.035)
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
