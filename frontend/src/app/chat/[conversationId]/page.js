'use client';
import { useEffect, useState, useRef, use } from 'react';
import { fetchMessages, sendMessage, patchApproval } from '@/lib/api';
import MessageBubble from '../../components/MessageBubble';
import ApprovalCard from '../../components/ApprovalCard';
import LoadingSpinner from '../../components/LoadingSpinner';
import styles from './ChatWindow.module.css';

export default function ConversationPage({ params }) {
  const unwrappedParams = use(params);
  const conversationId = unwrappedParams.conversationId;

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const data = await fetchMessages(conversationId);
        setMessages(data);
      } catch (e) {
        console.error('Failed to load messages', e);
      } finally {
        setLoading(false);
      }
    }
    if (conversationId) {
      load();
    }
  }, [conversationId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, sending]);

  const handleSend = async (e) => {
    if (e) e.preventDefault();
    if (!input.trim() || sending) return;

    const userText = input;
    const userMsg = { role: 'user', content: userText, created_at: new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setSending(true);

    try {
      const res = await sendMessage(conversationId, userText);
      if (res.answer || res.agentMessage) {
        const agentContent = res.answer || res.agentMessage?.content;
        const citations = res.citations || res.agentMessage?.citations_json;
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: agentContent, citations }
        ]);
      }
      if (res.approvalPending || res.approval_pending) {
        const appObj = {
          role: 'approval',
          approvalId: res.approvalId || res.approval_id || `app-${Date.now()}`,
          reason: res.toolUsed || res.tool_used || 'High-Risk Action Approval',
          actionType: res.actionType,
          actionPayload: res.actionPayload
        };
        setMessages((prev) => [...prev, appObj]);
      }
    } catch (err) {
      console.error('Send message error:', err);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '⚠️ Sorry, there was an error processing your request. Please try again.' }
      ]);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleApprovalDecision = async (approvalId, decision) => {
    try {
      await patchApproval(approvalId, decision);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.approvalId === approvalId
            ? { ...msg, decision }
            : msg
        )
      );
    } catch (err) {
      console.error('Failed to submit approval:', err);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.headerBar}>
        <div className={styles.headerInfo}>
          <span className={styles.convoTag}>ID: {conversationId}</span>
          <h2 className={styles.convoTitle}>Customer Support Assistant</h2>
        </div>
      </div>

      <div className={styles.messagesArea}>
        {loading ? (
          <div className={styles.loadingBox}>
            <LoadingSpinner text="Fetching message history..." />
          </div>
        ) : messages.length === 0 ? (
          <div className={styles.emptyPrompt}>
            <div className={styles.emptyIcon}>👋</div>
            <h3>How can we help you today?</h3>
            <p>Type your inquiry below to start chatting with the Customer Support Agent.</p>
          </div>
        ) : (
          messages.map((msg, index) => {
            if (msg.role === 'approval') {
              return (
                <ApprovalCard
                  key={msg.approvalId || index}
                  approvalId={msg.approvalId}
                  reason={msg.reason}
                  actionType={msg.actionType}
                  actionPayload={msg.actionPayload}
                  onDecision={handleApprovalDecision}
                />
              );
            }
            return <MessageBubble key={index} message={msg} />;
          })
        )}

        {sending && (
          <div className={styles.sendingIndicator}>
            <LoadingSpinner text="Agent is thinking & executing tools..." />
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form className={styles.inputContainer} onSubmit={handleSend}>
        <textarea
          className={styles.textInput}
          rows={1}
          placeholder="Ask a question, request support, or trigger tools (e.g. refund)..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          type="submit"
          disabled={!input.trim() || sending}
          className={styles.sendBtn}
        >
          <span>Send</span>
          <span className={styles.sendIcon}>➔</span>
        </button>
      </form>
    </div>
  );
}
