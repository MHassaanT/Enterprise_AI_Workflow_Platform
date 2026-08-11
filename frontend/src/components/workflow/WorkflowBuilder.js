'use client';

import React, { useState, useCallback } from 'react';
import ToolbarPanel from './ToolbarPanel';
import CanvasArea from './CanvasArea';
import InspectorPanel from './InspectorPanel';
import RunHistoryPanel from './RunHistoryPanel';
import { fetchGatewayBindings, updateWorkflow, publishWorkflow, runWorkflow } from '@/lib/api';
import { ReactFlowProvider } from '@xyflow/react';

export default function WorkflowBuilder({ workflowId, initialNodes = [], initialEdges = [] }) {
  const [nodes, setNodes] = useState(initialNodes);
  const [edges, setEdges] = useState(initialEdges);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);
  const [connectedTools, setConnectedTools] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  
  // Fetch connected tools for Action/Trigger node configuration
  React.useEffect(() => {
    fetchGatewayBindings()
      .then(bindings => {
        // bindings are the agent's or global tools connected by the tenant
        setConnectedTools(bindings || []);
      })
      .catch(err => console.error('Failed to load connected tools:', err));
  }, []);

  const selectedNode = nodes.find(n => n.id === selectedNodeId) || null;

  const handleAddNode = useCallback((type) => {
    setNodes((nds) => {
      const newNode = {
        id: `${type.toLowerCase()}-${Date.now()}`,
        type,
        position: { x: 250 + (nds.length * 30), y: 150 + (nds.length * 30) },
        data: { label: `New ${type} Node` }
      };
      return nds.concat(newNode);
    });
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

  const handleDeleteNode = useCallback((id) => {
    setNodes((nds) => nds.filter(n => n.id !== id));
    setEdges((eds) => eds.filter(e => e.source !== id && e.target !== id));
    if (selectedNodeId === id) setSelectedNodeId(null);
  }, [selectedNodeId]);

  const validateDAG = () => {
    if (!nodes.some(n => n.type === 'TRIGGER')) return 'Workflow must have at least one TRIGGER node.';
    if (!nodes.some(n => n.type === 'END')) return 'Workflow must have at least one END node.';
    return null;
  };

  const handleSave = async () => {
    const error = validateDAG();
    if (error) {
      alert(error);
      return;
    }

    if (workflowId && !workflowId.startsWith('new-')) {
      setIsSaving(true);
      try {
        await updateWorkflow(workflowId, undefined, undefined, { nodes, edges });
        alert('Workflow saved successfully!');
      } catch (err) {
        console.error(err);
        alert('Failed to save workflow.');
      } finally {
        setIsSaving(false);
      }
    } else {
      alert('Save logic for new workflows should be handled in creation. DAG saved locally.');
    }
  };

  const handlePublish = async () => {
    const error = validateDAG();
    if (error) {
      alert(error);
      return;
    }

    if (workflowId && !workflowId.startsWith('new-')) {
      setIsPublishing(true);
      try {
        await publishWorkflow(workflowId);
        alert('Workflow published and is now active!');
      } catch (err) {
        console.error(err);
        alert('Failed to publish workflow.');
      } finally {
        setIsPublishing(false);
      }
    } else {
      alert('Cannot publish an unsaved workflow.');
    }
  };

  const handleTest = async () => {
    if (workflowId && !workflowId.startsWith('new-')) {
      setIsTesting(true);
      try {
        await runWorkflow(workflowId);
        alert('Test run initiated! Check the run history.');
      } catch (err) {
        console.error(err);
        alert('Failed to trigger workflow run.');
      } finally {
        setIsTesting(false);
      }
    } else {
      alert('Cannot test an unsaved workflow.');
    }
  };

  return (
    <ReactFlowProvider>
      <div className="flex flex-col h-screen w-full bg-background overflow-hidden font-sans">
        <div className="flex flex-1 h-[calc(100vh-250px)]">
        <ToolbarPanel 
          onAddNode={handleAddNode} 
          onSave={handleSave}
          onPublish={handlePublish}
          onTest={handleTest}
          isSaving={isSaving}
          isPublishing={isPublishing}
          isTesting={isTesting}
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
            onDeleteNode={handleDeleteNode}
            onClose={() => setIsInspectorOpen(false)}
            connectedTools={connectedTools}
          />
        )}
      </div>
      
      {/* Bottom Panel for Run History */}
      <RunHistoryPanel workflowId={workflowId} />
      </div>
    </ReactFlowProvider>
  );
}
