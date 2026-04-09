'use client';

import { SWRConfig } from 'swr';

/**
 * Shared SWR defaults for staff dashboard: dedupe requests and avoid refetch on every tab focus.
 */
export function DashboardSWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        revalidateOnFocus: false,
        /** Coalesce duplicate in-flight requests; aligns with ~60s “fresh enough” staff dashboard reads. */
        dedupingInterval: 60_000,
        errorRetryCount: 2,
      }}
    >
      {children}
    </SWRConfig>
  );
}
