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

        {citations.length > 0 && (
          <div className={styles.citationsContainer}>
            <div className={styles.citationsHeader}>
              <span>📚 References & Sources ({citations.length})</span>
            </div>
            <div className={styles.citationsList}>
              {citations.map((cite, idx) => (
                <div key={idx} className={styles.citationBadge}>
                  <span className={styles.citeIndex}>[{idx + 1}]</span>
                  <span className={styles.citeDoc}>{cite.documentName || cite.document_name || 'Document'}</span>
                  {cite.section && <span className={styles.citeSec}> • {cite.section}</span>}
                  {cite.score && (
                    <span className={styles.citeScore}>
                      ({Math.round(cite.score * 100)}% match)
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
