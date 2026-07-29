import Link from 'next/link';
import styles from './page.module.css';

export default function LandingPage() {
  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Enterprise AI Workflow Platform</h1>
      <div className={styles.cardGrid}>
        <Link href="/chat" className={styles.agentCard}>
          <h2>Customer Support Agent</h2>
          <p>Start a conversation with the AI support agent.</p>
        </Link>
      </div>
    </div>
  );
}
