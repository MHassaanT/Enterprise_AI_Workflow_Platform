'use client';

import React, { useState, useCallback, useEffect } from 'react';
import CanvasArea from './CanvasArea';
import RunHistoryPanel from './RunHistoryPanel';
import { fetchToolRegistry, updateWorkflow, publishWorkflow, runWorkflow, createWorkflow } from '@/lib/api';
import { ReactFlowProvider } from '@xyflow/react';
import { useRouter } from 'next/navigation';

export default function WorkflowBuilder({ workflowId, initialNodes = [], initialEdges = [] }) {
  const router = useRouter();
  const [nodes, setNodes] = useState(initialNodes);
  const [edges, setEdges] = useState(initialEdges);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [nodeSelectorTarget, setNodeSelectorTarget] = useState(null);
  
  const [connectedTools, setConnectedTools] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  
  useEffect(() => {
    fetchToolRegistry()
      .then(registry => {
        // Filter tools that are connected (have credentials) or don't require them (like built-ins)
        const availableTools = (registry || []).filter(t => t.credential_id || t.provider_type === 'builtin' || t.provider_type === 'mcp_stdio');
        setConnectedTools(availableTools);
      })
      .catch(err => console.error('Failed to load connected tools:', err));
  }, []);

  const selectedNode = nodes.find(n => n.id === selectedNodeId) || null;

  const handleUpdateNode = useCallback((id, newData) => {
    setNodes((nds) =>
      nds.map((node) => (node.id === id ? { ...node, data: newData } : node))
    );
  }, []);

  const handleNodeClick = useCallback((node) => {
    setNodeSelectorTarget(null);
    setSelectedNodeId(node.id);
  }, []);

  const handleDeleteNode = useCallback((id) => {
    setNodes((nds) => nds.filter(n => n.id !== id));
    setEdges((eds) => eds.filter(e => e.source !== id && e.target !== id));
    if (selectedNodeId === id) setSelectedNodeId(null);
  }, [selectedNodeId]);

  const validateDAG = () => {
    if (!nodes.some(n => n.type === 'TRIGGER')) return 'Workflow must have a starting point (Trigger).';
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
      const name = prompt("Enter a name for the new workflow:", "New Workflow");
      if (!name) return;

      setIsSaving(true);
      try {
        const newWorkflow = await createWorkflow(name, 'Created from builder', { nodes, edges });
        alert('Workflow created successfully!');
        router.push(`/admin/workflows/${newWorkflow.id}`);
      } catch (err) {
        console.error(err);
        alert(err.message || 'Failed to create workflow.');
      } finally {
        setIsSaving(false);
      }
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
        // Save the latest canvas state first to ensure the DB has the current definition
        await updateWorkflow(workflowId, undefined, undefined, { nodes, edges });
        await publishWorkflow(workflowId);
        alert('Workflow saved and published — it is now active!');
      } catch (err) {
        console.error(err);
        alert('Failed to publish workflow.');
      } finally {
        setIsPublishing(false);
      }
    } else {
      alert('Cannot publish an unsaved workflow. Please save it first.');
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

  const handleAddNodeClick = useCallback((sourceId) => {
    setSelectedNodeId(null);
    setNodeSelectorTarget({ sourceId });
  }, []);

  const handleRootAddClick = () => {
    setSelectedNodeId(null);
    setNodeSelectorTarget('root');
  };

  const closePanels = () => {
    setNodeSelectorTarget(null);
    setSelectedNodeId(null);
  };

  const handleSelectNodeType = (type, toolData = null) => {
    const isFirstNode = nodes.length === 0;
    const finalType = isFirstNode ? 'TRIGGER' : type;

    const newNodeId = `${finalType.toLowerCase()}-${Date.now()}`;
    const newNode = {
      id: newNodeId,
      type: finalType,
      position: { x: window.innerWidth / 2 - 50, y: isFirstNode ? window.innerHeight / 2 - 100 : 0 },
      data: { 
        label: toolData ? (toolData.display_name || toolData.canonical_name) : finalType,
        mcp: toolData ? toolData.canonical_name : undefined,
        isInitialTrigger: isFirstNode
      }
    };

    setNodes((nds) => {
      if (nodeSelectorTarget && nodeSelectorTarget.sourceId) {
        const sourceNode = nds.find(n => n.id === nodeSelectorTarget.sourceId);
        if (sourceNode) {
          newNode.position = {
            x: sourceNode.position.x,
            y: sourceNode.position.y + 120
          };
        }
      }
      return nds.concat(newNode);
    });

    if (nodeSelectorTarget && nodeSelectorTarget.sourceId) {
      setEdges((eds) => eds.concat({
        id: `e-${nodeSelectorTarget.sourceId}-${newNodeId}`,
        source: nodeSelectorTarget.sourceId,
        target: newNodeId,
        animated: true,
        style: { stroke: '#6366f1', strokeWidth: 2 }
      }));
    }

    setNodeSelectorTarget(null);
    setSelectedNodeId(newNodeId);
  };

  return (
    <ReactFlowProvider>
      <div className="flex flex-col h-screen w-full bg-background overflow-hidden font-sans">
        
        {/* Top Header */}
        <div className="h-16 flex items-center justify-between px-6 border-b border-outline-variant bg-surface z-10">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-on-surface">Workflow Builder</h1>
            {workflowId && !workflowId.startsWith('new-') && (
              <span className="px-2 py-1 bg-surface-container text-xs font-mono rounded border border-outline-variant text-on-surface-variant">
                {workflowId.substring(0,8)}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={isSaving} className="px-4 py-2 bg-surface-container hover:bg-surface-container-high border border-outline rounded text-sm text-on-surface font-bold transition-colors shadow-sm disabled:opacity-50">
              {isSaving ? 'Saving...' : 'Save'}
            </button>
            <button onClick={handleTest} disabled={isTesting} className="px-4 py-2 bg-primary-container/20 text-primary border border-primary/30 rounded text-sm hover:bg-primary-container/40 font-bold transition-colors disabled:opacity-50">
              {isTesting ? 'Running...' : 'Test Run'}
            </button>
            <button onClick={handlePublish} disabled={isPublishing} className="px-4 py-2 bg-primary text-on-primary rounded text-sm hover:bg-primary/90 transition-colors shadow-sm font-bold disabled:opacity-50">
              {isPublishing ? 'Publishing...' : 'Publish'}
            </button>
          </div>
        </div>

        <div className="flex-1 relative">
          {nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
              <button 
                onClick={handleRootAddClick}
                className="w-16 h-16 rounded-full bg-primary text-on-primary shadow-lg flex items-center justify-center hover:scale-105 transition-transform pointer-events-auto"
                title="Start Workflow"
              >
                <span className="material-symbols-outlined text-3xl">add</span>
              </button>
            </div>
          )}

          <CanvasArea 
            nodes={nodes} 
            edges={edges} 
            setNodes={setNodes} 
            setEdges={setEdges}
            onNodeClick={handleNodeClick}
            onAddNodeClick={handleAddNodeClick}
          />
          
          {/* Node Selector Overlay */}
          {nodeSelectorTarget && (
            <div className="absolute inset-0 bg-black/20 backdrop-blur-sm z-40 flex items-center justify-center" onClick={closePanels}>
              <div className="w-80 bg-surface rounded-xl shadow-2xl border border-outline overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="p-4 border-b border-outline bg-surface-container flex justify-between items-center">
                  <h3 className="font-bold text-on-surface">Add to Workflow</h3>
                  <button onClick={closePanels} className="text-on-surface-variant hover:text-on-surface">
                    <span className="material-symbols-outlined">close</span>
                  </button>
                </div>
                <div className="p-2 max-h-[60vh] overflow-y-auto">
                  <div className="text-xs font-bold text-on-surface-variant uppercase mb-2 px-2 mt-2">Tools / Apps</div>
                  {connectedTools.length === 0 && (
                    <div className="px-2 py-3 text-sm text-on-surface-variant">No tools connected. Connect tools in the integrations tab.</div>
                  )}
                  {connectedTools.map(tool => (
                    <button key={tool.id} onClick={() => handleSelectNodeType('TOOL', tool)} className="w-full text-left px-3 py-2 hover:bg-surface-container rounded-lg flex items-center gap-3 transition-colors">
                      <div className="w-8 h-8 rounded bg-orange-900/20 text-orange-400 flex items-center justify-center border border-orange-500/30">
                        <span className="material-symbols-outlined text-[18px]">build</span>
                      </div>
                      <span className="text-sm font-bold text-on-surface">{tool.display_name || tool.canonical_name || tool.tool_name || 'Unknown Tool'}</span>
                    </button>
                  ))}
                  
                  <div className="text-xs font-bold text-on-surface-variant uppercase mb-2 px-2 mt-4">Logic</div>
                  <button onClick={() => handleSelectNodeType('CONDITION')} className="w-full text-left px-3 py-2 hover:bg-surface-container rounded-lg flex items-center gap-3 transition-colors">
                    <div className="w-8 h-8 rounded bg-purple-900/20 text-purple-400 flex items-center justify-center border border-purple-500/30">
                      <span className="material-symbols-outlined text-[18px]">call_split</span>
                    </div>
                    <span className="text-sm font-bold text-on-surface">Condition</span>
                  </button>
                  <button onClick={() => handleSelectNodeType('DELAY')} className="w-full text-left px-3 py-2 hover:bg-surface-container rounded-lg flex items-center gap-3 transition-colors">
                    <div className="w-8 h-8 rounded bg-gray-800 text-gray-400 flex items-center justify-center border border-gray-600">
                      <span className="material-symbols-outlined text-[18px]">schedule</span>
                    </div>
                    <span className="text-sm font-bold text-on-surface">Delay</span>
                  </button>
                  <button onClick={() => handleSelectNodeType('END')} className="w-full text-left px-3 py-2 hover:bg-surface-container rounded-lg flex items-center gap-3 transition-colors">
                    <div className="w-8 h-8 rounded bg-red-900/20 text-red-400 flex items-center justify-center border border-red-500/30">
                      <span className="material-symbols-outlined text-[18px]">stop_circle</span>
                    </div>
                    <span className="text-sm font-bold text-on-surface">End</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Inline Node Configuration Panel */}
          {selectedNode && (
            <div className="absolute top-4 right-4 w-80 bg-surface rounded-xl shadow-2xl border border-outline z-30 max-h-[calc(100%-2rem)] flex flex-col">
              <div className="p-4 border-b border-outline bg-surface-container flex justify-between items-center rounded-t-xl">
                <div>
                  <h3 className="font-bold text-on-surface flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px]">settings</span>
                    {selectedNode.data.label || selectedNode.type}
                  </h3>
                </div>
                <button onClick={closePanels} className="text-on-surface-variant hover:text-on-surface p-1 rounded-full hover:bg-surface">
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
              </div>
              
              <div className="p-4 overflow-y-auto flex-1 space-y-4">
                {selectedNode.type === 'TRIGGER' && (
                  <>
                    <div>
                      <label className="block text-sm font-bold text-on-surface-variant mb-1">Trigger Type</label>
                      <select 
                        className="w-full px-3 py-2 border border-outline rounded bg-surface-container text-sm shadow-sm"
                        value={selectedNode.data.triggerMode || 'event'}
                        onChange={(e) => handleUpdateNode(selectedNode.id, { ...selectedNode.data, triggerMode: e.target.value })}
                      >
                        <option value="event">Trigger Event</option>
                        <option value="schedule">Schedule (Cron)</option>
                        <option value="interval">Interval (Repeat)</option>
                        <option value="app_event">App Integration Polling</option>
                      </select>
                    </div>
                    
                    {(!selectedNode.data.triggerMode || selectedNode.data.triggerMode === 'event') && (
                      <div>
                        <label className="block text-sm font-bold text-on-surface-variant mb-1">Trigger Event Description</label>
                        <textarea
                          className="w-full px-3 py-2 border border-outline rounded bg-surface-container text-sm shadow-sm min-h-[80px]"
                          placeholder="e.g. When a new record is added in the specified spreadsheet"
                          value={selectedNode.data.triggerDescription || ''}
                          onChange={(e) => handleUpdateNode(selectedNode.id, { ...selectedNode.data, triggerDescription: e.target.value })}
                        />
                      </div>
                    )}

                    {selectedNode.data.triggerMode === 'schedule' && (
                      <div>
                        <label className="block text-sm font-bold text-on-surface-variant mb-1">Cron Expression</label>
                        <input
                          type="text"
                          className="w-full px-3 py-2 border border-outline rounded bg-surface-container text-sm shadow-sm font-mono"
                          placeholder="0 0 * * *"
                          value={selectedNode.data.cronExpression || ''}
                          onChange={(e) => handleUpdateNode(selectedNode.id, { ...selectedNode.data, cronExpression: e.target.value })}
                        />
                      </div>
                    )}

                    {selectedNode.data.triggerMode === 'interval' && (
                      <div>
                        <label className="block text-sm font-bold text-on-surface-variant mb-1">Interval (minutes)</label>
                        <input
                          type="number"
                          className="w-full px-3 py-2 border border-outline rounded bg-surface-container text-sm shadow-sm"
                          placeholder="60"
                          value={selectedNode.data.intervalMinutes || ''}
                          onChange={(e) => handleUpdateNode(selectedNode.id, { ...selectedNode.data, intervalMinutes: parseInt(e.target.value) || 0 })}
                        />
                      </div>
                    )}

                    {selectedNode.data.triggerMode === 'app_event' && (
                      <div className="space-y-3 mt-3">
                        <div>
                          <label className="block text-sm font-bold text-on-surface-variant mb-1">Select App</label>
                          <select 
                            className="w-full px-3 py-2 border border-outline rounded bg-surface-container text-sm shadow-sm"
                            value={selectedNode.data.appIntegration || ''}
                            onChange={(e) => handleUpdateNode(selectedNode.id, { ...selectedNode.data, appIntegration: e.target.value })}
                          >
                            <option value="">-- Select App --</option>
                            <option value="airtable">Airtable</option>
                            <option value="gmail">Gmail</option>
                            <option value="sheets">Google Sheets</option>
                          </select>
                        </div>

                        {selectedNode.data.appIntegration === 'airtable' && (
                          <div className="space-y-2">
                            <input type="text" placeholder="Base ID" className="w-full px-3 py-2 border border-outline rounded bg-surface-container text-sm shadow-sm"
                              value={selectedNode.data.baseId || ''} onChange={e => handleUpdateNode(selectedNode.id, { ...selectedNode.data, baseId: e.target.value })} />
                            <input type="text" placeholder="Table Name (e.g. Orders)" className="w-full px-3 py-2 border border-outline rounded bg-surface-container text-sm shadow-sm"
                              value={selectedNode.data.tableName || ''} onChange={e => handleUpdateNode(selectedNode.id, { ...selectedNode.data, tableName: e.target.value })} />
                            <input type="text" placeholder="Condition (e.g. Delivered)" className="w-full px-3 py-2 border border-outline rounded bg-surface-container text-sm shadow-sm"
                              value={selectedNode.data.query || ''} onChange={e => handleUpdateNode(selectedNode.id, { ...selectedNode.data, query: e.target.value })} />
                          </div>
                        )}

                        {selectedNode.data.appIntegration === 'gmail' && (
                          <div className="space-y-2">
                            <input type="text" placeholder="Search Query (e.g. is:unread)" className="w-full px-3 py-2 border border-outline rounded bg-surface-container text-sm shadow-sm"
                              value={selectedNode.data.query || ''} onChange={e => handleUpdateNode(selectedNode.id, { ...selectedNode.data, query: e.target.value })} />
                          </div>
                        )}

                        {selectedNode.data.appIntegration === 'sheets' && (
                          <div className="space-y-2">
                            <input type="text" placeholder="Spreadsheet ID" className="w-full px-3 py-2 border border-outline rounded bg-surface-container text-sm shadow-sm"
                              value={selectedNode.data.spreadsheetId || ''} onChange={e => handleUpdateNode(selectedNode.id, { ...selectedNode.data, spreadsheetId: e.target.value })} />
                            <input type="text" placeholder="Range (e.g. Sheet1!A:Z)" className="w-full px-3 py-2 border border-outline rounded bg-surface-container text-sm shadow-sm"
                              value={selectedNode.data.range || ''} onChange={e => handleUpdateNode(selectedNode.id, { ...selectedNode.data, range: e.target.value })} />
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}

                {selectedNode.type === 'TOOL' && (
                  <>
                    <div>
                      <label className="block text-sm font-bold text-on-surface-variant mb-1">Action Description</label>
                      <textarea
                        className="w-full px-3 py-2 border border-outline rounded bg-surface-container text-sm shadow-sm min-h-[80px]"
                        placeholder="e.g. Send an email with the record data from the previous step"
                        value={selectedNode.data.actionDescription || ''}
                        onChange={(e) => handleUpdateNode(selectedNode.id, { ...selectedNode.data, actionDescription: e.target.value })}
                      />
                    </div>
                  </>
                )}

                {selectedNode.type === 'CONDITION' && (
                  <div>
                    <label className="block text-sm font-bold text-on-surface-variant mb-1">Condition Expression</label>
                    <textarea
                      className="w-full px-3 py-2 border border-outline rounded bg-surface-container text-sm shadow-sm font-mono min-h-[80px]"
                      placeholder="e.g. {{trigger.amount}} > 50"
                      value={selectedNode.data.expression || ''}
                      onChange={(e) => handleUpdateNode(selectedNode.id, { ...selectedNode.data, expression: e.target.value })}
                    />
                  </div>
                )}

                {selectedNode.type === 'DELAY' && (
                  <div>
                    <label className="block text-sm font-bold text-on-surface-variant mb-1">Delay Duration (ms)</label>
                    <input
                      type="number"
                      className="w-full px-3 py-2 border border-outline rounded bg-surface-container text-sm shadow-sm"
                      placeholder="5000"
                      value={selectedNode.data.delayMs || ''}
                      onChange={(e) => handleUpdateNode(selectedNode.id, { ...selectedNode.data, delayMs: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                )}
                
                <div className="pt-4 mt-2 border-t border-outline-variant">
                  <button 
                    onClick={() => handleDeleteNode(selectedNode.id)}
                    className="w-full px-3 py-2 border border-error text-error text-sm font-bold rounded hover:bg-error/10 transition-colors"
                  >
                    Delete Node
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
        
        {/* Bottom Panel for Run History */}
        <RunHistoryPanel workflowId={workflowId} />
      </div>
    </ReactFlowProvider>
  );
}
