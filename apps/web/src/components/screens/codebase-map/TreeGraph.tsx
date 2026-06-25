import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './codebase-map.css';
import { nodeTypes } from './nodes';
import { layoutCodebase } from './elk-layout';
import type { CodebaseMapData } from '@/containers/voice-console/lib/types';
import { EDGE_HOT, EDGE_IDLE } from './shared';

function TreeFlow({
  map,
  selectedId,
  collapsed,
  onSelect,
  onToggleFolder
}: {
  map: CodebaseMapData;
  selectedId: string | null;
  collapsed: Set<string>;
  onSelect: (id: string) => void;
  onToggleFolder: (id: string) => void;
}) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const { fitView } = useReactFlow();
  // Only auto-fit when the map itself changes (load / re-scan). Expand/collapse must NOT re-fit —
  // otherwise the whole canvas zooms out every time you interact with a folder.
  const fittedMapRef = useRef<CodebaseMapData | null>(null);

  useEffect(() => {
    let active = true;
    void layoutCodebase(map.nodes, map.edges, collapsed).then((result) => {
      if (!active) return;
      setNodes(result.nodes);
      setEdges(result.edges);
      if (fittedMapRef.current !== map) {
        fittedMapRef.current = map;
        window.setTimeout(() => fitView({ padding: 0.18, duration: 400 }), 80);
      }
    });
    return () => {
      active = false;
    };
  }, [map, collapsed, fitView]);

  const displayNodes = useMemo(
    () =>
      nodes.map((node) =>
        node.type === 'file' ? { ...node, selected: node.id === selectedId } : node
      ),
    [nodes, selectedId]
  );
  const displayEdges = useMemo(
    () =>
      edges.map((edge) => {
        const hot = !!selectedId && (edge.source === selectedId || edge.target === selectedId);
        return {
          ...edge,
          animated: hot,
          style: { stroke: hot ? EDGE_HOT : EDGE_IDLE, strokeWidth: hot ? 1.8 : 1.1 }
        };
      }),
    [edges, selectedId]
  );

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (node.type === 'folder') {
        onToggleFolder(node.id);
      } else if (node.type === 'file') {
        onSelect(node.id);
      }
    },
    [onSelect, onToggleFolder]
  );

  return (
    <ReactFlow
      className="cbmap-flow"
      nodes={displayNodes}
      edges={displayEdges}
      nodeTypes={nodeTypes}
      onNodeClick={onNodeClick}
      minZoom={0.08}
      proOptions={{ hideAttribution: true }}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
    >
      <Background gap={24} size={1} color="var(--color-border, #262b36)" />
      <Controls showInteractive={false} className="!shadow-none" />
    </ReactFlow>
  );
}

export function TreeGraph(props: {
  map: CodebaseMapData;
  selectedId: string | null;
  collapsed: Set<string>;
  onSelect: (id: string) => void;
  onToggleFolder: (id: string) => void;
}) {
  return (
    <ReactFlowProvider>
      <TreeFlow {...props} />
    </ReactFlowProvider>
  );
}
