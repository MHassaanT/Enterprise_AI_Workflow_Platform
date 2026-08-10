'use client';

import React from 'react';

export default function ToolbarPanel({ onAddNode, onSave, onPublish, onTest }) {
  const nodeTypes = [
    { type: 'TRIGGER', label: 'Trigger (Start)', color: 'bg-blue-500' },
    { type: 'AGENT', label: 'Agent', color: 'bg-green-500' },
    { type: 'ACTION', label: 'Action (MCP)', color: 'bg-orange-500' },
    { type: 'APPROVAL', label: 'Approval', color: 'bg-red-500' },
    { type: 'CONDITION', label: 'Condition', color: 'bg-purple-500' },
    { type: 'DELAY', label: 'Delay', color: 'bg-gray-500' },
    { type: 'WEBHOOK_REPLY', label: 'Webhook Reply', color: 'bg-cyan-500' },
    { type: 'END', label: 'End', color: 'bg-black' }
  ];

  return (
    <div className="w-64 bg-surface border-r border-outline-variant flex flex-col h-full overflow-y-auto z-10 shadow-sm">
      <div className="p-4 border-b border-outline-variant bg-surface-container-lowest">
        <h2 className="text-lg font-bold text-on-surface">Workflow Builder</h2>
        <div className="mt-4 flex gap-2 flex-wrap">
          <button onClick={onSave} className="flex-1 px-3 py-2 bg-surface-container hover:bg-surface-container-high border border-outline rounded text-sm text-on-surface font-bold transition-colors shadow-sm">Save</button>
          <button onClick={onPublish} className="flex-1 px-3 py-2 bg-primary text-on-primary rounded text-sm hover:bg-primary/90 transition-colors shadow-sm font-bold">Publish</button>
          <button onClick={onTest} className="w-full px-3 py-2 bg-primary-container/20 text-primary border border-primary/30 rounded text-sm hover:bg-primary-container/40 mt-2 font-bold transition-colors">Test Run</button>
        </div>
      </div>
      
      <div className="p-4 flex-1 bg-surface">
        <h3 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-3">Add Nodes</h3>
        <div className="space-y-2">
          {nodeTypes.map((nt) => (
            <button
              key={nt.type}
              onClick={() => onAddNode(nt.type)}
              className="w-full text-left px-3 py-2 bg-surface-container-lowest hover:bg-surface-container border border-outline-variant rounded shadow-sm flex items-center transition-colors"
            >
              <span className={`w-3 h-3 rounded-full mr-3 ${nt.color}`}></span>
              <span className="text-sm font-bold text-on-surface">{nt.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
