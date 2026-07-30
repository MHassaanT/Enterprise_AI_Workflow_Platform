'use client';
import { useState } from 'react';
import styles from './ApprovalCard.module.css';

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
    <div className={`${styles.card} ${resolvedStatus ? styles[resolvedStatus] : ''}`}>
      <div className={styles.header}>
        <span className={styles.badgeWarning}>⚠️ Human Approval Required</span>
        <span className={styles.appId}>ID: {approvalId ? String(approvalId).slice(0, 8) : 'Pending'}</span>
      </div>

      <div className={styles.body}>
        <h4 className={styles.title}>High-Risk Action Blocked</h4>
        <p className={styles.reason}>
          {reason || `Agent requested tool execution: "${actionType || 'escalate_to_human'}"`}
        </p>

        {actionPayload && (
          <div className={styles.payloadBox}>
            <pre>{JSON.stringify(actionPayload, null, 2)}</pre>
          </div>
        )}
      </div>

      <div className={styles.actions}>
        {resolvedStatus ? (
          <div className={`${styles.statusBanner} ${styles[`banner_${resolvedStatus}`]}`}>
            {resolvedStatus === 'approved' ? '✅ Action Approved' : '❌ Action Rejected'}
          </div>
        ) : (
          <>
            <button
              onClick={() => handleAction('rejected')}
              disabled={loading}
              className={`${styles.btn} ${styles.btnReject}`}
            >
              Reject Action
            </button>
            <button
              onClick={() => handleAction('approved')}
              disabled={loading}
              className={`${styles.btn} ${styles.btnApprove}`}
            >
              {loading ? 'Processing...' : 'Approve & Execute'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
