'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/browser';

export type LiveSyncState = 'live' | 'reconnecting';

export type PostgresLiveSubscription = {
  table: string;
  /** Supabase realtime filter, e.g. `venue_id=eq.${venueId}` */
  filter?: string;
  /** When set, receives postgres change payloads instead of the shared `onRefresh`. */
  handler?: (payload: {
    new?: Record<string, unknown>;
    old?: Record<string, unknown>;
  }) => void;
};

export const DASHBOARD_LIVE_POLL_MS = 30_000;

interface UseVenuePostgresLiveSyncOptions {
  venueId?: string;
  /** Called for subscription events without a custom handler, and during polling fallback. */
  onRefresh: () => void;
  subscriptions: PostgresLiveSubscription[];
  pollMs?: number;
  /** When false, skips subscribing (e.g. missing venue id). */
  enabled?: boolean;
}

/**
 * Subscribe to Supabase postgres changes for staff dashboard views, with polling fallback
 * while the channel is reconnecting (same pattern as day sheet / table grid).
 */
export function useVenuePostgresLiveSync({
  venueId,
  onRefresh,
  subscriptions,
  pollMs = DASHBOARD_LIVE_POLL_MS,
  enabled = true,
}: UseVenuePostgresLiveSyncOptions): LiveSyncState {
  const [state, setState] = useState<LiveSyncState>('reconnecting');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasSubscribedRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);
  const subscriptionsRef = useRef(subscriptions);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
    subscriptionsRef.current = subscriptions;
  });

  const subscriptionKey = subscriptions
    .map((sub) => `${sub.table}:${sub.filter ?? ''}:${sub.handler ? 'h' : 'r'}`)
    .join('|');

  /** Single stable dependency — React requires useEffect deps to stay a constant length. */
  const effectSignature = `${enabled ? '1' : '0'}|${venueId ?? ''}|${pollMs}|${subscriptionKey}`;

  useEffect(() => {
    if (!enabled || !venueId || subscriptionsRef.current.length === 0) {
      return undefined;
    }

    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const handlePayload = (
      sub: PostgresLiveSubscription,
      payload: { new?: Record<string, unknown>; old?: Record<string, unknown> },
    ) => {
      if (sub.handler) {
        sub.handler(payload);
        return;
      }
      onRefreshRef.current();
    };

    channel = supabase.channel(`venue-postgres-live-${venueId}-${subscriptionsRef.current.map((s) => s.table).join('-')}`);

    for (let index = 0; index < subscriptionsRef.current.length; index += 1) {
      const subscriptionIndex = index;
      channel = channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: subscriptionsRef.current[subscriptionIndex]!.table,
          ...(subscriptionsRef.current[subscriptionIndex]!.filter
            ? { filter: subscriptionsRef.current[subscriptionIndex]!.filter }
            : {}),
        },
        (payload) => {
          const sub = subscriptionsRef.current[subscriptionIndex];
          if (!sub) return;
          handlePayload(sub, payload as { new?: Record<string, unknown>; old?: Record<string, unknown> });
        },
      );
    }

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        const hadConnectionBefore = hasSubscribedRef.current;
        hasSubscribedRef.current = true;
        setState('live');
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
        if (hadConnectionBefore) {
          onRefreshRef.current();
        }
      } else {
        setState('reconnecting');
        if (!pollRef.current) {
          pollRef.current = setInterval(() => {
            onRefreshRef.current();
          }, pollMs);
        }
      }
    });

    return () => {
      hasSubscribedRef.current = false;
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [effectSignature]);

  return state;
}
