'use client';
import { useEffect, useState, useRef, use } from 'react';
import { fetchMessages, sendMessage, patchApproval } from '@/lib/api';
import MessageBubble from '../../components/MessageBubble';
import ApprovalCard from '../../components/ApprovalCard';
import LoadingSpinner from '../../components/LoadingSpinner';

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
    <div className="flex flex-col h-full bg-surface-container-low overflow-hidden">
      <header className="p-md bg-surface border-b border-outline-variant flex items-center justify-between">
        <div>
          <span className="font-mono-sm text-mono-sm text-on-surface-variant bg-surface-container px-2 py-0.5 rounded border border-outline-variant">ID: {conversationId}</span>
          <h2 className="font-headline-md text-headline-md text-on-surface font-bold mt-1">Customer Support Assistant</h2>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-lg space-y-md">
        {loading ? (
          <div className="p-xl text-center">
            <LoadingSpinner text="Fetching message history..." />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-on-surface-variant space-y-2 py-xl">
            <div className="text-4xl">👋</div>
            <h3 className="font-headline-md text-headline-md text-on-surface">How can we help you today?</h3>
            <p className="font-body-md text-body-md max-w-md">Type your inquiry below to start chatting with the Customer Support Agent.</p>
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
          <div className="py-md text-center">
            <LoadingSpinner text="Agent is thinking & executing tools..." />
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form className="p-md bg-surface border-t border-outline-variant flex gap-md items-center" onSubmit={handleSend}>
        <textarea
          className="flex-1 p-3 bg-surface-container border border-outline-variant rounded-lg text-on-surface focus:outline-none focus:border-primary resize-none font-body-md"
          rows={1}
          placeholder="Ask a question, request support, or trigger tools (e.g. refund)..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          type="submit"
          disabled={!input.trim() || sending}
          className="px-lg py-3 bg-primary text-on-primary font-label-md text-label-md font-semibold rounded-lg hover:bg-primary-container transition-colors disabled:opacity-50 flex items-center gap-2 shadow-sm"
        >
          <span>Send</span>
          <span>➔</span>
        </button>
      </form>
    </div>
  );
}
