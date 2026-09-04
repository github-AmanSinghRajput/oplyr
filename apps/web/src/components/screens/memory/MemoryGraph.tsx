import { useCallback, useEffect, useMemo, useRef, type CSSProperties } from 'react';
import {
  Background,
  BaseEdge,
  Controls,
  getBezierPath,
  Handle,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useInternalNode,
  useNodesState,
  useReactFlow,
  type Edge,
  type EdgeProps,
  type InternalNode,
  type Node,
  type NodeProps
} from '@xyflow/react';
import type { Simulation } from 'd3-force';
import '@xyflow/react/dist/style.css';
import type {
  BrainAtomType,
  BrainGraphEdge,
  BrainGraphNode
} from '@/containers/voice-console/lib/types';
import { cleanAtomText, colorForType } from './memory-shared';
import {
  buildClusterAnchors,
  computeDegrees,
  createMemorySimulation,
  TYPE_CLUSTER_ORDER,
  type GraphSimLink,
  type GraphSimNode
} from './memory-graph-simulation';

type Highlight = 'selected' | 'neighbor' | 'dim' | 'none';

// Dot diameter range (px). Hubs (higher degree) read larger, singletons stay small.
const DOT_MIN = 16;
const DOT_MAX = 46;
// Alpha the sim warms to while dragging so neighbours react; it cools back to a full stop after.
const DRAG_ALPHA = 0.3;
// Breathing room kept around each node's measured footprint so dots + labels never touch.
const MIN_GAP = 18;
// Collision radius before React Flow has measured a node (corrected once measured).
const FALLBACK_RADIUS = 48;
// Render budget: React Flow mounts a DOM node per atom + an SVG path per edge. Past this we keep the
// most-connected atoms (the shape of the brain) and summarise the rest, so a big import can't turn the
// canvas into thousands of live elements. Mirrors how the codebase map truncates instead of drawing all.
const MAX_RENDERED_NODES = 500;

interface GraphNodeData {
  label: string;
  accent: string;
  highlight: Highlight;
  size: number;
  [key: string]: unknown;
}

type FlowNode = Node<GraphNodeData, 'brainDot'>;

function accentFor(node: BrainGraphNode): string {
  // Global (cross-project) atoms read as accent; project atoms take their type color.
  return node.scope === 'global' ? 'var(--color-accent)' : colorForType(node.type);
}

/** Map a node's degree onto a clamped dot diameter (more links → bigger hub). */
function sizeForDegree(degree: number, maxDegree: number): number {
  if (maxDegree <= 0) {
    return DOT_MIN;
  }
  const ratio = Math.sqrt(degree / maxDegree); // sqrt so hubs don't dwarf everything
  return Math.round(DOT_MIN + (DOT_MAX - DOT_MIN) * ratio);
}

/** Per-node collision radius from React Flow's measured size (half the bounding diagonal + gap), so
 *  a node's whole footprint — orb AND label — is kept clear of its neighbours. */
function collideRadiusFor(size: { w: number; h: number } | undefined): number {
  if (!size) return FALLBACK_RADIUS;
  return Math.hypot(size.w, size.h) / 2 + MIN_GAP;
}

/** Obsidian-style node: a glowing circular dot with a small muted label sitting below it. */
function BrainDotNode({ data }: NodeProps<FlowNode>) {
  return (
    <div className="brain-dot" data-highlight={data.highlight} style={dotWrapperStyle(data.size)}>
      <Handle type="target" position={Position.Top} className="brain-dot__handle" />
      <span
        className="brain-dot__orb"
        style={dotOrbStyle(data.highlight, data.accent, data.size)}
      />
      <span className="brain-dot__label" title={data.label}>
        {data.label}
      </span>
      <Handle type="source" position={Position.Bottom} className="brain-dot__handle" />
    </div>
  );
}

const nodeTypes = { brainDot: BrainDotNode };

