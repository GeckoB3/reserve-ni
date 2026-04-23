'use client';

import { SummaryStrip } from '@/components/ui/dashboard/SummaryStrip';
import type { NextBookingsSlotSummary } from '@/lib/table-management/next-bookings-slot';

interface Props {
  summary: {
    total_covers_booked: number;
    total_covers_capacity: number;
    tables_in_use: number;
    tables_total: number;
    unassigned_count: number;
    combos_in_use?: number;
    covers_in_use_now?: number;
    next_bookings_slot?: NextBookingsSlotSummary | null;
  };
}

export function SummaryBar({ summary }: Props) {
  return <SummaryStrip summary={summary} />;
}
