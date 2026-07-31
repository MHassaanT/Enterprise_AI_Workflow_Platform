'use client';
import styles from './MessageBubble.module.css';

export default function MessageBubble({ message }) {
  const isUser = message.role === 'user';
  const citations = message.citations_json || message.citations || [];

  return (
    <div className={`${styles.wrapper} ${isUser ? styles.userWrapper : styles.agentWrapper}`}>
      <div className={styles.avatar}>
        {isUser ? '👤' : '🤖'}
      </div>

      <div className={`${styles.bubble} ${isUser ? styles.userBubble : styles.agentBubble}`}>
        <div className={styles.senderName}>
          {isUser ? 'Customer' : 'AI Support Agent'}
        </div>
        
        <div className={styles.content}>
          {message.content}
        </div>
      </div>
    </div>
  );
}
