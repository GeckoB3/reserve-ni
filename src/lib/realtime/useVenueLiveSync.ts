'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/browser';

type LiveState = 'live' | 'reconnecting';

interface UseVenueLiveSyncOptions {
  venueId?: string;
  date?: string;
  onChange: () => void;
  pollMs?: number;
}

export function useVenueLiveSync({
  venueId,
  date,
  onChange,
  pollMs = 30000,
}: UseVenueLiveSyncOptions): LiveState {
  const [state, setState] = useState<LiveState>('reconnecting');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasSubscribedRef = useRef(false);
  const venueTableIdsRef = useRef<Set<string>>(new Set());
  const venueBookingIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!venueId) return;

    const supabase = createClient();
    const handleBookingsChange = (payload: { new?: { booking_date?: string | null }; old?: { booking_date?: string | null } }) => {
      if (!date) {
        onChange();
        return;
      }
      const newDate = payload.new?.booking_date ?? null;
      const oldDate = payload.old?.booking_date ?? null;
      if (newDate === date || oldDate === date) {
        onChange();
      }
    };
    const handleTableBlocksChange = (payload: { new?: { start_at?: string | null; end_at?: string | null }; old?: { start_at?: string | null; end_at?: string | null } }) => {
      if (!date) {
        onChange();
        return;
      }
      const inDate = (startAt?: string | null, endAt?: string | null) => {
        if (!startAt || !endAt) return false;
        const start = startAt.slice(0, 10);
        const end = endAt.slice(0, 10);
        return start <= date && end >= date;
      };
      if (inDate(payload.new?.start_at, payload.new?.end_at) || inDate(payload.old?.start_at, payload.old?.end_at)) {
        onChange();
      }
    };
    const handleAssignmentsChange = (payload: {
      new?: { table_id?: string | null; booking_id?: string | null };
      old?: { table_id?: string | null; booking_id?: string | null };
    }) => {
      const tableId = payload.new?.table_id ?? payload.old?.table_id ?? null;
      const bookingId = payload.new?.booking_id ?? payload.old?.booking_id ?? null;
      if ((tableId && venueTableIdsRef.current.has(tableId)) || (bookingId && venueBookingIdsRef.current.has(bookingId))) {
        onChange();
      }
    };

    const handleTableStatusChange = (payload: {
      new?: { table_id?: string | null };
      old?: { table_id?: string | null };
    }) => {
      const tableId = payload.new?.table_id ?? payload.old?.table_id ?? null;
      if (tableId && venueTableIdsRef.current.has(tableId)) {
        onChange();
      }
    };

    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    const bootstrap = async () => {
      const [tablesRes, bookingsRes] = await Promise.all([
        supabase.from('venue_tables').select('id').eq('venue_id', venueId),
        date
          ? supabase.from('bookings').select('id').eq('venue_id', venueId).eq('booking_date', date)
          : supabase.from('bookings').select('id').eq('venue_id', venueId),
      ]);

      if (cancelled) return;

      venueTableIdsRef.current = new Set((tablesRes.data ?? []).map((row: { id: string }) => row.id));
      venueBookingIdsRef.current = new Set((bookingsRes.data ?? []).map((row: { id: string }) => row.id));

      channel = supabase
        .channel(`venue-live-sync-${venueId}-${date ?? 'all'}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings', filter: `venue_id=eq.${venueId}` }, handleBookingsChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'booking_table_assignments' }, handleAssignmentsChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'table_statuses' }, handleTableStatusChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'table_blocks', filter: `venue_id=eq.${venueId}` }, handleTableBlocksChange)
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            const hadConnectionBefore = hasSubscribedRef.current;
            hasSubscribedRef.current = true;
            setState('live');
            if (pollRef.current) {
              clearInterval(pollRef.current);
              pollRef.current = null;
            }
            if (hadConnectionBefore) {
              onChange();
            }
          } else {
            setState('reconnecting');
            if (!pollRef.current) {
              pollRef.current = setInterval(onChange, pollMs);
            }
          }
        });
    };
    void bootstrap();

    return () => {
      cancelled = true;
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [venueId, date, onChange, pollMs]);

  return state;
}
