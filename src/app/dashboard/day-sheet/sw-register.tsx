'use client';

import { useEffect, useState } from 'react';

export function SwRegister() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.error('SW registration failed:', err);
      });
    }

    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);

    if (!navigator.onLine) {
      setOffline(true);
    }

    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);

    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      className="mb-3 rounded-md bg-amber-100 border border-amber-300 px-4 py-2 text-sm text-amber-900"
    >
      <p className="font-medium">You are offline — showing cached data</p>
      <p className="text-amber-700">Data may be stale</p>
    </div>
  );
}
