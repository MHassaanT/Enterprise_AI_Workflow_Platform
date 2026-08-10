import React from 'react';
import WorkflowBuilder from '@/components/workflow/WorkflowBuilder';
import AuthGuard from '../../../components/AuthGuard';

export default function WorkflowEditorPage({ params }) {
  // In a real implementation, we would fetch the workflow data using params.workflowId
  // and pass it as initialNodes / initialEdges to the builder.
  
  // For the initial view, we supply a basic trigger node
  const initialNodes = [
    {
      id: 'trigger-1',
      type: 'TRIGGER',
      position: { x: 250, y: 50 },
      data: { label: 'Manual Trigger' }
    }
  ];

  return (
    <AuthGuard>
      <div className="h-screen flex flex-col bg-background text-on-surface font-body-md antialiased overflow-hidden">
        <div className="h-14 bg-surface-container-highest border-b border-outline-variant flex items-center px-6 shadow-sm z-20">
          <h1 className="font-title-md text-title-md font-bold text-on-surface tracking-wide flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">account_tree</span>
            Workflow Editor 
            <span className="font-normal text-on-surface-variant text-sm ml-2">/ {params.workflowId}</span>
          </h1>
        </div>
        <div className="flex-1 relative bg-surface-container-lowest">
          <WorkflowBuilder initialNodes={initialNodes} initialEdges={[]} />
        </div>
      </div>
    </AuthGuard>
  );
}
