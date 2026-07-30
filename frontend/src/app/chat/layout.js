'use client';
import Header from '../components/Header';
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
    <div className="chat-app-root">
      <Header />
      <div className="chat-app-body">
        <ConversationList activeId={conversationId} onSelect={handleSelect} />
        <main className="chat-main-area">
          {children}
        </main>
      </div>
      <style jsx global>{`
        .chat-app-root {
          display: flex;
          flex-direction: column;
          min-height: 100vh;
          background: #fdfdfd;
        }
        .chat-app-body {
          display: flex;
          flex: 1;
          height: calc(100vh - 60px);
          overflow: hidden;
        }
        .chat-main-area {
          flex: 1;
          display: flex;
          flex-direction: column;
          background: #fafafa;
          height: 100%;
          overflow: hidden;
        }
        @media (max-width: 768px) {
          .chat-app-body {
            flex-direction: column;
            height: auto;
          }
        }
      `}</style>
    </div>
  );
}
