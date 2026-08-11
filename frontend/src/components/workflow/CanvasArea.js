'use client';

import React, { useCallback } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  MiniMap,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  Handle,
  Position
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

const CustomNode = ({ data, type }) => {
  const getColors = () => {
    switch (type) {
      case 'TRIGGER': return 'border-blue-500 bg-blue-900/20 text-blue-100';
      case 'AGENT': return 'border-green-500 bg-green-900/20 text-green-100';
      case 'ACTION': return 'border-orange-500 bg-orange-900/20 text-orange-100';
      case 'APPROVAL': return 'border-red-500 bg-red-900/20 text-red-100';
      case 'CONDITION': return 'border-purple-500 bg-purple-900/20 text-purple-100';
      case 'DELAY': return 'border-gray-500 bg-gray-800 text-gray-200';
      case 'WEBHOOK_REPLY': return 'border-cyan-500 bg-cyan-900/20 text-cyan-100';
      case 'END': return 'border-outline-variant bg-surface-container-highest text-on-surface';
      default: return 'border-outline bg-surface-container text-on-surface';
    }
  };

  return (
    <div className={`px-3 py-2 shadow-sm rounded border min-w-[120px] transition-all hover:shadow-md backdrop-blur-sm ${getColors()}`}>
      {type !== 'TRIGGER' && (
        <Handle type="target" position={Position.Top} className="w-2 h-2 border bg-surface-container" />
      )}
      
      <div className="flex flex-col">
        <div className="text-[10px] font-bold opacity-70 uppercase tracking-wider mb-0.5">{type}</div>
        <div className="text-xs font-bold leading-tight">{data.label}</div>
      </div>

      {type !== 'END' && (
        <Handle type="source" position={Position.Bottom} className="w-2 h-2 border bg-surface-container" />
      )}
    </div>
  );
};

const nodeTypes = {
  TRIGGER: CustomNode,
  AGENT: CustomNode,
  ACTION: CustomNode,
  APPROVAL: CustomNode,
  CONDITION: CustomNode,
  DELAY: CustomNode,
  WEBHOOK_REPLY: CustomNode,
  END: CustomNode
};

export default function CanvasArea({ nodes, edges, setNodes, setEdges, onNodeClick }) {
  const onNodesChange = useCallback(
    (changes) => setNodes((nds) => applyNodeChanges(changes, nds)),
    [setNodes]
  );
  
  const onEdgesChange = useCallback(
    (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [setEdges]
  );
  
  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge({ ...params, animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } }, eds)),
    [setEdges]
  );

  const onNodesDelete = useCallback(
    (deleted) => {
      setNodes((nds) => nds.filter((node) => !deleted.find((d) => d.id === node.id)));
    },
    [setNodes]
  );

  const onEdgesDelete = useCallback(
    (deleted) => {
      setEdges((eds) => eds.filter((edge) => !deleted.find((d) => d.id === edge.id)));
    },
    [setEdges]
  );

  return (
    <div className="flex-1 h-full w-full bg-background relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodesDelete={onNodesDelete}
        onEdgesDelete={onEdgesDelete}
        onConnect={onConnect}
        onNodeClick={(_, node) => onNodeClick(node)}
        nodeTypes={nodeTypes}
        fitView
        className="w-full h-full"
      >
        <Background color="#444" gap={16} />
        <Controls className="bg-surface-container shadow-md border border-outline-variant rounded overflow-hidden [&>button]:bg-surface-container [&>button]:border-outline-variant [&>button]:text-on-surface hover:[&>button]:bg-surface-container-high" />
      </ReactFlow>
    </div>
  );
}
