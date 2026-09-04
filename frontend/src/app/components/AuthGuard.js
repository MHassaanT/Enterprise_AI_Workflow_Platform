'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { getToken, getUser } from '@/lib/api';
import { canAccessRoute } from '@/lib/planGating';

const isPublicRoute = (path) =>
  path === '/' ||
  path === '/login' ||
  path === '/signup' ||
  path === '/subscribe' ||
  path === '/verify-email' ||
  path === '/terms' ||
  path === '/privacy' ||
  path?.startsWith('/attendance');

export default function AuthGuard({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    // Exclude public pages from protection check
    if (isPublicRoute(pathname)) {
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

  const isPublicPage = isPublicRoute(pathname);

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
