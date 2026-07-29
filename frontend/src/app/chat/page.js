"use client";

import React, { useEffect, useState } from 'react';
import { fetchMessages, sendMessage, patchApproval } from '../../lib/api';
import MessageBubble from '../components/MessageBubble';
import ApprovalCard from '../components/ApprovalCard';
import styles from './ChatPage.module.css';

export default function ChatPage({ params }) {
  const { conversationId } = params;
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await fetchMessages(conversationId);
        setMessages(data);
      } catch (e) {
        console.error('Failed to load messages', e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [conversationId]);

  const handleSend = async () => {
    if (!input.trim()) return;
    const newMsg = { role: 'user', content: input };
    setMessages((prev) => [...prev, newMsg]);
    setInput('');
    try {
      const res = await sendMessage(conversationId, input);
      // Assume response contains assistant message and optional approval object
      if (res.answer) {
        setMessages((prev) => [...prev, { role: 'assistant', content: res.answer, citations: res.citations }]);
      }
      if (res.approval_pending && res.approval_id) {
        setMessages((prev) => [...prev, { role: 'approval', approvalId: res.approval_id, reason: res.tool_used }]);
      }
    } catch (e) {
      console.error('Send error', e);
    }
  };

  const handleApprove = async (approvalId, decision) => {
    try {
      await patchApproval(approvalId, decision);
      // Remove the approval card from UI
      setMessages((prev) => prev.filter((m) => m.approvalId !== approvalId));
    } catch (e) {
      console.error('Approval error', e);
    }
  };

  if (loading) return <div className={styles.loading}>Loading chat...</div>;

  return (
    <div className={styles.chatContainer}>
      <div className={styles.messages}>
        {messages.map((msg, idx) => {
          if (msg.role === 'approval') {
            return (
              <ApprovalCard
                key={idx}
                approvalId={msg.approvalId}
                reason={msg.reason}
                onDecision={handleApprove}
              />
            );
          }
          return <MessageBubble key={idx} message={msg} />;
        })}
      </div>
      <div className={styles.inputBar}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={2}
          placeholder="Type your message..."
          className={styles.textarea}
        />
        <button onClick={handleSend} className={styles.sendButton}>Send</button>
      </div>
    </div>
  );
}
