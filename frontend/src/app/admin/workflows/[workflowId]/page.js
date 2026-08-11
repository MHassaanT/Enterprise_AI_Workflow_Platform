'use client';

import React, { useState, useEffect } from 'react';
import WorkflowBuilder from '@/components/workflow/WorkflowBuilder';
import AuthGuard from '../../../components/AuthGuard';
import { fetchWorkflow } from '@/lib/api';

export default function WorkflowEditorPage({ params }) {
  const [workflow, setWorkflow] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { workflowId } = params;
    if (workflowId && !workflowId.startsWith('new-')) {
      fetchWorkflow(workflowId)
        .then(data => {
          setWorkflow(data);
          setLoading(false);
        })
        .catch(err => {
          console.error('Error fetching workflow:', err);
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, [params.workflowId]);

  if (loading) {
    return <div className="p-8 text-on-surface bg-background h-screen">Loading workflow...</div>;
  }

  const initialNodes = workflow?.definition?.nodes?.length > 0 ? workflow.definition.nodes : [
    {
      id: 'trigger-1',
      type: 'TRIGGER',
      position: { x: 250, y: 50 },
      data: { label: 'Manual Trigger', triggerType: 'manual' }
    }
  ];
  
  const initialEdges = workflow?.definition?.edges || [];

  return (
    <AuthGuard>
      <div className="h-screen flex flex-col bg-background text-on-surface font-body-md antialiased overflow-hidden">
        <div className="flex-1 relative bg-surface-container-lowest">
          <WorkflowBuilder 
            key={params.workflowId}
            workflowId={params.workflowId} 
            initialNodes={initialNodes} 
            initialEdges={initialEdges} 
          />
        </div>
      </div>
    </AuthGuard>
  );
}
