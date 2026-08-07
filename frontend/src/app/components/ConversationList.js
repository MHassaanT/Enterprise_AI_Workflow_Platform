'use client';
import React, { useEffect, useState } from 'react';
import { fetchConversations, createConversation, clearAllConversations } from '../../lib/api';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function ConversationList({ activeId, onSelect }) {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [clearing, setClearing] = useState(false);
  const router = useRouter();

  useEffect(() => {
    async function load() {
      try {
        const data = await fetchConversations();
        setConversations(data);
      } catch (e) {
        console.error('Failed to load conversations', e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleNewChat = async () => {
    setCreating(true);
    try {
      const newConv = await createConversation(`Customer #${conversations.length + 1}`);
      setConversations((prev) => [newConv, ...prev]);
      if (onSelect) onSelect(newConv.id);
    } catch (err) {
      console.error('Failed to create new conversation:', err);
    } finally {
      setCreating(false);
    }
  };

  const handleClearHistory = async () => {
    if (!confirm('Are you sure you want to clear all chat history for this tenant? This action cannot be undone.')) {
      return;
    }
    setClearing(true);
    try {
      await clearAllConversations();
      setConversations([]);
      const newConv = await createConversation('Customer Session');
      if (newConv && newConv.id) {
        setConversations([newConv]);
        if (onSelect) onSelect(newConv.id);
        router.push(`/chat/${newConv.id}`);
      }
    } catch (err) {
      console.error('Failed to clear chat history:', err);
      alert(err.message || 'Failed to clear chat history.');
    } finally {
      setClearing(false);
    }
  };

  return (
    <aside className="w-full md:w-80 bg-surface border-r border-outline-variant flex flex-col h-full overflow-hidden">
      <div className="p-md border-b border-outline-variant flex items-center justify-between gap-2">
        <h2 className="font-headline-md text-headline-md text-on-surface font-bold">Conversations</h2>
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleNewChat}
            disabled={creating || clearing}
            className="px-md py-1.5 bg-primary text-on-primary font-label-md text-label-md font-semibold rounded-md hover:bg-primary-container transition-colors shadow-sm disabled:opacity-50"
            title="Create New Chat"
          >
            {creating ? '...' : '+ New'}
          </button>
          <button
            onClick={handleClearHistory}
            disabled={clearing || creating}
            className="px-2.5 py-1.5 bg-error-container/20 text-error border border-error/30 font-label-md text-label-md font-semibold rounded-md hover:bg-error-container/40 transition-colors shadow-sm disabled:opacity-50 flex items-center gap-1"
            title="Clear All Chat History"
          >
            <span>🗑️</span>
            <span>{clearing ? '...' : 'Clear'}</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-xl text-center text-on-surface-variant font-body-md">Loading conversations...</div>
      ) : conversations.length === 0 ? (
        <div className="p-xl text-center text-on-surface-variant font-body-md">No conversations found.</div>
      ) : (
        <div className="flex-1 overflow-y-auto p-sm space-y-2">
          {conversations.map((c) => {
            const isActive = String(c.id) === String(activeId);
            return (
              <Link
                key={c.id}
                href={`/chat/${c.id}`}
                className={`block p-md rounded-lg border transition-colors ${isActive ? 'bg-surface-container-high border-primary/40 text-on-surface' : 'bg-surface-container-low border-outline-variant text-on-surface-variant hover:bg-surface-container hover:text-on-surface'}`}
                onClick={() => onSelect && onSelect(c.id)}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-base">💬</span>
                  <h3 className="font-body-md font-semibold text-on-surface truncate">{c.title || `Chat #${String(c.id).slice(0, 6)}`}</h3>
                </div>
                <div className="flex items-center justify-between font-label-md text-label-md text-on-surface-variant">
                  <span>
                    {c.created_at ? new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recently'}
                  </span>
                  {isActive && <span className="px-2 py-0.5 rounded font-mono text-primary bg-primary-container/10 border border-primary/20">Active</span>}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </aside>
  );
}
