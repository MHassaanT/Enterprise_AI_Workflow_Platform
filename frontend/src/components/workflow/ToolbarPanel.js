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
    <div className="w-64 bg-white border-r border-gray-200 flex flex-col h-full overflow-y-auto z-10">
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-800">Workflow Builder</h2>
        <div className="mt-4 flex gap-2 flex-wrap">
          <button onClick={onSave} className="flex-1 px-3 py-2 bg-white border border-gray-300 rounded text-sm hover:bg-gray-50 shadow-sm text-gray-700 font-medium">Save</button>
          <button onClick={onPublish} className="flex-1 px-3 py-2 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 shadow-sm font-medium">Publish</button>
          <button onClick={onTest} className="w-full px-3 py-2 bg-green-50 text-green-700 border border-green-200 rounded text-sm hover:bg-green-100 mt-2 font-medium">Test Run</button>
        </div>
      </div>
      
      <div className="p-4 flex-1">
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">Add Nodes</h3>
        <div className="space-y-2">
          {nodeTypes.map((nt) => (
            <button
              key={nt.type}
              onClick={() => onAddNode(nt.type)}
              className="w-full text-left px-3 py-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded shadow-sm flex items-center transition-colors"
            >
              <span className={`w-3 h-3 rounded-full mr-3 ${nt.color}`}></span>
              <span className="text-sm text-gray-700 font-medium">{nt.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
