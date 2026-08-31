'use client';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

/**
 * Email verification landing page.
 * The user arrives here after clicking the verification link in their email.
 * This page calls the backend verify-email endpoint and shows the result.
 * In most cases, the backend will redirect directly to /subscribe,
 * but this page handles the Firebase action code flow.
 */
function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState('verifying'); // 'verifying' | 'success' | 'error'
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');
    const email = searchParams.get('email');
    const oobCode = searchParams.get('oobCode');

    // If we have a token/email, redirect to backend verification endpoint
    if (token && email) {
      window.location.href = `/api/auth/verify-email?token=${token}&email=${encodeURIComponent(email)}`;
      return;
    }

    // If Firebase oobCode, redirect to backend
    if (oobCode) {
      window.location.href = `/api/auth/verify-email?oobCode=${oobCode}&email=${email || ''}`;
      return;
    }

    // No verification params — show error
    setStatus('error');
    setErrorMessage('Invalid or missing verification link. Please request a new one from the signup page.');
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-background text-on-surface font-body-md antialiased flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        {status === 'verifying' && (
          <div className="space-y-4">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary-container/20 border border-primary/30 mx-auto">
              <span className="w-6 h-6 border-3 border-primary border-t-transparent rounded-full animate-spin"></span>
            </div>
            <h1 className="font-display-lg text-2xl font-extrabold text-on-surface">Verifying Your Email...</h1>
            <p className="font-body-md text-sm text-on-surface-variant">Please wait while we verify your email address.</p>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-4">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-error-container/20 border border-error/30 mx-auto">
              <span className="material-symbols-outlined text-error text-3xl">error</span>
            </div>
            <h1 className="font-display-lg text-2xl font-extrabold text-on-surface">Verification Failed</h1>
            <p className="font-body-md text-sm text-on-surface-variant">{errorMessage}</p>
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primary-container text-on-primary font-label-md text-sm font-bold rounded-xl transition-all shadow-lg shadow-primary/20"
            >
              <span className="material-symbols-outlined text-lg">arrow_back</span>
              Back to Sign Up
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-on-surface-variant">Verifying...</div>
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  );
}
