'use client';
import React, { useEffect, useState } from 'react';
import { fetchConversations, createConversation } from '../../lib/api';
import Link from 'next/link';
import styles from './ConversationList.module.css';

export default function ConversationList({ activeId, onSelect }) {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

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

  return (
    <aside className={styles.sidebar}>
      <div className={styles.headerArea}>
        <h2 className={styles.title}>Support Conversations</h2>
        <button
          onClick={handleNewChat}
          disabled={creating}
          className={styles.newChatBtn}
        >
          {creating ? '...' : '+ New Chat'}
        </button>
      </div>

      {loading ? (
        <div className={styles.loadingState}>Loading conversations...</div>
      ) : conversations.length === 0 ? (
        <div className={styles.emptyState}>No conversations found.</div>
      ) : (
        <div className={styles.list}>
          {conversations.map((c) => {
            const isActive = String(c.id) === String(activeId);
            return (
              <Link
                key={c.id}
                href={`/chat/${c.id}`}
                className={`${styles.card} ${isActive ? styles.activeCard : ''}`}
                onClick={() => onSelect && onSelect(c.id)}
              >
                <div className={styles.cardHeader}>
                  <span className={styles.cardIcon}>💬</span>
                  <h3 className={styles.cardTitle}>{c.title || `Chat #${String(c.id).slice(0, 6)}`}</h3>
                </div>
                <div className={styles.cardFooter}>
                  <span className={styles.timeText}>
                    {c.created_at ? new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recently'}
                  </span>
                  {isActive && <span className={styles.activeDot}>Active</span>}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </aside>
  );
}
