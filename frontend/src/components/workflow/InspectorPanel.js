'use client';

import React from 'react';

export default function InspectorPanel({ selectedNode, onUpdateNode, onClose, connectedTools = [] }) {
  if (!selectedNode) {
    return (
      <div className="w-80 bg-surface border-l border-outline-variant p-6 flex flex-col items-center justify-center text-center text-on-surface-variant h-full relative">
        {onClose && (
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 text-on-surface-variant hover:text-on-surface"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        )}
        <svg className="w-12 h-12 mb-4 text-outline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
    <div className="w-80 bg-surface border-l border-outline-variant h-full overflow-y-auto flex flex-col shadow-[-4px_0_15px_rgba(0,0,0,0.03)] z-10">
      <div className="p-4 border-b border-outline-variant bg-surface-container-lowest flex justify-between items-center">
        <div>
          <h2 className="text-lg font-bold text-on-surface">{selectedNode.type} Node</h2>
          <span className="text-xs font-mono bg-surface-container px-2 py-1 rounded border border-outline text-on-surface-variant mt-1 inline-block">ID: {selectedNode.id.substring(0,6)}</span>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface p-1 rounded hover:bg-surface-container">
            <span className="material-symbols-outlined">close</span>
          </button>
        )}
      </div>
      
      <div className="p-5 space-y-5">
        <div>
          <label className="block text-sm font-bold text-on-surface-variant mb-1">Label</label>
          <input
            type="text"
            className="w-full px-3 py-2 border border-outline rounded focus:ring-2 focus:ring-primary focus:border-primary text-sm shadow-sm bg-surface-container text-on-surface transition-shadow"
            value={selectedNode.data.label || ''}
            onChange={(e) => handleChange('label', e.target.value)}
          />
        </div>

        {selectedNode.type === 'TRIGGER' && (
          <>
            <div>
              <label className="block text-sm font-bold text-on-surface-variant mb-1">Trigger Type</label>
              <select 
                className="w-full px-3 py-2 border border-outline rounded focus:ring-primary focus:border-primary text-sm bg-surface-container text-on-surface shadow-sm"
                value={selectedNode.data.triggerType || 'manual'}
                onChange={(e) => handleChange('triggerType', e.target.value)}
              >
                <option value="manual">Manual Trigger (API/Button)</option>
                <option value="webhook">Webhook (Catch HTTP Request)</option>
                <option value="schedule">Schedule (Cron Timer)</option>
                <option value="event">App Event (Slack, GitHub, etc.)</option>
              </select>
            </div>
            
            {selectedNode.data.triggerType === 'webhook' && (
              <div>
                <label className="block text-sm font-bold text-on-surface-variant mb-1">Webhook URL Path</label>
                <input
                  type="text"
                  placeholder="e.g. /my-custom-webhook"
                  className="w-full px-3 py-2 border border-outline rounded focus:ring-primary focus:border-primary text-sm shadow-sm bg-surface-container text-on-surface"
                  value={selectedNode.data.webhookPath || ''}
                  onChange={(e) => handleChange('webhookPath', e.target.value)}
                />
              </div>
            )}
            
            {selectedNode.data.triggerType === 'schedule' && (
              <div>
                <label className="block text-sm font-bold text-on-surface-variant mb-1">Cron Expression</label>
                <input
                  type="text"
                  placeholder="* * * * *"
                  className="w-full px-3 py-2 border border-outline rounded focus:ring-primary focus:border-primary text-sm shadow-sm bg-surface-container text-on-surface font-mono"
                  value={selectedNode.data.cron || ''}
                  onChange={(e) => handleChange('cron', e.target.value)}
                />
              </div>
            )}
            
            {selectedNode.data.triggerType === 'event' && (
              <div>
                <label className="block text-sm font-bold text-on-surface-variant mb-1">Event Source</label>
                <select 
                  className="w-full px-3 py-2 border border-outline rounded focus:ring-primary focus:border-primary text-sm bg-surface-container text-on-surface shadow-sm"
                  value={selectedNode.data.eventSource || ''}
                  onChange={(e) => handleChange('eventSource', e.target.value)}
                >
                  <option value="">Select App Integration</option>
                  {connectedTools.map((tool) => (
                    <option key={tool.id} value={tool.canonical_name}>
                      {tool.custom_name || tool.canonical_name}
                    </option>
                  ))}
                  {connectedTools.length === 0 && <option disabled>No connected tools</option>}
                </select>
              </div>
            )}
          </>
        )}

        {selectedNode.type === 'ACTION' && (
          <>
            <div>
              <label className="block text-sm font-bold text-on-surface-variant mb-1">MCP Server Integration</label>
              <select 
                className="w-full px-3 py-2 border border-outline rounded focus:ring-primary focus:border-primary text-sm bg-surface-container text-on-surface shadow-sm"
                value={selectedNode.data.mcp || ''}
                onChange={(e) => handleChange('mcp', e.target.value)}
              >
                <option value="">Select Server</option>
                {connectedTools.map((tool) => (
                  <option key={tool.id} value={tool.canonical_name}>
                    {tool.custom_name || tool.canonical_name}
                  </option>
                ))}
                {connectedTools.length === 0 && <option disabled>No connected tools</option>}
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-on-surface-variant mb-1">Tool Name</label>
              <input
                type="text"
                placeholder="e.g. create_charge"
                className="w-full px-3 py-2 border border-outline rounded focus:ring-primary focus:border-primary text-sm shadow-sm bg-surface-container text-on-surface"
                value={selectedNode.data.toolName || ''}
                onChange={(e) => handleChange('toolName', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-on-surface-variant mb-1">Output Variable</label>
              <input
                type="text"
                placeholder="e.g. stripeResponse"
                className="w-full px-3 py-2 border border-outline rounded focus:ring-primary focus:border-primary text-sm font-mono shadow-sm bg-surface-container text-on-surface"
                value={selectedNode.data.outputVariable || ''}
                onChange={(e) => handleChange('outputVariable', e.target.value)}
              />
            </div>
          </>
        )}

        {selectedNode.type === 'CONDITION' && (
          <div>
            <label className="block text-sm font-bold text-on-surface-variant mb-1">Expression</label>
            <textarea
              className="w-full px-3 py-2 border border-outline rounded focus:ring-primary focus:border-primary text-sm font-mono shadow-sm bg-surface-container text-on-surface"
              rows="3"
              placeholder="{{trigger.amount}} > 5000"
              value={selectedNode.data.expression || ''}
              onChange={(e) => handleChange('expression', e.target.value)}
            />
          </div>
        )}

        <div className="pt-4 border-t border-outline-variant mt-6">
          <button className="w-full px-4 py-2 border border-outline shadow-sm text-sm font-bold rounded text-on-surface-variant bg-surface-container hover:bg-surface-container-high focus:outline-none transition-colors">
            Advanced Editor
          </button>
        </div>
      </div>
    </div>
  );
}
