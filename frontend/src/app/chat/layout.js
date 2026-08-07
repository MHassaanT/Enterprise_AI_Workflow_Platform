'use client';
import ConversationList from '../components/ConversationList';
import { useParams, useRouter } from 'next/navigation';

export default function ChatLayout({ children }) {
  const params = useParams();
  const router = useRouter();
  const conversationId = params?.conversationId;

  const handleSelect = (id) => {
    router.push(`/chat/${id}`);
  };

  return (
    <div className="flex h-screen overflow-hidden flex-col md:flex-row bg-background text-on-surface font-body-md antialiased">
      <ConversationList activeId={conversationId} onSelect={handleSelect} />
      <main className="flex-1 flex flex-col bg-surface-container-low h-full overflow-hidden">
        {children}
      </main>
    </div>
  );
}
