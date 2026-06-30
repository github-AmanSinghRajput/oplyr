import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './codebase-map.css';
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
import type { CodebaseMapData } from '@/containers/voice-console/lib/types';
import { forceNodeTypes, type Highlight } from './force-nodes';
import { buildHierarchy, computeVisibleGraph } from './force-model';
import { colorForDir } from './nodes';
import { EDGE_HOT, EDGE_IDLE } from './shared';

type SimNode = SimulationNodeDatum & { id: string };
type SimLink = SimulationLinkDatum<SimNode> & { kind: 'member' | 'import' };
// Alpha the sim is warmed to during a drag so neighbours react; it cools back to a full stop after.
const DRAG_ALPHA = 0.3;
// Minimum empty distance kept between two node bounding circles so nodes never touch/cluster.
const MIN_GAP = 22;
// Collision radius for a node before React Flow has measured it (corrected once measured).
const FALLBACK_RADIUS = 60;

// Per-node collision radius from the node's *measured* size. Use half the bounding diagonal so the
// circle fully contains the (wide) pill/chip — two non-overlapping circles then guarantee the
// rectangles never overlap, regardless of how long a folder/file label is. Plus MIN_GAP of breathing
// room so neighbours slide apart instead of clustering.
function collideRadiusFor(size: { w: number; h: number } | undefined) {
  if (!size) return FALLBACK_RADIUS;
  return Math.hypot(size.w, size.h) / 2 + MIN_GAP;
}

