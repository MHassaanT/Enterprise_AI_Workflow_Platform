'use client';

export default function MessageBubble({ message }) {
  const isUser = message.role === 'user';
  const citations = message.citations_json || message.citations || [];

  return (
    <div className={`flex gap-3 mb-4 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className="w-8 h-8 rounded-full bg-surface-container border border-outline-variant flex items-center justify-center text-sm flex-shrink-0">
        {isUser ? '👤' : '🤖'}
      </div>

      <div className={`max-w-[80%] rounded-xl p-md space-y-1 ${isUser ? 'bg-primary text-on-primary rounded-tr-none' : 'bg-surface-container-high border border-outline-variant text-on-surface rounded-tl-none'}`}>
        <div className={`font-label-md text-label-md font-semibold ${isUser ? 'text-on-primary/80' : 'text-on-surface-variant'}`}>
          {isUser ? 'Customer' : 'AI Support Agent'}
        </div>
        
        <div className="font-body-md text-body-md whitespace-pre-wrap leading-relaxed">
          {message.content}
        </div>
      </div>
    </div>
  );
}
