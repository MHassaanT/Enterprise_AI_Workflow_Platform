'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { getToken } from '@/lib/api';

export default function AuthGuard({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    // Exclude /login page from protection check
    if (pathname === '/login') {
      setAuthorized(true);
      return;
    }

    const token = getToken();
    if (!token) {
      setAuthorized(false);
      router.replace('/login');
    } else {
      setAuthorized(true);
    }
  }, [pathname, router]);

  if (!authorized && pathname !== '/login') {
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