/** Endpoints on each dot's rim, along the line joining the two orb centers, plus the side each end
 *  faces — so every edge leaves a node from the side facing its neighbour AND curves naturally out of
 *  that side. Fixes edges exiting the fixed bottom handle regardless of where the connected atom sits
 *  (the orb is a `size`×`size` box at the node's top-left). */
function rimEndpoints(source: InternalNode<FlowNode>, target: InternalNode<FlowNode>) {
  const ds = source.data.size;
  const dt = target.data.size;
  const scx = source.internals.positionAbsolute.x + ds / 2;
  const scy = source.internals.positionAbsolute.y + ds / 2;
  const tcx = target.internals.positionAbsolute.x + dt / 2;
  const tcy = target.internals.positionAbsolute.y + dt / 2;
  const dx = tcx - scx;
  const dy = tcy - scy;
  const dist = Math.hypot(dx, dy) || 1;
  const ux = dx / dist;
  const uy = dy / dist;
  // The dominant axis decides which side the curve leaves/enters, so the bezier bows out toward the
  // neighbour instead of always from top/bottom.
  const horizontal = Math.abs(ux) >= Math.abs(uy);
  return {
    sx: scx + ux * (ds / 2),
    sy: scy + uy * (ds / 2),
    tx: tcx - ux * (dt / 2),
    ty: tcy - uy * (dt / 2),
    sourcePosition: horizontal
      ? ux >= 0
        ? Position.Right
        : Position.Left
      : uy >= 0
        ? Position.Bottom
        : Position.Top,
    targetPosition: horizontal
      ? ux >= 0
        ? Position.Left
        : Position.Right
      : uy >= 0
        ? Position.Top
        : Position.Bottom
  };
}

/** Custom edge whose curved path is derived from the two nodes' live positions (not fixed handles). */
function FloatingBrainEdge({ id, source, target, markerEnd, style }: EdgeProps) {
  const sourceNode = useInternalNode<FlowNode>(source);
  const targetNode = useInternalNode<FlowNode>(target);
  if (!sourceNode || !targetNode) return null;
  const { sx, sy, tx, ty, sourcePosition, targetPosition } = rimEndpoints(sourceNode, targetNode);
  const [path] = getBezierPath({
    sourceX: sx,
    sourceY: sy,
    sourcePosition,
    targetX: tx,
    targetY: ty,
    targetPosition
  });
  return <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />;
}

const edgeTypes = { floating: FloatingBrainEdge };

const CLUSTER_LABELS: Record<BrainAtomType, string> = {
  decision: 'Decisions',
  convention: 'Conventions',
  preference: 'Preferences',
  fact: 'Facts',
  entity: 'Entities'
};

/** Legend for the type-clustered layout — tells the user each colored neighborhood is a memory type. */
function ClusterLegend() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '10px 12px',
        borderRadius: 12,
        border: '1px solid var(--color-border)',
        background: 'rgba(15, 17, 23, 0.66)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)'
      }}
    >
      <span
        style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'rgba(255, 255, 255, 0.5)'
        }}
      >
        Clustered by type
      </span>
      {TYPE_CLUSTER_ORDER.map((type) => {
        const color = colorForType(type);
        return (
          <span
            key={type}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 11,
              color: 'rgba(255, 255, 255, 0.72)'
            }}
          >
            <span
              style={{
                width: 9,
                height: 9,
                borderRadius: '50%',
                background: color,
                boxShadow: `0 0 8px color-mix(in srgb, ${color}, transparent 55%)`
              }}
            />
            {CLUSTER_LABELS[type]}
          </span>
        );
      })}
    </div>
  );
}

