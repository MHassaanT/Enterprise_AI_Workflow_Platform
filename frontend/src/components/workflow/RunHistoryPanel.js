'use client';

import React, { useState } from 'react';

export default function RunHistoryPanel() {
  const [isOpen, setIsOpen] = useState(false);

  // Mock data for runs (removed hardcoded)
  const mockRuns = [];

  if (!isOpen) {
    return (
      <div className="absolute bottom-0 left-0 right-0 h-10 bg-surface border-t border-outline-variant flex items-center justify-between px-4 z-20 shadow-[0_-2px_10px_rgba(0,0,0,0.02)]">
        <div className="flex items-center text-sm text-on-surface-variant font-bold">
          <span className="w-2 h-2 rounded-full bg-green-500 mr-2 shadow-[0_0_8px_rgba(34,197,94,0.6)]"></span>
          Execution Engine Status: Ready
        </div>
        <button 
          onClick={() => setIsOpen(true)}
          className="text-sm text-primary hover:text-primary/80 font-bold transition-colors"
        >
          Open Run History ^
        </button>
      </div>
    );
  }

  return (
    <div className="h-[250px] bg-surface border-t border-outline-variant flex flex-col z-20 shadow-[0_-4px_15px_rgba(0,0,0,0.03)] w-full">
      <div className="flex justify-between items-center px-4 py-2 border-b border-outline-variant bg-surface-container-lowest">
        <h3 className="text-sm font-bold text-on-surface flex items-center gap-2">
          <span className="material-symbols-outlined text-sm text-primary">history</span>
          Run History & Test Console
        </h3>
        <button 
          onClick={() => setIsOpen(false)}
          className="text-on-surface-variant hover:text-on-surface transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 flex">
        {/* Run List */}
        <div className="w-1/3 border-r border-outline-variant pr-4 space-y-2">
          {mockRuns.map(run => (
            <div key={run.id} className="p-3 border border-outline rounded-lg hover:bg-surface-container cursor-pointer flex justify-between items-center transition-colors shadow-sm bg-surface-container-lowest">
              <div>
                <div className="text-xs text-on-surface-variant font-bold">{run.date}</div>
                <div className="text-sm font-bold text-on-surface">{run.id}</div>
              </div>
              <div className="text-right">
                <span className={`text-xs px-2 py-1 rounded-full font-bold ${
                  run.status === 'success' ? 'bg-primary-container/20 text-primary border border-primary/30' :
                  run.status === 'failed' ? 'bg-error-container/20 text-error border border-error/30' :
                  'bg-yellow-900/20 text-yellow-500 border border-yellow-500/30'
                }`}>
                  {run.status}
                </span>
                <div className="text-xs text-on-surface-variant mt-1 font-bold">{run.duration}</div>
              </div>
            </div>
          ))}
          {mockRuns.length === 0 && (
            <div className="h-full flex items-center justify-center text-on-surface-variant text-sm font-bold text-center">
              No runs yet. Click "Test Run" to trigger a simulation.
            </div>
          )}
        </div>
        
        {/* Step Trace */}
        <div className="flex-1 pl-4">
          <div className="h-full flex items-center justify-center text-on-surface-variant text-sm font-bold">
            Select a run to view execution step trace.
          </div>
        </div>
      </div>
    </div>
  );
}
