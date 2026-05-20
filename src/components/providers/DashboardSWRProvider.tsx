'use client';

import { SWRConfig } from 'swr';
import { VENUE_DETAIL_DEDUPE_MS } from '@/lib/dashboard/venue-detail-swr';

/**
 * Shared SWR defaults for staff dashboard: coalesce duplicate requests without blocking
 * per-hook focus/interval revalidation on detail caches.
 */
export function DashboardSWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        revalidateOnFocus: false,
        dedupingInterval: VENUE_DETAIL_DEDUPE_MS,
        errorRetryCount: 2,
        keepPreviousData: true,
      }}
    >
      {children}
    </SWRConfig>
  );
}
