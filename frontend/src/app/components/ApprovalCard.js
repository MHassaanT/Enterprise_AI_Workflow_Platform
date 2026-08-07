'use client';
import { useState } from 'react';

export default function ApprovalCard({ approvalId, reason, actionType, actionPayload, onDecision }) {
  const [loading, setLoading] = useState(false);
  const [resolvedStatus, setResolvedStatus] = useState(null);

  const handleAction = async (decision) => {
    setLoading(true);
    try {
      if (onDecision) {
        await onDecision(approvalId, decision);
      }
      setResolvedStatus(decision);
    } catch (err) {
      console.error('Failed to submit decision:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`bg-surface-container-low border rounded-xl p-lg space-y-md shadow-sm transition-colors ${resolvedStatus === 'approved' ? 'border-emerald-800/40 bg-emerald-950/10' : resolvedStatus === 'rejected' ? 'border-error/30 bg-error-container/10' : 'border-tertiary/30'}`}>
      <div className="flex items-center justify-between">
        <span className="font-label-md text-label-md text-tertiary bg-tertiary-container/20 px-3 py-1 rounded-full border border-tertiary/30 font-semibold">
          ⚠️ Human Approval Required
        </span>
        <span className="font-mono-sm text-mono-sm text-on-surface-variant bg-surface-container px-2 py-0.5 rounded border border-outline-variant">
          ID: {approvalId ? String(approvalId).slice(0, 8) : 'Pending'}
        </span>
      </div>

      <div className="space-y-2">
        <h4 className="font-headline-md text-headline-md text-on-surface font-bold">High-Risk Action Blocked</h4>
        <p className="font-body-md text-body-md text-on-surface-variant">
          {reason || `Agent requested tool execution: "${actionType || 'escalate_to_human'}"`}
        </p>

        {actionPayload && (
          <div className="bg-surface border border-outline-variant rounded-lg p-md font-mono-sm text-mono-sm text-on-surface overflow-x-auto">
            <pre>{JSON.stringify(actionPayload, null, 2)}</pre>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-md pt-2">
        {resolvedStatus ? (
          <div className={`w-full text-center py-2 px-lg rounded-lg font-label-md text-label-md font-semibold border ${resolvedStatus === 'approved' ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800/50' : 'bg-error-container/20 text-error border-error/30'}`}>
            {resolvedStatus === 'approved' ? '✅ Action Approved' : '❌ Action Rejected'}
          </div>
        ) : (
          <>
            <button
              onClick={() => handleAction('rejected')}
              disabled={loading}
              className="px-lg py-2 bg-error-container/20 text-error border border-error/30 font-label-md text-label-md font-semibold rounded-lg hover:bg-error-container/40 transition-colors disabled:opacity-50"
            >
              Reject Action
            </button>
            <button
              onClick={() => handleAction('approved')}
              disabled={loading}
              className="px-lg py-2 bg-primary text-on-primary font-label-md text-label-md font-semibold rounded-lg hover:bg-primary-container transition-colors disabled:opacity-50 shadow-sm"
            >
              {loading ? 'Processing...' : 'Approve & Execute'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
