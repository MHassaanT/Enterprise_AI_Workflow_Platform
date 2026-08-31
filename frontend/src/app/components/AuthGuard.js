'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { getToken, getUser } from '@/lib/api';
import { canAccessRoute } from '@/lib/planGating';

export default function AuthGuard({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    // Exclude public pages from protection check
    const isPublic =
      pathname === '/' ||
      pathname === '/login' ||
      pathname === '/signup' ||
      pathname === '/subscribe' ||
      pathname === '/verify-email' ||
      pathname.startsWith('/attendance');

    if (isPublic) {
      setAuthorized(true);
      return;
    }

    const token = getToken();
    if (!token) {
      setAuthorized(false);
      router.replace('/login');
      return;
    }

    // Check subscription status for non-billing pages
    const user = getUser();
    const subscriptionStatus = user?.subscriptionStatus;
    const subscriptionPlan = user?.subscriptionPlan;

    // If subscription is expired/canceled/none and user is NOT on the billing page
    // redirect them to billing
    if (pathname !== '/billing') {
      const needsSubscription =
        !subscriptionPlan ||
        subscriptionPlan === 'none' ||
        subscriptionStatus === 'canceled' ||
        subscriptionStatus === 'pending_verification';

      if (needsSubscription) {
        setAuthorized(false);
        router.replace('/billing');
        return;
      }
    }

    // Check plan-gated route access
    if (subscriptionPlan && !canAccessRoute(subscriptionPlan, pathname)) {
      // User is trying to access a route not included in their plan
      router.replace('/dashboard');
      return;
    }

    setAuthorized(true);
  }, [pathname, router]);

  const isPublicPage =
    pathname === '/' ||
    pathname === '/login' ||
    pathname === '/signup' ||
    pathname === '/subscribe' ||
    pathname === '/verify-email' ||
    pathname.startsWith('/attendance');

  if (!authorized && !isPublicPage) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: '#fdfdfd',
        color: '#64748b',
        fontSize: '0.95rem'
      }}>
        Authenticating session...
      </div>
    );
  }

  return children;
}
