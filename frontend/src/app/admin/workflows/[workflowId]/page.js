'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import WorkflowBuilder from '@/components/workflow/WorkflowBuilder';
import AuthGuard from '../../../components/AuthGuard';
import { fetchWorkflow } from '@/lib/api';

export default function WorkflowEditorPage() {
  const params = useParams();
  const [workflow, setWorkflow] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const workflowId = params?.workflowId;
    setLoading(true);
    
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
      setWorkflow(null);
      setLoading(false);
    }
  }, [params?.workflowId]);

  if (loading) {
    return <div className="p-8 text-on-surface bg-background h-screen">Loading workflow...</div>;
  }

  let definition = workflow?.definition;
  if (typeof definition === 'string') {
    try {
      definition = JSON.parse(definition);
    } catch (e) {
      console.error('Failed to parse workflow definition:', e);
      definition = null;
    }
  }

  const initialNodes = definition?.nodes?.length > 0 ? definition.nodes : [
    {
      id: 'trigger-1',
      type: 'TRIGGER',
      position: { x: 250, y: 50 },
      data: { label: 'Manual Trigger', triggerType: 'manual' }
    }
  ];
  
  const initialEdges = definition?.edges || [];

  return (
    <AuthGuard>
      <div className="h-screen flex flex-col bg-background text-on-surface font-body-md antialiased overflow-hidden">
        <div className="flex-1 relative bg-surface-container-lowest">
          <WorkflowBuilder 
            key={params?.workflowId}
            workflowId={params?.workflowId} 
            initialNodes={initialNodes} 
            initialEdges={initialEdges} 
          />
        </div>
      </div>
    </AuthGuard>
  );
}
