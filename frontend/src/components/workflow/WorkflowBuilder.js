'use client';

import React, { useState, useCallback } from 'react';
import ToolbarPanel from './ToolbarPanel';
import CanvasArea from './CanvasArea';
import InspectorPanel from './InspectorPanel';
import RunHistoryPanel from './RunHistoryPanel';

export default function WorkflowBuilder({ initialNodes = [], initialEdges = [] }) {
  const [nodes, setNodes] = useState(initialNodes);
  const [edges, setEdges] = useState(initialEdges);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);
  
  const selectedNode = nodes.find(n => n.id === selectedNodeId) || null;

  const handleAddNode = useCallback((type) => {
    const newNode = {
      id: `${type.toLowerCase()}-${Date.now()}`,
      type,
      position: { x: 250, y: 150 },
      data: { label: `New ${type} Node` }
    };
    setNodes((nds) => nds.concat(newNode));
  }, []);

  const handleUpdateNode = useCallback((id, newData) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === id) {
          return { ...node, data: newData };
        }
        return node;
      })
    );
  }, []);

  const handleNodeClick = useCallback((node) => {
    setSelectedNodeId(node.id);
    setIsInspectorOpen(true);
  }, []);

  const handleSave = () => {
    console.log('Saved Workflow DAG:', { nodes, edges });
    alert('Workflow saved successfully!');
  };

  const handlePublish = () => {
    console.log('Published Workflow DAG:', { nodes, edges });
    alert('Workflow published and is now active!');
  };

  const handleTest = () => {
    console.log('Simulating Test Run...');
    alert('Test run initiated! Check the console and run history.');
  };

  return (
    <div className="flex flex-col h-screen w-full bg-gray-100 overflow-hidden font-sans">
      <div className="flex flex-1 h-[calc(100vh-250px)]">
        <ToolbarPanel 
          onAddNode={handleAddNode} 
          onSave={handleSave}
          onPublish={handlePublish}
          onTest={handleTest}
        />
        
        <div className="flex-1 relative">
          <CanvasArea 
            nodes={nodes} 
            edges={edges} 
            setNodes={setNodes} 
            setEdges={setEdges}
            onNodeClick={handleNodeClick}
          />
          
          {/* Toggle Inspector Button */}
          {!isInspectorOpen && (
            <button 
              onClick={() => setIsInspectorOpen(true)}
              className="absolute top-4 right-4 z-10 bg-surface shadow-md border border-outline-variant p-2 rounded-lg text-on-surface hover:bg-surface-container"
            >
              <span className="material-symbols-outlined">last_page</span>
            </button>
          )}
        </div>
        
        {isInspectorOpen && (
          <InspectorPanel 
            selectedNode={selectedNode}
            onUpdateNode={handleUpdateNode}
            onClose={() => setIsInspectorOpen(false)}
          />
        )}
      </div>
      
      {/* Bottom Panel for Run History */}
      <RunHistoryPanel />
    </div>
  );
}
