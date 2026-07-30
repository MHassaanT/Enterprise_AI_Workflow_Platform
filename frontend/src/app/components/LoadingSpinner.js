'use client';
import styles from './LoadingSpinner.module.css';

export default function LoadingSpinner({ text = 'Processing...' }) {
  return (
    <div className={styles.spinnerContainer}>
      <div className={styles.spinner}></div>
      {text && <span className={styles.spinnerText}>{text}</span>}
    </div>
  );
}
