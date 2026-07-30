'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { fetchConversations, createConversation } from '@/lib/api';

export default function ChatIndexPage() {
  const router = useRouter();

  useEffect(() => {
    async function init() {
      try {
        const conversations = await fetchConversations();
        if (conversations && conversations.length > 0) {
          router.replace(`/chat/${conversations[0].id}`);
        } else {
          const newConv = await createConversation('Customer Session');
          if (newConv && newConv.id) {
            router.replace(`/chat/${newConv.id}`);
          }
        }
      } catch (err) {
        console.error('Failed to init conversation redirect:', err);
      }
    }
    init();
  }, [router]);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      color: '#64748b',
      fontSize: '0.95rem'
    }}>
      Loading Customer Support Workspace...
    </div>
  );
}
