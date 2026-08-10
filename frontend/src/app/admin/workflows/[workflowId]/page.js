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
        <div className="flex-1 relative bg-surface-container-lowest">
          <WorkflowBuilder initialNodes={initialNodes} initialEdges={[]} />
        </div>
      </div>
    </AuthGuard>
  );
}
