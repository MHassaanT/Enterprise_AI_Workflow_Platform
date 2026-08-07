'use client';

export default function LoadingSpinner({ text = 'Processing...' }) {
  return (
    <div className="flex flex-col items-center justify-center gap-md py-lg">
      <div className="w-8 h-8 border-4 border-outline-variant border-t-primary rounded-full animate-spin"></div>
      {text && <span className="font-label-md text-label-md text-on-surface-variant font-medium">{text}</span>}
    </div>
  );
}
