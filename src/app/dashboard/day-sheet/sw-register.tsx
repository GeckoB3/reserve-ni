'use client';

import { useEffect, useSyncExternalStore } from 'react';

function subscribeOnlineStatus(cb: () => void) {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
}

function getOnlineSnapshot() {
  return navigator.onLine;
}

export function SwRegister() {
  const online = useSyncExternalStore(subscribeOnlineStatus, getOnlineSnapshot, () => true);
  const offline = !online;

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.error('SW registration failed:', err);
      });
    }
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      className="mb-3 rounded-md bg-amber-100 border border-amber-300 px-4 py-2 text-sm text-amber-900"
    >
      <p className="font-medium">You are offline - showing cached data</p>
      <p className="text-amber-700">Data may be stale</p>
    </div>
  );
}
