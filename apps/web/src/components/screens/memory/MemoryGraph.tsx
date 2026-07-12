import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { BrainGraphEdge, BrainGraphNode } from '@/containers/voice-console/lib/types';
import { cleanAtomText, colorForType } from './memory-shared';
import { computeDegrees, createGraphSimulation } from './memory-graph-simulation';

type Highlight = 'selected' | 'neighbor' | 'dim' | 'none';

// Dot diameter range (px). Hubs (higher degree) read larger, singletons stay small.
const DOT_MIN = 16;
const DOT_MAX = 46;

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

function GraphCanvas({
  nodes: graphNodes,
  edges: graphEdges,
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
  const { fitView } = useReactFlow();

  const degrees = useMemo(() => computeDegrees(graphEdges), [graphEdges]);
  const maxDegree = useMemo(() => {
    let max = 0;
    for (const value of degrees.values()) {
      if (value > max) max = value;
    }
    return max;
  }, [degrees]);

  // Build the flow nodes/edges and run the force sim whenever the backend graph changes.
  useEffect(() => {
    const { simulation, simNodes } = createGraphSimulation(graphNodes, graphEdges);
    const byId = new Map(simNodes.map((simNode) => [simNode.id, simNode]));
    posRef.current = new Map();

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
        source: edge.source,
        target: edge.target,
        // Edges are now first-class, clickable objects (the rail shows the shared-entity link).
        selectable: true,
        style: {
          stroke: 'var(--color-border-strong)',
          strokeWidth: 1 + Math.min(2.4, edge.weight * 2.4),
          opacity: 0.45
        }
      }))
    );

    simulation.on('tick', () => {
      setNodes((previous) =>
        previous.map((node) => {
          const sim = byId.get(node.id);
          if (!sim) {
            return node;
          }
          const x = sim.x ?? 0;
          const y = sim.y ?? 0;
          posRef.current.set(node.id, { x, y });
          if (node.position.x === x && node.position.y === y) {
            return node;
          }
          return { ...node, position: { x, y } };
        })
      );
    });

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
  }, [degrees, fitView, graphEdges, graphNodes, maxDegree, setEdges, setNodes]);

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

  return (
    <ReactFlow
      className="memory-flow"
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      onNodeClick={(_event, node) => onSelectNode(node.id)}
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
