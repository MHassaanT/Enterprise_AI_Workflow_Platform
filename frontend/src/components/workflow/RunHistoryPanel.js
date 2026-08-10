'use client';

import React, { useState } from 'react';

export default function RunHistoryPanel() {
  const [isOpen, setIsOpen] = useState(false);

  // Mock data for runs
  const mockRuns = [
    { id: 'run-1', status: 'success', date: '2026-08-10 10:15:00', duration: '2.4s' },
    { id: 'run-2', status: 'failed', date: '2026-08-10 11:30:22', duration: '1.2s' },
    { id: 'run-3', status: 'awaiting_approval', date: '2026-08-10 12:45:10', duration: 'pending' },
  ];

  if (!isOpen) {
    return (
      <div className="absolute bottom-0 left-0 right-0 h-10 bg-white border-t border-gray-200 flex items-center justify-between px-4 z-20 shadow-[0_-2px_10px_rgba(0,0,0,0.02)]">
        <div className="flex items-center text-sm text-gray-600 font-medium">
          <span className="w-2 h-2 rounded-full bg-green-500 mr-2"></span>
          Execution Engine Status: Ready
        </div>
        <button 
          onClick={() => setIsOpen(true)}
          className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
        >
          Open Run History ^
        </button>
      </div>
    );
  }

  return (
    <div className="h-[250px] bg-white border-t border-gray-200 flex flex-col z-20 shadow-[0_-4px_15px_rgba(0,0,0,0.03)] w-full">
      <div className="flex justify-between items-center px-4 py-2 border-b border-gray-200 bg-gray-50">
        <h3 className="text-sm font-semibold text-gray-800">Run History & Test Console</h3>
        <button 
          onClick={() => setIsOpen(false)}
          className="text-gray-500 hover:text-gray-700"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 flex">
        {/* Run List */}
        <div className="w-1/3 border-r border-gray-200 pr-4 space-y-2">
          {mockRuns.map(run => (
            <div key={run.id} className="p-3 border border-gray-200 rounded hover:bg-gray-50 cursor-pointer flex justify-between items-center transition-colors shadow-sm">
              <div>
                <div className="text-xs text-gray-500">{run.date}</div>
                <div className="text-sm font-medium text-gray-800">{run.id}</div>
              </div>
              <div className="text-right">
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                  run.status === 'success' ? 'bg-green-100 text-green-700' :
                  run.status === 'failed' ? 'bg-red-100 text-red-700' :
                  'bg-yellow-100 text-yellow-700'
                }`}>
                  {run.status}
                </span>
                <div className="text-xs text-gray-400 mt-1">{run.duration}</div>
              </div>
            </div>
          ))}
        </div>
        
        {/* Step Trace */}
        <div className="flex-1 pl-4">
          <div className="h-full flex items-center justify-center text-gray-400 text-sm">
            Select a run to view execution step trace.
          </div>
        </div>
      </div>
    </div>
  );
}
