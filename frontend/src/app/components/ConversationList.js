import React, { useEffect, useState } from 'react';
import { fetchConversations } from '@/src/lib/api';
import Link from 'next/link';
import styles from './ConversationList.module.css';

export default function ConversationList({ selectedId, onSelect }) {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);

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

  if (loading) return <div className={styles.loading}>Loading conversations...</div>;

  return (
    <div className={styles.list}>
      {conversations.map((c) => (
        <Link
          key={c.id}
          href={`/chat/${c.id}`}
          className={`${styles.card} ${c.id === selectedId ? styles.active : ''}`}
          onClick={() => onSelect && onSelect(c.id)}
        >
          <h3>{c.title || 'Untitled Conversation'}</h3>
          <p>{new Date(c.created_at).toLocaleString()}</p>
        </Link>
      ))}
    </div>
  );
}
