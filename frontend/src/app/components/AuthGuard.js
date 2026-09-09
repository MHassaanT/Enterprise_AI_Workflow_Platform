'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { getToken, getUser, refreshUser } from '@/lib/api';
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

    let isMounted = true;

    const checkAccess = (currentUser) => {
      const subscriptionStatus = currentUser?.subscriptionStatus;
      const subscriptionPlan = currentUser?.subscriptionPlan;

      // If subscription is expired/canceled/none and user is NOT on the billing page
      // redirect them to billing
      if (pathname !== '/billing') {
        const needsSubscription =
          !subscriptionPlan ||
          subscriptionPlan === 'none' ||
          subscriptionStatus === 'canceled' ||
          subscriptionStatus === 'pending_verification';

        if (needsSubscription) {
          if (isMounted) setAuthorized(false);
          router.replace('/billing');
          return false;
        }
      }

      // Check plan-gated route access
      if (subscriptionPlan && !canAccessRoute(subscriptionPlan, pathname)) {
        return false;
      }

      if (isMounted) setAuthorized(true);
      return true;
    };

    const initialUser = getUser();
    const allowedLocally = checkAccess(initialUser);

    // Refresh user profile from server to ensure fresh plan & status
    refreshUser().then((latestUser) => {
      if (!isMounted) return;
      const allowedServer = checkAccess(latestUser);
      if (!allowedServer && !allowedLocally) {
        // If neither local nor server allows access to this route, redirect to dashboard
        router.replace('/dashboard');
      }
    });

    return () => {
      isMounted = false;
    };
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
