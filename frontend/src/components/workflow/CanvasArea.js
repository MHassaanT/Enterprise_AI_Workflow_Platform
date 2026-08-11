'use client';

import React, { useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  Handle,
  Position
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

const CustomNode = ({ data, type, id }) => {
  const getIcon = () => {
    switch (type) {
      case 'TRIGGER': return 'bolt';
      case 'TOOL': return 'build';
      case 'CONDITION': return 'call_split';
      case 'DELAY': return 'schedule';
      case 'END': return 'stop_circle';
      default: return 'widgets';
    }
  };

  const getColors = () => {
    switch (type) {
      case 'TRIGGER': return 'border-blue-500 bg-blue-900/20 text-blue-400';
      case 'TOOL': return 'border-orange-500 bg-orange-900/20 text-orange-400';
      case 'CONDITION': return 'border-purple-500 bg-purple-900/20 text-purple-400';
      case 'DELAY': return 'border-gray-500 bg-gray-800 text-gray-400';
      case 'END': return 'border-red-500 bg-red-900/20 text-red-400';
      default: return 'border-outline bg-surface-container text-on-surface';
    }
  };

  const isEndNode = type === 'END';
  
  return (
    <div className="relative flex flex-col items-center">
      {type !== 'TRIGGER' && (
        <Handle type="target" position={Position.Top} className="w-2 h-2 border bg-surface-container" />
      )}
      
      <div 
        className={`w-10 h-10 rounded-full border-2 flex items-center justify-center shadow-md transition-all hover:shadow-lg backdrop-blur-sm cursor-pointer ${getColors()}`}
        title={data.label || type}
      >
        <span className="material-symbols-outlined text-[20px]">{getIcon()}</span>
      </div>

      {!isEndNode && (
        <>
          <Handle type="source" position={Position.Bottom} className="w-2 h-2 border bg-surface-container" />
          
          <button 
            onClick={(e) => {
              e.stopPropagation();
              if (data.onAddNodeClick) {
                data.onAddNodeClick(id);
              }
            }}
            className="absolute -bottom-8 w-5 h-5 rounded-full bg-primary hover:bg-primary/90 text-on-primary flex items-center justify-center shadow shadow-black/50 z-10 transition-transform hover:scale-110"
            title="Add Node"
          >
            <span className="material-symbols-outlined text-[14px]">add</span>
          </button>
        </>
      )}
    </div>
  );
};


export default function CanvasArea({ nodes, edges, setNodes, setEdges, onNodeClick, onAddNodeClick }) {
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

  const nodeTypes = useMemo(() => ({
    TRIGGER: CustomNode,
    TOOL: CustomNode,
    CONDITION: CustomNode,
    DELAY: CustomNode,
    END: CustomNode
  }), []);

  // Inject onAddNodeClick into node data
  const processedNodes = useMemo(() => {
    return nodes.map(node => ({
      ...node,
      data: {
        ...node.data,
        onAddNodeClick
      }
    }));
  }, [nodes, onAddNodeClick]);

  return (
    <div className="flex-1 h-full w-full bg-background relative">
      <ReactFlow
        nodes={processedNodes}
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

