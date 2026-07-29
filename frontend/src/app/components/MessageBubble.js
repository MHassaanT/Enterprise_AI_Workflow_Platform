"use client";

import React from 'react';
import styles from './MessageBubble.module.css';

export default function MessageBubble({ message }) {
  const isUser = message.role === 'user';
  const bubbleClass = isUser ? styles.userBubble : styles.assistantBubble;
  return (
    <div className={styles.bubbleWrapper}>
      <div className={bubbleClass}>
        <p>{message.content}</p>
        {message.citations && (
          <div className={styles.citations}>
            {message.citations.map((c, i) => (
              <sup key={i}>[{i + 1}]</sup>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