function ForceFlow({
  map,
  selectedId,
  onSelect
}: {
  map: CodebaseMapData;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const hierarchy = useMemo(() => buildHierarchy(map.nodes), [map]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null);
  const simById = useRef<Map<string, SimNode>>(new Map());
  const posRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  // Live measured node sizes (from React Flow), keyed by id — feeds per-node collision radii.
  const sizeRef = useRef<Map<string, { w: number; h: number }>>(new Map());
  const draggingIdRef = useRef<string | null>(null);
  // Stable adjacency (member + import) for neighbour highlighting — read from a ref so the
  // selection effect doesn't depend on the edge state it itself mutates (would loop).
  const adjacencyRef = useRef<{ source: string; target: string }[]>([]);
  const [structureVersion, setStructureVersion] = useState(0);
  const { fitView } = useReactFlow();

  // ── Build / rebuild when the visible structure changes (expand/collapse) ────
  useEffect(() => {
    const { nodes: visNodes, edges: importEdges } = computeVisibleGraph(
      hierarchy,
      expanded,
      map.edges
    );

    const topIds = visNodes.filter((n) => n.parentId === null).map((n) => n.id);
    const ringRadius = Math.max(360, topIds.length * 130);
    const ringAnchor = (id: string): { x: number; y: number } => {
      const i = topIds.indexOf(id);
      const angle = (i / Math.max(topIds.length, 1)) * Math.PI * 2;
      return { x: Math.cos(angle) * ringRadius, y: Math.sin(angle) * ringRadius };
    };

    // Seed positions: keep where things already were; spawn new children out of their parent.
    const pos = posRef.current;
    const simNodes: SimNode[] = visNodes.map((vn) => {
      const existing = pos.get(vn.id);
      if (existing) return { id: vn.id, x: existing.x, y: existing.y };
      if (vn.parentId && pos.get(vn.parentId)) {
        const p = pos.get(vn.parentId)!;
        return {
          id: vn.id,
          x: p.x + (Math.random() - 0.5) * 60,
          y: p.y + (Math.random() - 0.5) * 60
        };
      }
      const a = ringAnchor(vn.id);
      return {
        id: vn.id,
        x: a.x + (Math.random() - 0.5) * 40,
        y: a.y + (Math.random() - 0.5) * 40
      };
    });
    const byId = new Map(simNodes.map((n) => [n.id, n]));
    simById.current = byId;
    // Drop measured sizes for nodes that no longer exist (collapsed away) so the map stays bounded.
    for (const id of sizeRef.current.keys()) {
      if (!byId.has(id)) sizeRef.current.delete(id);
    }

    setNodes(
      visNodes.map((vn) => {
        const sim = byId.get(vn.id)!;
        return {
          id: vn.id,
          type: vn.kind === 'folder' ? 'forceFolder' : 'forceFile',
          position: { x: sim.x ?? 0, y: sim.y ?? 0 },
          zIndex: vn.kind === 'folder' ? 1 : 2,
          data:
            vn.kind === 'folder'
              ? {
                  kind: 'folder',
                  name: vn.name,
                  collapsed: vn.collapsed,
                  childCount: vn.childCount ?? 0,
                  descendantFileCount: vn.descendantFileCount ?? 0,
                  highlight: 'none' as Highlight
                }
              : { kind: 'file', label: vn.label, dir: vn.dir, highlight: 'none' as Highlight }
        } satisfies Node;
      })
    );

    // Membership edges (folder → child) + import edges (file → file / aggregated).
    const memberEdges: Edge[] = visNodes
      .filter((vn) => vn.parentId)
      .map((vn) => ({
        id: `m_${vn.id}`,
        source: vn.parentId as string,
        target: vn.id,
        style: {
          stroke: `color-mix(in srgb, ${colorForDir(vn.dir ?? vn.name ?? '')}, transparent 78%)`,
          strokeWidth: 1
        },
        selectable: false
      }));
    const impEdges: Edge[] = importEdges.map((e) => ({
      id: e.id,
      source: e.from,
      target: e.to,
      data: { kind: 'import' },
      style: { stroke: EDGE_IDLE, strokeWidth: 1.1 }
    }));
    setEdges([...memberEdges, ...impEdges]);
    adjacencyRef.current = [...memberEdges, ...impEdges].map((e) => ({
      source: e.source,
      target: e.target
    }));
    // Bump once per rebuild so the selection-highlight effect recomputes against fresh adjacency.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional one-time relayout trigger
    setStructureVersion((v) => v + 1);

    const links: SimLink[] = [
      ...visNodes
        .filter((vn) => vn.parentId)
        .map((vn) => ({ source: vn.parentId as string, target: vn.id, kind: 'member' as const })),
      ...importEdges
        .filter((e) => byId.has(e.from) && byId.has(e.to))
        .map((e) => ({ source: e.from, target: e.to, kind: 'import' as const }))
    ];

    const simulation = forceSimulation<SimNode>(simNodes)
      .force('charge', forceManyBody<SimNode>().strength(-260).distanceMax(700))
      // Per-node collision sized to each node's measured bounds (+MIN_GAP) so folders/files/subfolders
      // never overlap. Firm strength + extra iterations resolve separation reliably; velocityDecay
      // (0.5) keeps it from reading as jitter.
      .force(
        'collide',
        forceCollide<SimNode>()
          .radius((n) => collideRadiusFor(sizeRef.current.get(n.id)))
          .strength(0.9)
          .iterations(4)
      )
      .force(
        'link',
        forceLink<SimNode, SimLink>(links)
          .id((n) => n.id)
          .distance((l) => (l.kind === 'member' ? 60 : 160))
          .strength((l) => (l.kind === 'member' ? 0.5 : 0.04))
      )
      // Real center of gravity: strong enough to balance the charge repulsion so the graph settles
      // into a compact, bounded layout around the origin instead of drifting outward forever.
      .force('x', forceX(0).strength(0.08))
      .force('y', forceY(0).strength(0.08))
      .alpha(0.9)
      .alphaDecay(0.028)
      // Higher friction = calmer, less oscillation. alphaTarget stays at its default (0) so the sim
      // cools to a full stop after settling — no perpetual drift.
      .velocityDecay(0.55);

    simulation.on('tick', () => {
      // Positions only — keep each node's `data` reference identical so React Flow just transforms
      // the node (no React re-render of the node component) → smooth, no jitter. Skip the node the
      // user is actively dragging (React Flow owns its position then).
      setNodes((prev) =>
        prev.map((node) => {
          if (node.id === draggingIdRef.current) return node;
          const sim = byId.get(node.id);
          if (!sim) return node;
          const x = sim.x ?? 0;
          const y = sim.y ?? 0;
          posRef.current.set(node.id, { x, y });
          if (node.position.x === x && node.position.y === y) return node;
          return { ...node, position: { x, y } };
        })
      );
    });

    simRef.current = simulation;
    // Reframe after every structural change (initial load + expand/collapse) once the sim has
    // settled a little and React Flow has measured node sizes — guarantees the graph is on-screen.
    const fitTimer = window.setTimeout(
      () => fitView({ padding: 0.3, duration: 450, maxZoom: 1.2 }),
      420
    );
    return () => {
      simulation.stop();
      window.clearTimeout(fitTimer);
    };
    // `hierarchy` already tracks map.nodes; map.edges is the only other input we read.
  }, [hierarchy, expanded, map.edges, fitView, setNodes, setEdges]);

  // ── Selection highlight (runs only on selection / structure change, never per tick) ──
  useEffect(() => {
    const neighbours = new Set<string>();
    if (selectedId) {
      for (const edge of adjacencyRef.current) {
        if (edge.source === selectedId) neighbours.add(edge.target);
        if (edge.target === selectedId) neighbours.add(edge.source);
      }
    }
    setNodes((prev) =>
      prev.map((node) => {
        const highlight: Highlight = !selectedId
          ? 'none'
          : node.id === selectedId
            ? 'selected'
            : neighbours.has(node.id)
              ? 'neighbor'
              : 'dim';
        if (node.data.highlight === highlight) return node;
        return { ...node, data: { ...node.data, highlight } };
      })
    );
    setEdges((prev) =>
      prev.map((edge) => {
        const isImport = (edge.data as { kind?: string } | undefined)?.kind === 'import';
        const hot = !!selectedId && (edge.source === selectedId || edge.target === selectedId);
        if (!isImport) return edge;
        return {
          ...edge,
          animated: hot,
          style: {
            stroke: hot ? EDGE_HOT : EDGE_IDLE,
            strokeWidth: hot ? 1.8 : 1.1,
            opacity: selectedId && !hot ? 0.2 : 1
          }
        };
      })
    );
  }, [selectedId, structureVersion, setNodes, setEdges]);

  // ── Interaction ─────────────────────────────────────────────────────────────
  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (node.type === 'forceFolder') {
        setExpanded((prev) => {
          const next = new Set(prev);
          if (next.has(node.id)) next.delete(node.id);
          else next.add(node.id);
          return next;
        });
        return;
      }
      onSelect(node.id);
    },
    [onSelect]
  );

  const pin = useCallback((node: Node) => {
    const sim = simById.current.get(node.id);
    if (sim) {
      sim.fx = node.position.x;
      sim.fy = node.position.y;
    }
  }, []);
  const onNodeDragStart = useCallback(
    (_e: MouseEvent | TouchEvent, node: Node) => {
      draggingIdRef.current = node.id;
      pin(node);
      simRef.current?.alphaTarget(DRAG_ALPHA).restart();
    },
    [pin]
  );
  const onNodeDrag = useCallback((_e: MouseEvent | TouchEvent, node: Node) => pin(node), [pin]);

  // Capture React Flow's measured node sizes so the collision force can size each node's bubble to
  // its real footprint. When new measurements arrive, nudge the sim so collide re-resolves spacing.
  const handleNodesChange = useCallback<typeof onNodesChange>(
    (changes) => {
      let measured = false;
      for (const change of changes) {
        if (change.type === 'dimensions' && change.dimensions) {
          sizeRef.current.set(change.id, {
            w: change.dimensions.width,
            h: change.dimensions.height
          });
          measured = true;
        }
      }
      onNodesChange(changes);
      if (measured) {
        const sim = simRef.current;
        if (sim) sim.alpha(Math.max(sim.alpha(), 0.3)).restart();
      }
    },
    [onNodesChange]
  );
  const onNodeDragStop = useCallback((_e: MouseEvent | TouchEvent, node: Node) => {
    const sim = simById.current.get(node.id);
    if (sim) {
      sim.fx = null;
      sim.fy = null;
    }
    draggingIdRef.current = null;
    // Release the target so the sim cools to a full stop (alphaTarget default 0) instead of drifting.
    simRef.current?.alphaTarget(0);
  }, []);

  return (
    <ReactFlow
      className="cbmap-flow"
      nodes={nodes}
      edges={edges}
      onNodesChange={handleNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={forceNodeTypes}
      onNodeClick={onNodeClick}
      onNodeDragStart={onNodeDragStart}
      onNodeDrag={onNodeDrag}
      onNodeDragStop={onNodeDragStop}
      onPaneClick={() => onSelect(null)}
      minZoom={0.05}
      proOptions={{ hideAttribution: true }}
      nodesConnectable={false}
    >
      <Background gap={26} size={1} color="var(--color-border, #262b36)" />
      <Controls showInteractive={false} className="!shadow-none" />
    </ReactFlow>
  );
}

export function ForceGraph(props: {
  map: CodebaseMapData;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  return (
    <ReactFlowProvider>
      <ForceFlow {...props} />
    </ReactFlowProvider>
  );
}