function GraphCanvas({
  nodes: allNodes,
  edges: allEdges,
  selectedId,
  selectedEdgeId,
  onSelectNode,
  onSelectEdge,
  onClear
}: {
  nodes: BrainGraphNode[];
  edges: BrainGraphEdge[];
  selectedId: string | null;
  selectedEdgeId: string | null;
  onSelectNode: (id: string) => void;
  onSelectEdge: (id: string) => void;
  onClear: () => void;
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const posRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  // Live measured node sizes (from React Flow), keyed by id — feeds per-node collision radii.
  const sizeRef = useRef<Map<string, { w: number; h: number }>>(new Map());
  const simRef = useRef<Simulation<GraphSimNode, GraphSimLink> | null>(null);
  const simById = useRef<Map<string, GraphSimNode>>(new Map());
  const draggingIdRef = useRef<string | null>(null);
  const { fitView } = useReactFlow();

  // Render budget: mount only the most-connected atoms so a large brain stays smooth; the rest are
  // summarised in a corner note. Everything below derives from these capped sets.
  const { graphNodes, graphEdges, hiddenCount } = useMemo(() => {
    if (allNodes.length <= MAX_RENDERED_NODES) {
      return { graphNodes: allNodes, graphEdges: allEdges, hiddenCount: 0 };
    }
    const deg = computeDegrees(allEdges);
    const kept = [...allNodes]
      .sort((a, b) => (deg.get(b.id) ?? 0) - (deg.get(a.id) ?? 0))
      .slice(0, MAX_RENDERED_NODES);
    const keepIds = new Set(kept.map((node) => node.id));
    return {
      graphNodes: kept,
      graphEdges: allEdges.filter((edge) => keepIds.has(edge.source) && keepIds.has(edge.target)),
      hiddenCount: allNodes.length - kept.length
    };
  }, [allNodes, allEdges]);

  const degrees = useMemo(() => computeDegrees(graphEdges), [graphEdges]);
  const maxDegree = useMemo(() => {
    let max = 0;
    for (const value of degrees.values()) {
      if (value > max) max = value;
    }
    return max;
  }, [degrees]);

  // Cluster layout inputs: each atom's type → its neighborhood anchor, and a live measured radius.
  const typeById = useMemo(
    () => new Map(graphNodes.map((node) => [node.id, node.type])),
    [graphNodes]
  );
  const anchors = useMemo(() => buildClusterAnchors(graphNodes.length), [graphNodes.length]);
  const anchorOf = useCallback(
    (id: string) => anchors.anchorFor(typeById.get(id)),
    [anchors, typeById]
  );
  const radiusOf = useCallback((id: string) => collideRadiusFor(sizeRef.current.get(id)), []);

  // Build the flow nodes/edges and run the force sim whenever the backend graph changes.
  useEffect(() => {
    // A cold first layout runs hot; a live re-layout (an import event added atoms) starts gentle so
    // the settled map barely shifts while just the new atoms find their place.
    const isReheat = posRef.current.size > 0;
    const { simulation, simNodes } = createMemorySimulation(graphNodes, graphEdges, {
      radiusOf,
      anchorOf,
      seed: posRef.current,
      alpha: isReheat ? 0.35 : 0.9
    });
    const byId = new Map(simNodes.map((simNode) => [simNode.id, simNode]));
    simById.current = byId;
    // Drop cached positions/sizes for atoms that no longer exist so the map stays bounded.
    for (const id of posRef.current.keys()) if (!byId.has(id)) posRef.current.delete(id);
    for (const id of sizeRef.current.keys()) if (!byId.has(id)) sizeRef.current.delete(id);

    setNodes(
      graphNodes.map((node) => {
        const sim = byId.get(node.id);
        return {
          id: node.id,
          type: 'brainDot' as const,
          position: { x: sim?.x ?? 0, y: sim?.y ?? 0 },
          data: {
            label: cleanAtomText(node.label) || node.label,
            accent: accentFor(node),
            highlight: 'none' as Highlight,
            size: sizeForDegree(degrees.get(node.id) ?? 0, maxDegree)
          }
        };
      })
    );

    setEdges(
      graphEdges.map((edge) => ({
        id: edge.id,
        type: 'floating' as const,
        source: edge.source,
        target: edge.target,
        // Edges are first-class, clickable objects (the rail shows the shared-entity link).
        selectable: true,
        style: {
          stroke: 'var(--color-border-strong)',
          strokeWidth: 1 + Math.min(2.4, edge.weight * 2.4),
          opacity: 0.45
        }
      }))
    );

    simulation.on('tick', () => {
      // Positions only — keep each node's `data` reference identical so React Flow just transforms
      // the node (no re-render of the node component) → smooth, no jitter. Skip the dragged node.
      setNodes((previous) =>
        previous.map((node) => {
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
    const fitTimer = window.setTimeout(
      () => fitView({ padding: 0.22, duration: 480, maxZoom: 1.3 }),
      520
    );

    return () => {
      // Detach the tick handler BEFORE stopping so a final queued tick can't write positions from
      // this (now-stale) simulation into the next effect's fresh state.
      simulation.on('tick', null);
      simulation.stop();
      window.clearTimeout(fitTimer);
    };
  }, [anchorOf, degrees, fitView, graphEdges, graphNodes, maxDegree, radiusOf, setEdges, setNodes]);

  // Selection highlighting: highlight the selected node + direct neighbors, dim the rest. A selected
  // edge highlights its two endpoints (and the edge itself) the same way.
  useEffect(() => {
    const neighbors = new Set<string>();
    const endpoints = new Set<string>();
    if (selectedId) {
      for (const edge of graphEdges) {
        if (edge.source === selectedId) neighbors.add(edge.target);
        if (edge.target === selectedId) neighbors.add(edge.source);
      }
    }
    if (selectedEdgeId) {
      const edge = graphEdges.find((candidate) => candidate.id === selectedEdgeId);
      if (edge) {
        endpoints.add(edge.source);
        endpoints.add(edge.target);
      }
    }

    const hasSelection = Boolean(selectedId || selectedEdgeId);

    setNodes((previous) =>
      previous.map((node) => {
        const highlight: Highlight = !hasSelection
          ? 'none'
          : node.id === selectedId || endpoints.has(node.id)
            ? 'selected'
            : neighbors.has(node.id)
              ? 'neighbor'
              : 'dim';
        if (node.data.highlight === highlight) {
          return node;
        }
        return { ...node, data: { ...node.data, highlight } };
      })
    );

    setEdges((previous) =>
      previous.map((edge) => {
        const touchesNode =
          !!selectedId && (edge.source === selectedId || edge.target === selectedId);
        const isSelectedEdge = edge.id === selectedEdgeId;
        const hot = touchesNode || isSelectedEdge;
        return {
          ...edge,
          selected: isSelectedEdge,
          animated: hot,
          style: {
            ...edge.style,
            stroke: hot ? 'var(--color-accent)' : 'var(--color-border-strong)',
            strokeWidth: isSelectedEdge
              ? 2.4
              : ((edge.style?.strokeWidth as number | undefined) ?? 1),
            opacity: hasSelection ? (hot ? 0.95 : 0.08) : 0.45
          }
        };
      })
    );
  }, [graphEdges, selectedEdgeId, selectedId, setEdges, setNodes]);

  // ── Drag: pin the node, warm the sim so neighbours make room, cool to a stop on release ──
  const pin = useCallback((node: Node) => {
    const sim = simById.current.get(node.id);
    if (sim) {
      sim.fx = node.position.x;
      sim.fy = node.position.y;
    }
  }, []);
  const onNodeDragStart = useCallback(
    (_event: MouseEvent | TouchEvent, node: Node) => {
      draggingIdRef.current = node.id;
      pin(node);
      simRef.current?.alphaTarget(DRAG_ALPHA).restart();
    },
    [pin]
  );
  const onNodeDrag = useCallback((_event: MouseEvent | TouchEvent, node: Node) => pin(node), [pin]);
  const onNodeDragStop = useCallback((_event: MouseEvent | TouchEvent, node: Node) => {
    const sim = simById.current.get(node.id);
    if (sim) {
      sim.fx = null;
      sim.fy = null;
    }
    draggingIdRef.current = null;
    simRef.current?.alphaTarget(0);
  }, []);

  // Capture React Flow's measured node sizes so collision sizes each dot's bubble to its real
  // footprint (orb + label). New measurements nudge the sim so spacing re-resolves.
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

  return (
    <ReactFlow
      className="memory-flow"
      nodes={nodes}
      edges={edges}
      // Declaratively fit once React Flow has measured the viewport + placed the nodes. The manual
      // fitView timer below reframes after the force sim settles, but on a cold mount (e.g. right
      // after the brain loads) it could run before the pane was measured, leaving the graph blank
      // until a manual refresh. This prop makes the initial fit fire as soon as the pane is ready.
      fitView
      fitViewOptions={{ padding: 0.22, maxZoom: 1.3 }}
      onNodesChange={handleNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodeClick={(_event, node) => onSelectNode(node.id)}
      onNodeDragStart={onNodeDragStart}
      onNodeDrag={onNodeDrag}
      onNodeDragStop={onNodeDragStop}
      onEdgeClick={(_event, edge) => onSelectEdge(edge.id)}
      onPaneClick={onClear}
      minZoom={0.1}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
      nodesConnectable={false}
      elementsSelectable
    >
      <Background gap={28} size={1} color="var(--color-border)" />
      <Controls showInteractive={false} />
      {/* Offset down so the legend clears the floating status pill ("Brain on / N total") that sits
          at the canvas top-left; without this the pill covers the legend's header + first row. */}
      <Panel position="top-left" style={{ marginTop: '3.6rem' }}>
        <ClusterLegend />
      </Panel>
      {hiddenCount > 0 && (
        <Panel position="top-right">
          <div
            style={{
              padding: '6px 10px',
              borderRadius: 10,
              border: '1px solid var(--color-border)',
              background: 'rgba(15, 17, 23, 0.66)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              fontSize: 11,
              color: 'rgba(255, 255, 255, 0.72)'
            }}
          >
            Showing {graphNodes.length} of {graphNodes.length + hiddenCount} most-connected memories
          </div>
        </Panel>
      )}
    </ReactFlow>
  );
}

export function MemoryGraph(props: {
  nodes: BrainGraphNode[];
  edges: BrainGraphEdge[];
  selectedId: string | null;
  selectedEdgeId: string | null;
  onSelectNode: (id: string) => void;
  onSelectEdge: (id: string) => void;
  onClear: () => void;
}) {
  return (
    <ReactFlowProvider>
      <GraphCanvas {...props} />
    </ReactFlowProvider>
  );
}

function dotWrapperStyle(size: number): CSSProperties {
  // Reserve the dot's footprint so React Flow centers/edges connect on the orb, not the label.
  return { width: size, height: size };
}

function dotOrbStyle(highlight: Highlight, accent: string, size: number): CSSProperties {
  const base: CSSProperties = {
    width: size,
    height: size,
    background: accent,
    color: accent
  };
  if (highlight === 'selected') {
    return {
      ...base,
      opacity: 1,
      boxShadow: `0 0 0 3px color-mix(in srgb, ${accent}, transparent 55%), 0 0 26px color-mix(in srgb, ${accent}, transparent 30%)`
    };
  }
  if (highlight === 'neighbor') {
    return {
      ...base,
      opacity: 1,
      boxShadow: `0 0 0 2px color-mix(in srgb, ${accent}, transparent 62%), 0 0 14px color-mix(in srgb, ${accent}, transparent 55%)`
    };
  }
  if (highlight === 'dim') {
    return { ...base, opacity: 0.18 };
  }
  return {
    ...base,
    opacity: 1,
    boxShadow: `0 0 12px color-mix(in srgb, ${accent}, transparent 62%)`
  };
}
