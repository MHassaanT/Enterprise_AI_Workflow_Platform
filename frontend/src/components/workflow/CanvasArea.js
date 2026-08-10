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
      case 'TRIGGER': return 'border-blue-500 bg-blue-50';
      case 'AGENT': return 'border-green-500 bg-green-50';
      case 'ACTION': return 'border-orange-500 bg-orange-50';
      case 'APPROVAL': return 'border-red-500 bg-red-50';
      case 'CONDITION': return 'border-purple-500 bg-purple-50';
      case 'DELAY': return 'border-gray-500 bg-gray-50';
      case 'WEBHOOK_REPLY': return 'border-cyan-500 bg-cyan-50';
      case 'END': return 'border-black bg-gray-100';
      default: return 'border-gray-300 bg-white';
    }
  };

  return (
    <div className={`px-4 py-3 shadow-md rounded-lg border-2 min-w-[150px] transition-all hover:shadow-lg ${getColors()}`}>
      {type !== 'TRIGGER' && (
        <Handle type="target" position={Position.Top} className="w-3 h-3 border-2 bg-white" />
      )}
      
      <div className="flex flex-col">
        <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">{type}</div>
        <div className="text-sm font-semibold text-gray-800">{data.label}</div>
      </div>

      {type !== 'END' && (
        <Handle type="source" position={Position.Bottom} className="w-3 h-3 border-2 bg-white" />
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

  return (
    <div className="flex-1 h-full w-full bg-gray-50 relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={(_, node) => onNodeClick(node)}
        nodeTypes={nodeTypes}
        fitView
        className="w-full h-full"
      >
        <Background color="#ccc" gap={16} />
        <Controls className="bg-white shadow-md border-gray-200 rounded overflow-hidden" />
        <MiniMap 
          nodeColor={(node) => {
            switch (node.type) {
              case 'TRIGGER': return '#3b82f6';
              case 'AGENT': return '#22c55e';
              case 'ACTION': return '#f97316';
              case 'APPROVAL': return '#ef4444';
              case 'CONDITION': return '#a855f7';
              case 'END': return '#000000';
              default: return '#eee';
            }
          }}
          maskColor="rgba(240, 240, 240, 0.7)"
          className="bg-white shadow-lg border border-gray-200 rounded-lg"
        />
      </ReactFlow>
    </div>
  );
}
