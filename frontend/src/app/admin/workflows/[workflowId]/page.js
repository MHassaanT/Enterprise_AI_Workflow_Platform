import React from 'react';
import WorkflowBuilder from '@/components/workflow/WorkflowBuilder';

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
    <div className="h-screen flex flex-col">
      <div className="h-14 bg-gray-800 text-white flex items-center px-6 shadow-md z-20">
        <h1 className="text-lg font-bold tracking-wide">Workflow Editor <span className="font-normal text-gray-400 text-sm ml-2">/ {params.workflowId}</span></h1>
      </div>
      <div className="flex-1 relative">
        <WorkflowBuilder initialNodes={initialNodes} initialEdges={[]} />
      </div>
    </div>
  );
}
