'use client';

import React from 'react';

export default function InspectorPanel({ selectedNode, onUpdateNode }) {
  if (!selectedNode) {
    return (
      <div className="w-80 bg-white border-l border-gray-200 p-6 flex flex-col items-center justify-center text-center text-gray-400 h-full">
        <svg className="w-12 h-12 mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
        </svg>
        <p>Select a node to inspect and configure its properties.</p>
      </div>
    );
  }

  const handleChange = (field, value) => {
    onUpdateNode(selectedNode.id, {
      ...selectedNode.data,
      [field]: value
    });
  };

  return (
    <div className="w-80 bg-white border-l border-gray-200 h-full overflow-y-auto flex flex-col shadow-[-4px_0_15px_rgba(0,0,0,0.03)] z-10">
      <div className="p-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
        <h2 className="text-lg font-semibold text-gray-800">{selectedNode.type} Node</h2>
        <span className="text-xs font-mono bg-white px-2 py-1 rounded border border-gray-200 text-gray-500">ID: {selectedNode.id.substring(0,6)}</span>
      </div>
      
      <div className="p-5 space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Label</label>
          <input
            type="text"
            className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm shadow-sm transition-shadow"
            value={selectedNode.data.label || ''}
            onChange={(e) => handleChange('label', e.target.value)}
          />
        </div>

        {selectedNode.type === 'ACTION' && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">MCP Server</label>
              <select 
                className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-white shadow-sm"
                value={selectedNode.data.mcp || ''}
                onChange={(e) => handleChange('mcp', e.target.value)}
              >
                <option value="">Select Server</option>
                <option value="Stripe">Stripe</option>
                <option value="Gmail">Gmail</option>
                <option value="Airtable">Airtable</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tool Name</label>
              <input
                type="text"
                placeholder="e.g. create_charge"
                className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-indigo-500 focus:border-indigo-500 text-sm shadow-sm"
                value={selectedNode.data.toolName || ''}
                onChange={(e) => handleChange('toolName', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Output Variable</label>
              <input
                type="text"
                placeholder="e.g. stripeResponse"
                className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-indigo-500 focus:border-indigo-500 text-sm font-mono shadow-sm"
                value={selectedNode.data.outputVariable || ''}
                onChange={(e) => handleChange('outputVariable', e.target.value)}
              />
            </div>
          </>
        )}

        {selectedNode.type === 'CONDITION' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Expression</label>
            <textarea
              className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-indigo-500 focus:border-indigo-500 text-sm font-mono shadow-sm"
              rows="3"
              placeholder="{{trigger.amount}} > 5000"
              value={selectedNode.data.expression || ''}
              onChange={(e) => handleChange('expression', e.target.value)}
            />
          </div>
        )}

        <div className="pt-4 border-t border-gray-200 mt-6">
          <button className="w-full px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none transition-colors">
            Advanced Editor
          </button>
        </div>
      </div>
    </div>
  );
}
